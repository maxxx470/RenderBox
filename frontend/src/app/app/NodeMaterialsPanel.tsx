'use client';

// The materials of the SELECTED image (étape 3C.4) — the top of the
// workspace's right column in Générer mode. What is listed is what the
// engine gets for renders made from this image (étape 3C.3): each face with
// its value, where it comes from (detected, corrected), a removed face kept
// apart from a face with nothing. Changing a face changes this image only.
//
// Nothing shows as saved before the server answers; a failed save keeps what
// was typed; a list that could not be read says so, with a retry — never an
// empty list instead. The logic lives in node-materials-state.ts; this file
// only draws it. The project's old sheet sits folded underneath, read-only
// (LegacyMaterialsSheet).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Danger, Plus, Swap } from 'react-iconly';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { faceDisplayLabel } from './face-labels';
import {
  FOCUSABLE_SELECTOR,
  focusFirst,
  hideFocusPlan,
  trapTabIndex,
  type HideFocusInput,
} from './hide-dialog-focus';
import { faceBadge, holdsLegacyRow } from './face-origin-badge';
import { LegacyMaterialsSheet, type LegacyAttachProps, type MaterialRow } from './MaterialsPanel';
import { PRIMARY_BTN, SECONDARY_BTN } from './materials-buttons';
import type { NodeFaceListItem } from './node-materials-client';
import { actionMessage, knownErrorKey, type ActionMessage } from './node-materials-messages';
import {
  MAX_VALUE_LENGTH,
  checkNewFace,
  checkValue,
  type ActionResult,
  type NodeMaterialsController,
  type NodeMaterialsState,
  type PendingAction,
} from './node-materials-state';

// Touch targets: see materials-buttons.ts; the row actions follow the same rule.
const ROW_ACTION =
  'inline-flex min-h-11 items-center rounded-md px-1.5 text-[11px] font-medium text-[#2948FC] hover:bg-[#EEF1FF] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#2948FC] min-[900px]:min-h-7';
const INPUT =
  'w-full min-w-0 rounded-lg border border-[#DEDEE8] bg-white px-2.5 py-2 text-[13px] text-[#17161F] outline-none focus:border-[#2948FC]';

function OriginBadge({ item }: { item: NodeFaceListItem }) {
  const t = useTranslations();
  // From the server's answer for this face only (étape 3C.5.5).
  const badge = faceBadge(item);
  if (badge === 'hidden') {
    return (
      <span className="flex-shrink-0 rounded-md bg-[#F2F2F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B6878]">
        {t('app.nodeMaterialsHidden')}
      </span>
    );
  }
  if (badge === 'legacy') {
    // A row of the old sheet attached to this image and untouched since: the
    // stored origin says so, never the old sheet itself.
    return (
      <span className="flex-shrink-0 rounded-md bg-[#3D3B49] px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {t('app.nodeMaterialsOriginLegacy')}
      </span>
    );
  }
  if (badge === 'correction') {
    return (
      <span className="flex-shrink-0 rounded-md bg-[#2948FC] px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {t('app.nodeMaterialsOriginCorrection')}
      </span>
    );
  }
  if (badge === 'detection') {
    return (
      <span className="flex-shrink-0 rounded-md bg-[#EEF1FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#1E36D6]">
        {t('app.nodeMaterialsOriginDetection')}
        {item.confidence !== null && (
          <span className="font-normal">
            {' '}
            · {t('app.materialsConfidence', { n: item.confidence })}
          </span>
        )}
      </span>
    );
  }
  return null;
}

function ValueField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  describedBy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string | undefined;
}) {
  const t = useTranslations();
  const check = checkValue(value);
  const length = check.ok ? check.valeur.length : value.trim().length;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[11px] font-medium text-[#6B6878]">
          {label}
        </label>
        <span
          className={`font-[family-name:var(--font-mono)] text-[10px] ${
            length > MAX_VALUE_LENGTH ? 'text-[#E5484D]' : 'text-[#8A8896]'
          }`}
        >
          {t('app.nodeMaterialsCounter', { n: length, max: MAX_VALUE_LENGTH })}
        </span>
      </div>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        aria-invalid={length > MAX_VALUE_LENGTH || undefined}
        className={INPUT}
      />
    </div>
  );
}

function valueProblem(raw: string, t: ReturnType<typeof useTranslations>): string | null {
  const check = checkValue(raw);
  if (check.ok) return null;
  return check.reason === 'empty'
    ? t('app.nodeMaterialsValueEmpty')
    : t('app.nodeMaterialsValueTooLong', { max: MAX_VALUE_LENGTH });
}

