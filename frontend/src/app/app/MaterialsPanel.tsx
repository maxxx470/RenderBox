'use client';

// The project's OLD materials sheet (the Material table). Since étape 3C.3 the
// engine gets the materials of the source image instead (NodeMaterialsPanel);
// this sheet is no longer sent, so it is folded away under a title that says
// so, and nothing here changes its values — the edit form that used PATCH
// /materials/[materialId] is gone (étape 3C.4).
//
// Since étape 3C.5.4 the user may attach rows of it to the selected image —
// explicitly, one image, after a confirmation. Each row says where it stands:
// available, applied to this image, or attached to another one (a row
// applies to one image only). The server decides what can be attached; the
// state of the selection lives in legacy-attach-state.ts.

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Danger } from 'react-iconly';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { FOCUSABLE_SELECTOR, focusFirst, trapTabIndex } from './hide-dialog-focus';
import {
  ATTACH_MAX_ROWS,
  availabilityOf,
  selectedRows,
  type LegacyAttachController,
  type LegacyAttachState,
  type SubmitResult,
} from './legacy-attach-state';
import { PRIMARY_BTN, SECONDARY_BTN } from './materials-buttons';
import type { AttachBlockReason } from './node-materials-client';
import { knownErrorKey } from './node-materials-messages';

export interface MaterialRow {
  id: string;
  face: string;
  valeur: string;
  source: 'auto' | 'manuel';
  confidence: number | null;
  /**
   * Attach mark (étape 3C.5.3): attached to an image or not; the image and
   * the date only when that image is one of this project's. Absent when the
   * sheet was read without them — such a row is never offered for attaching.
   */
  attached?: boolean;
  attachedNodeId?: string | null;
  attachedAt?: string | null;
}

/** What the sheet needs to attach rows to the selected image. */
export interface LegacyAttachProps {
  state: LegacyAttachState;
  controller: LegacyAttachController;
  /** The selected image's name; null when no image is selected. */
  targetName: string | null;
  /** An image of this project by id, named as the tree names it. */
  nameOf: (nodeId: string) => string | null;
  /** Sends the confirmed selection; the caller applies the answer. */
  onSubmit: () => Promise<SubmitResult>;
  /** Reads the sheet and the image's materials again. */
  onReload: () => void;
}

const REASON_KEYS: Record<AttachBlockReason, TranslationKey> = {
  not_found: 'app.legacyAttachReasonNotFound',
  attached_elsewhere: 'app.legacyAttachReasonElsewhere',
  invalid_face: 'app.legacyAttachReasonInvalidFace',
  invalid_value: 'app.legacyAttachReasonInvalidValue',
  face_corrected: 'app.legacyAttachReasonFaceCorrected',
  face_masked: 'app.legacyAttachReasonFaceMasked',
  duplicate_face: 'app.legacyAttachReasonDuplicate',
};

const faceText = (face: string) => face.replace(/_/g, ' ');

/** Where a row stands, in words: available, here, or on another image. */
function RowStatus({ row, attach }: { row: MaterialRow; attach: LegacyAttachProps | null }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const availability = availabilityOf(row, attach?.state.targetNodeId ?? null);
  if (availability === 'unknown') return null;
  const date = row.attachedAt
    ? new Date(row.attachedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;
  let text: string;
  if (availability === 'available') text = t('app.legacyAttachStatusAvailable');
  else if (availability === 'here') {
    text = date
      ? t('app.legacyAttachStatusHere', { date })
      : t('app.legacyAttachStatusHereUndated');
  } else {
    const name = row.attachedNodeId ? (attach?.nameOf(row.attachedNodeId) ?? null) : null;
    text = !name
      ? t('app.legacyAttachStatusElsewhereUnnamed')
      : date
        ? t('app.legacyAttachStatusElsewhere', { image: name, date })
        : t('app.legacyAttachStatusElsewhereUndated', { image: name });
  }
  return (
    <span
      className={`text-[10.5px] leading-snug ${
        availability === 'here' ? 'font-medium text-[#1E36D6]' : 'text-[#8A8896]'
      }`}
    >
      {text}
    </span>
  );
}

function RowBody({ row, children }: { row: MaterialRow; children?: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      <span className="flex items-center justify-between gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[#8A8896]">
        <span className="min-w-0 truncate" title={row.face}>
          {faceText(row.face)}
        </span>
        <span className="flex-shrink-0 normal-case tracking-normal">
          {row.source === 'manuel'
            ? t('app.nodeMaterialsLegacyManual')
            : t('app.nodeMaterialsLegacyAuto')}
        </span>
      </span>
      <span className="block text-[12px] leading-snug text-[#6B6878] [overflow-wrap:anywhere]">
        {row.valeur}
      </span>
      {children}
    </>
  );
}

/** Confirms the attach: which image, how many rows, which values. */
function AttachDialog({
  image,
  rows,
  busy,
  onConfirm,
  onClose,
}: {
  image: string;
  rows: MaterialRow[];
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const ids = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Confirmed: the sheet places the focus once the server answered.
  const confirmed = useRef(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busyRef.current) onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      const next = trapTabIndex(
        controls.length,
        controls.indexOf(document.activeElement as HTMLElement),
        e.shiftKey,
      );
      e.preventDefault();
      controls[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!confirmed.current) focusFirst([opener]);
    };
    // Once per opening, as the Masquer confirmation (NodeMaterialsPanel).
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={() => {
          if (!busy) onClose();
        }}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        aria-busy={busy || undefined}
        className="relative flex max-h-[80vh] w-full max-w-[380px] flex-col rounded-2xl bg-white p-5 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]"
      >
        <h2
          id={`${ids}-title`}
          className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F] [overflow-wrap:anywhere]"
        >
          {t('app.legacyAttachDialogTitle', { n: rows.length, image })}
        </h2>
        <p id={`${ids}-body`} className="mb-3 text-[13px] leading-relaxed text-[#6B6878]">
          {t('app.legacyAttachDialogBody')}
        </p>
        <ul className="mb-4 flex min-h-0 flex-col gap-1.5 overflow-y-auto rounded-xl bg-[#F7F7FA] p-2.5">
          {rows.map((row) => (
            <li key={row.id} className="min-w-0 text-[12px] leading-snug text-[#3D3B49]">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[#8A8896]">
                {faceText(row.face)}
              </span>{' '}
              <span className="[overflow-wrap:anywhere]">{row.valeur}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className={SECONDARY_BTN}
          >
            {t('app.materialsCancelButton')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              confirmed.current = true;
              onConfirm();
            }}
            className={PRIMARY_BTN}
          >
            {busy ? '…' : t('app.legacyAttachConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The sheet while rows are being ticked for the selected image. */
function SelectingSheet({
  materials,
  attach,
}: {
  materials: MaterialRow[];
  attach: LegacyAttachProps;
}) {
  const t = useTranslations();
  const { state, controller, targetName } = attach;
  const alertRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const n = state.selected.length;
  const submitting = state.phase === 'submitting';

  async function confirm() {
    const result = await attach.onSubmit();
    if (result.kind === 'failure' && !result.stale) {
      // The selection is back: the reasons are in the alert and on the rows.
      focusFirst([alertRef.current, reviewRef.current]);
    } else if (result.kind === 'success' && !result.stale) {
      // The sheet folds back; its summary takes the focus.
      requestAnimationFrame(() => focusFirst([document.getElementById('legacy-sheet-summary')]));
    }
  }

  const errorText =
    state.error === 'blocked'
      ? t('app.legacyAttachBlocked')
      : state.error === 'conflict'
        ? t('app.legacyAttachConflict')
        : state.error
          ? t(knownErrorKey(state.error) ?? 'app.legacyAttachErrorUnknown')
          : null;

  return (
    <div ref={sheetRef} className="mt-4 rounded-xl bg-[#F7F7FA] p-3">
      <p className="mb-1 text-[11px] font-medium leading-snug text-[#6B6878]">
        {t('app.nodeMaterialsLegacyTitle')}
      </p>
      <p className="mb-2.5 text-[11px] leading-relaxed text-[#8A8896]">
        {t('app.legacyAttachIntro', { image: targetName ?? '' })}
      </p>

      {errorText && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="mb-2.5 rounded-lg bg-[#FFF4F4] p-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5484D]"
        >
          <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[#B42318]">
            <Danger set="curved" size={14} primaryColor="#E5484D" />
            <span>{errorText}</span>
          </p>
          {state.error === 'conflict' && (
            <button type="button" onClick={attach.onReload} className={`${SECONDARY_BTN} mt-2`}>
              {t('app.legacyAttachReload')}
            </button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1.5">
        {materials.map((row) => {
          const availability = availabilityOf(row, state.targetNodeId);
          const ticked = state.selected.includes(row.id);
          const reason = state.blocked[row.id];
          const reasonId = `legacy-reason-${row.id}`;
          const why = reason
            ? t(REASON_KEYS[reason])
            : availability === 'elsewhere'
              ? t('app.legacyAttachWhyElsewhere')
              : null;
          const content = (
            <RowBody row={row}>
              <span className="mt-1 block">
                <RowStatus row={row} attach={attach} />
              </span>
              {why && (
                <span
                  id={reasonId}
                  className={`mt-0.5 block text-[10.5px] leading-snug ${
                    reason ? 'text-[#B42318]' : 'text-[#8A8896]'
                  }`}
                >
                  {why}
                </span>
              )}
            </RowBody>
          );
          // A free row (or one ticked before the sheet was read again) is a
          // checkbox; the others say why they cannot be ticked.
          if (availability === 'available' || ticked) {
            return (
              <li key={row.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ticked}
                  aria-describedby={why ? reasonId : undefined}
                  disabled={submitting}
                  onClick={() => controller.toggle(row)}
                  className={`flex min-h-11 w-full min-w-0 items-start gap-2.5 rounded-lg bg-white px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-[#2948FC] disabled:opacity-60 ${
                    reason ? 'shadow-[inset_0_0_0_1.5px_#E5484D]' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${
                      ticked ? 'bg-[#2948FC]' : 'bg-white shadow-[inset_0_0_0_1.5px_#DEDEE8]'
                    }`}
                  >
                    {ticked && (
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">{content}</span>
                </button>
              </li>
            );
          }
          return (
            <li
              key={row.id}
              className="min-w-0 rounded-lg bg-white/60 px-2.5 py-2"
              aria-describedby={why ? reasonId : undefined}
            >
              {content}
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[10.5px] text-[#8A8896]" aria-live="polite">
        {t('app.legacyAttachCount', { n, max: ATTACH_MAX_ROWS })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          ref={reviewRef}
          type="button"
          disabled={n === 0 || n > ATTACH_MAX_ROWS || submitting}
          onClick={() => controller.review()}
          className={PRIMARY_BTN}
        >
          {t('app.legacyAttachReview')}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => controller.cancel()}
          className={SECONDARY_BTN}
        >
          {t('app.materialsCancelButton')}
        </button>
      </div>

      {(state.phase === 'confirming' || submitting) && (
        <AttachDialog
          image={targetName ?? ''}
          rows={selectedRows(materials, state.selected)}
          busy={submitting}
          onConfirm={() => void confirm()}
          onClose={() => controller.back()}
        />
      )}
    </div>
  );
}

export function LegacyMaterialsSheet({
  materials,
  attach = null,
}: {
  materials: MaterialRow[];
  /** null: no image to attach to (the image generator page). */
  attach?: LegacyAttachProps | null;
}) {
  const t = useTranslations();
  if (materials.length === 0) return null;

  if (attach && attach.state.phase !== 'idle' && attach.targetName !== null) {
    return <SelectingSheet materials={materials} attach={attach} />;
  }

  const canAttach =
    attach !== null &&
    attach.targetName !== null &&
    materials.some((row) => availabilityOf(row, attach.state.targetNodeId) === 'available');

  return (
    <details className="group mt-4 rounded-xl bg-[#F7F7FA]">
      <summary
        id="legacy-sheet-summary"
        className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-[11px] font-medium leading-snug text-[#6B6878] outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC] min-[900px]:min-h-0 [&::-webkit-details-marker]:hidden"
      >
        <span>{t('app.nodeMaterialsLegacyTitle')}</span>
        <span className="flex flex-shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-white px-1.5 font-[family-name:var(--font-mono)] text-[10px] text-[#8A8896]">
            {materials.length}
          </span>
          <span aria-hidden className="flex transition-transform group-open:rotate-180">
            <ChevronDown set="curved" size={14} primaryColor="#8A8896" />
          </span>
        </span>
      </summary>
      <div className="px-3 pb-3">
        <p className="mb-2.5 text-[11px] leading-relaxed text-[#8A8896]">
          {t('app.nodeMaterialsLegacyBody')}
        </p>
        <dl className="flex flex-col gap-1.5">
          {materials.map((m) => (
            <div key={m.id} className="min-w-0 rounded-lg bg-white px-2.5 py-2">
              <dt className="flex items-center justify-between gap-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[#8A8896]">
                <span className="min-w-0 truncate" title={m.face}>
                  {faceText(m.face)}
                </span>
                <span className="flex-shrink-0 normal-case tracking-normal">
                  {m.source === 'manuel'
                    ? t('app.nodeMaterialsLegacyManual')
                    : t('app.nodeMaterialsLegacyAuto')}
                </span>
              </dt>
              <dd className="text-[12px] leading-snug text-[#6B6878] [overflow-wrap:anywhere]">
                {m.valeur}
              </dd>
              <dd className="mt-1">
                <RowStatus row={m} attach={attach} />
              </dd>
            </div>
          ))}
        </dl>
        {canAttach && attach && (
          <button
            type="button"
            onClick={() => attach.controller.start()}
            className={`${SECONDARY_BTN} mt-2.5 w-full`}
          >
            {t('app.legacyAttachStart')}
          </button>
        )}
      </div>
    </details>
  );
}