function FaceRow({
  item,
  pending,
  onSave,
  onHide,
  onCancel,
  onReload,
}: {
  item: NodeFaceListItem;
  pending: PendingAction | undefined;
  onSave: (raw: string) => Promise<ActionResult>;
  onHide: () => void;
  onCancel: () => Promise<ActionResult>;
  onReload: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ActionMessage | null>(null);
  const label = faceDisplayLabel(item.face, item.faceLabel, locale) || item.face;
  const busy = pending !== undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const p = valueProblem(draft, t);
    setProblem(p);
    if (p) return;
    setError(null);
    const result = await onSave(draft);
    if (result.ok) {
      setEditing(false);
      return;
    }
    // The input stays open with what was typed.
    setError(actionMessage('save', result));
  }

  async function cancelCorrection() {
    // Named after what the button said: back to a detection, or no correction.
    const action = item.detected ? 'restore' : 'cancel';
    setError(null);
    const result = await onCancel();
    setError(actionMessage(action, result));
  }

  const errorText = error ? t(error.key) : null;
  const removed = item.correction === 'removed';

  return (
    // data-face and tabIndex: where the focus waits, and is found again,
    // after a confirmed Masquer (hide-dialog-focus.ts).
    <li
      data-face={item.face}
      tabIndex={-1}
      className={`min-w-0 rounded-xl p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC] ${removed ? 'bg-[#FBFBFD] outline-1 outline-dashed outline-[#DEDEE8]' : 'bg-[#F7F7FA]'}`}
      aria-busy={busy || undefined}
    >
      <div className="mb-1 flex min-w-0 items-start justify-between gap-2">
        <span
          className="min-w-0 truncate font-[family-name:var(--font-mono)] text-[11px] text-[#6B6878]"
          title={label}
        >
          {label}
        </span>
        <OriginBadge item={item} />
      </div>

      {editing ? (
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <ValueField
            id={`${ids}-value`}
            label={t('app.nodeMaterialsAddValue')}
            value={draft}
            onChange={(v) => {
              setDraft(v);
              setProblem(null);
            }}
            autoFocus
            describedBy={problem || errorText ? `${ids}-msg` : undefined}
          />
          {(problem || errorText) && (
            <p id={`${ids}-msg`} role="alert" className="text-[11px] leading-snug text-[#E5484D]">
              {problem ?? errorText}
              {error?.error === 'conflict' && (
                <>
                  {' '}
                  <button type="button" onClick={onReload} className="font-semibold underline">
                    {t('app.nodeMaterialsReload')}
                  </button>
                </>
              )}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={PRIMARY_BTN}>
              {t('app.materialsSaveButton')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setProblem(null);
                setError(null);
              }}
              className={SECONDARY_BTN}
            >
              {t('app.materialsCancelButton')}
            </button>
          </div>
        </form>
      ) : (
        <>
          {removed ? (
            <p className="text-[12px] leading-snug text-[#6B6878]">
              {t('app.nodeMaterialsHiddenBody')}
            </p>
          ) : (
            <p className="text-[13.5px] font-semibold leading-snug text-[#17161F] [overflow-wrap:anywhere]">
              {item.valeur ?? '—'}
            </p>
          )}
          {item.detected && item.origin !== 'detection' && (
            <p className="mt-0.5 text-[11px] leading-snug text-[#8A8896] [overflow-wrap:anywhere]">
              {t('app.nodeMaterialsDetectedUnder', { valeur: item.detected.valeur })}
            </p>
          )}
          {errorText && (
            <p role="alert" className="mt-1.5 text-[11px] leading-snug text-[#E5484D]">
              {errorText}
              {error?.error === 'conflict' && (
                <>
                  {' '}
                  <button type="button" onClick={onReload} className="font-semibold underline">
                    {t('app.nodeMaterialsReload')}
                  </button>
                </>
              )}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-1 gap-y-0.5">
            <button
              type="button"
              disabled={busy}
              data-row-action="edit"
              className={ROW_ACTION}
              onClick={() => {
                setDraft(item.valeur ?? item.detected?.valeur ?? '');
                setProblem(null);
                setError(null);
                setEditing(true);
              }}
            >
              {t('app.materialsEditButton')}
            </button>
            {!removed && item.detected && (
              <button
                type="button"
                disabled={busy}
                data-row-action="hide"
                className={ROW_ACTION}
                onClick={onHide}
              >
                {pending === 'hide' ? '…' : t('app.nodeMaterialsHide')}
              </button>
            )}
            {item.correction !== 'none' && (
              <button
                type="button"
                disabled={busy}
                data-row-action="restore"
                className={ROW_ACTION}
                onClick={() => void cancelCorrection()}
              >
                {pending === 'cancel'
                  ? '…'
                  : item.detected
                    ? t('app.nodeMaterialsRestoreDetection')
                    : t('app.nodeMaterialsCancelCorrection')}
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function AddFaceForm({
  busy,
  onAdd,
  onClose,
  labelOf,
}: {
  busy: boolean;
  onAdd: (label: string, value: string) => Promise<ActionResult>;
  onClose: () => void;
  /** The display name of a face this image lists (for "already listed"). */
  labelOf: (face: string) => string;
}) {
  const t = useTranslations();
  const ids = useId();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ActionMessage | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const face = checkNewFace(label);
    const p = !face.ok
      ? face.reason === 'empty'
        ? t('app.nodeMaterialsFaceEmpty')
        : t('app.nodeMaterialsFaceTooLong')
      : valueProblem(value, t);
    setProblem(p);
    if (p) return;
    setError(null);
    const result = await onAdd(label, value);
    if (result.ok) {
      onClose();
      return;
    }
    // The form stays open with what was typed — also when the face is already
    // listed: the message points to its Modifier, nothing was overwritten.
    setError(actionMessage('add', result));
  }

  const message =
    problem ??
    (error ? t(error.key, error.face !== undefined ? { face: labelOf(error.face) } : {}) : null);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="mt-2.5 flex flex-col gap-2 rounded-xl bg-[#F7F7FA] p-3"
      aria-busy={busy || undefined}
    >
      <div className="min-w-0">
        <label
          htmlFor={`${ids}-face`}
          className="mb-1 block text-[11px] font-medium text-[#6B6878]"
        >
          {t('app.nodeMaterialsAddFace')}
        </label>
        <input
          id={`${ids}-face`}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setProblem(null);
          }}
          placeholder={t('app.nodeMaterialsAddFacePlaceholder')}
          autoFocus
          className={INPUT}
        />
      </div>
      <ValueField
        id={`${ids}-value`}
        label={t('app.nodeMaterialsAddValue')}
        value={value}
        onChange={(v) => {
          setValue(v);
          setProblem(null);
        }}
        placeholder={t('app.nodeMaterialsAddValuePlaceholder')}
        describedBy={message ? `${ids}-msg` : undefined}
      />
      {message && (
        <p id={`${ids}-msg`} role="alert" className="text-[11px] leading-snug text-[#E5484D]">
          {message}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={PRIMARY_BTN}>
          {busy ? '…' : t('app.nodeMaterialsAddSubmit')}
        </button>
        <button type="button" disabled={busy} onClick={onClose} className={SECONDARY_BTN}>
          {t('app.materialsCancelButton')}
        </button>
      </div>
    </form>
  );
}

/** Confirms "Masquer": says what changes, for this image only. */
function HideDialog({
  faceName,
  busy,
  onConfirm,
  onClose,
}: {
  faceName: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const ids = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Confirmed: the panel places the focus itself once the server answers —
  // the opener is disabled meanwhile, then gone (hide-dialog-focus.ts).
  const confirmed = useRef(false);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Tab and Shift+Tab stay inside the confirmation (aria-modal).
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
    // Once per opening: focus the safe choice, give it back on close. onClose
    // only clears the parent's state, so the first one stays right.
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="relative w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]"
      >
        <h2
          id={`${ids}-title`}
          className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F] [overflow-wrap:anywhere]"
        >
          {t('app.nodeMaterialsHideTitle', { face: faceName })}
        </h2>
        <p id={`${ids}-body`} className="mb-4 text-[13px] leading-relaxed text-[#6B6878]">
          {t('app.nodeMaterialsHideBody')}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onClose} className={SECONDARY_BTN}>
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
            {t('app.nodeMaterialsHide')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A confirmed Masquer, once the server answered: where the focus goes next. */
interface FocusAfterHide extends Omit<HideFocusInput, 'after' | 'userMovedFocus'> {
  /** Where the focus was parked while the request ran. */
  parked: Element | null;
}

export function NodeMaterialsPanel({
  state,
  controller,
  nodeName,
  legacy,
  hasImages = true,
  attach = null,
  onLegacyChanged,
}: {
  /**
   * null: no project yet (the image generator page) — nothing to read.
   * Always about the selected image (useNodeMaterials → viewFor).
   */
  state: NodeMaterialsState | null;
  controller: NodeMaterialsController | null;
  /** The selected image's name, as the tree and the breadcrumb name it. */
  nodeName: string | null;
  /** The project's old sheet, shown read-only. */
  legacy: MaterialRow[];
  /** false: the project has no image at all, so there is none to select. */
  hasImages?: boolean;
  /** Attaching rows of the old sheet to this image; null: not offered. */
  attach?: LegacyAttachProps | null;
  /**
   * A face whose correction came from the old sheet was changed: the old
   * row's mark was released by the server (étape 3C.5.3), read the sheet again.
   */
  onLegacyChanged?: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [hiding, setHiding] = useState<NodeFaceListItem | null>(null);
  const [focusAfterHide, setFocusAfterHide] = useState<FocusAfterHide | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // A new image: no form or dialog of the previous one stays open.
  const nodeId = state?.nodeId ?? null;
  useEffect(() => {
    setAdding(false);
    setHiding(null);
  }, [nodeId]);

  const ready = state?.status === 'ready';
  const items = ready ? state.items : [];
  /**
   * Whether the face's correction holds a row of the old sheet, as the server
   * last said — read before the action, which releases that row.
   */
  function heldLegacyRow(face: string): boolean {
    return holdsLegacyRow(items.find((i) => i.face === face));
  }

  /** After a change that went through, on a face that held a row of the old sheet. */
  function legacyTouched(held: boolean, result: ActionResult) {
    if (held && result.ok && !result.stale) onLegacyChanged?.();
  }

  function rowOf(face: string): HTMLElement | null {
    return (
      sectionRef.current?.querySelector<HTMLElement>(`li[data-face="${CSS.escape(face)}"]`) ?? null
    );
  }

  function labelOf(face: string): string {
    const item = items.find((i) => i.face === face);
    return item ? faceDisplayLabel(item.face, item.faceLabel, locale) || item.face : face;
  }

  // After a confirmed Masquer, once the list shows the server's answer: move
  // the focus from where it was parked to the control the plan names.
  useEffect(() => {
    if (!focusAfterHide) return;
    setFocusAfterHide(null);
    const section = sectionRef.current;
    if (!section) return;
    const active = document.activeElement;
    const plan = hideFocusPlan({
      ...focusAfterHide,
      after: Array.from(
        section.querySelectorAll<HTMLElement>('li[data-face]'),
        (el) => el.dataset.face ?? '',
      ),
      userMovedFocus:
        active !== null && active !== document.body && active !== focusAfterHide.parked,
    });
    focusFirst(
      plan.map((step) =>
        step === 'title'
          ? titleRef.current
          : (rowOf(step.face)?.querySelector<HTMLButtonElement>(
              `[data-row-action="${step.action}"]`,
            ) ?? null),
      ),
    );
  }, [focusAfterHide]);

  // A read that failed: what the client could tell of why, if anything.
  const readDetail = state?.status === 'error' && state.error ? knownErrorKey(state.error) : null;

  function told(result: ActionResult, success: TranslationKey) {
    if (result.ok && !result.stale) toast(t(success), 'success');
  }

  async function save(face: string, raw: string) {
    const held = heldLegacyRow(face);
    const result = await controller!.saveValue(face, raw);
    told(result, 'app.nodeMaterialsSaved');
    legacyTouched(held, result);
    return result;
  }

  async function cancel(face: string) {
    const held = heldLegacyRow(face);
    const result = await controller!.cancel(face);
    legacyTouched(held, result);
    if (result.ok && !result.stale) {
      // Says what the server actually did: a detection came back, or the
      // face had none and is gone.
      toast(
        t(
          result.item?.origin === 'detection'
            ? 'app.nodeMaterialsRestored'
            : 'app.nodeMaterialsCorrectionRemoved',
        ),
        'success',
      );
    }
    return result;
  }

  async function add(label: string, value: string) {
    const result = await controller!.add(label, value);
    told(result, 'app.nodeMaterialsAdded');
    return result;
  }

  async function confirmHide() {
    if (!hiding || !controller) return;
    const face = hiding.face;
    const before = items.map((i) => i.face);
    // Park the focus on the face's row (the title if it has none) before the
    // dialog closes: its opener is about to be disabled, then removed.
    focusFirst([rowOf(face), titleRef.current]);
    const parked = document.activeElement;
    setHiding(null);
    const held = heldLegacyRow(face);
    const result = await controller.hide(face);
    told(result, 'app.nodeMaterialsHiddenDone');
    legacyTouched(held, result);
    const message = actionMessage('hide', result);
    if (message) toast(t(message.key), 'error');
    setFocusAfterHide({
      face,
      before,
      parked,
      outcome: result.stale ? 'stale' : result.ok ? 'success' : 'failure',
    });
  }

  return (
    // The top of the workspace's right column, the project tree under it; the
    // column draws the card, this only lays out its part.
    <section
      ref={sectionRef}
      className="min-w-0 px-4 py-4.5"
      aria-labelledby="node-materials-title"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3
          ref={titleRef}
          id="node-materials-title"
          tabIndex={-1}
          className="rounded font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2948FC]"
        >
          {t('app.materialsTitle')}
        </h3>
        {state?.nodeId && (
          <button
            type="button"
            onClick={() => void controller?.reload()}
            disabled={state.status === 'loading'}
            aria-label={t('app.nodeMaterialsReload')}
            title={t('app.nodeMaterialsReload')}
            // 44px to the finger below 900px; the negative margins keep the
            // header's height and the icon's right edge where they were.
            className="-my-2 -mr-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg hover:bg-[#F2F2F5] disabled:opacity-50 min-[900px]:my-0 min-[900px]:mr-0 min-[900px]:h-7 min-[900px]:w-7"
          >
            <Swap set="curved" size={15} primaryColor="#3D3B49" />
          </button>
        )}
      </div>
      {nodeName && state?.nodeId && (
        <p
          className="mb-2 truncate font-[family-name:var(--font-mono)] text-[11px] text-[#17161F]"
          title={nodeName}
        >
          {nodeName}
        </p>
      )}

      {!state || !state.nodeId ? (
        <p className="py-4 text-center text-xs leading-relaxed text-[#6B6878]">
          {!state
            ? t('app.materialsEmptyBody')
            : hasImages
              ? t('app.nodeMaterialsNoImage')
              : t('app.nodeMaterialsNoImageYet')}
        </p>
      ) : state.status === 'error' ? (
        <div role="alert" className="mt-2 rounded-xl bg-[#FFF4F4] p-3">
          <p className="mb-2 flex items-start gap-1.5 text-[12px] leading-snug text-[#B42318]">
            <Danger set="curved" size={15} primaryColor="#E5484D" />
            <span>
              {t('app.nodeMaterialsErrorRead')} {readDetail ? t(readDetail) : null}
            </span>
          </p>
          {state.error !== 'not_found' && (
            <button
              type="button"
              onClick={() => void controller?.reload()}
              className={SECONDARY_BTN}
            >
              {t('app.nodeMaterialsRetry')}
            </button>
          )}
        </div>
      ) : !ready ? (
        <div role="status" className="mt-2 flex flex-col gap-2">
          <span className="sr-only">{t('app.nodeMaterialsLoading')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#F7F7FA]" aria-hidden />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] leading-relaxed text-[#8A8896]">
            {items.length === 0 ? t('app.nodeMaterialsEmpty') : t('app.materialsSubtitle')}
          </p>
          {items.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {items.map((item) => (
                <FaceRow
                  key={item.face}
                  item={item}
                  pending={state.pending[item.face]}
                  onSave={(raw) => save(item.face, raw)}
                  onHide={() => setHiding(item)}
                  onCancel={() => cancel(item.face)}
                  onReload={() => void controller?.reload()}
                />
              ))}
            </ul>
          )}
          {adding ? (
            <AddFaceForm
              busy={Object.values(state.pending).includes('add')}
              onAdd={add}
              onClose={() => setAdding(false)}
              labelOf={labelOf}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#EEF1FF] px-3 text-[12px] font-semibold text-[#1E36D6] hover:bg-[#E3E8FF] min-[900px]:min-h-9"
            >
              <Plus set="curved" size={15} primaryColor="#1E36D6" />
              {t('app.nodeMaterialsAdd')}
            </button>
          )}
          {items.length > 0 && (
            <p className="mt-3 rounded-[10px] bg-[#F7F7FA] p-3 text-[11px] leading-relaxed text-[#8A8896]">
              {t('app.materialsTip')}
            </p>
          )}
        </>
      )}

      <LegacyMaterialsSheet materials={legacy} attach={attach} />

      {hiding && (
        <HideDialog
          faceName={faceDisplayLabel(hiding.face, hiding.faceLabel, locale) || hiding.face}
          busy={state?.pending[hiding.face] !== undefined}
          onConfirm={() => void confirmHide()}
          onClose={() => setHiding(null)}
        />
      )}
    </section>
  );
}
