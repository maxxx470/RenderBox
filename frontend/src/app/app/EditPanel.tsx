'use client';

// Right panel for "retouch"/"add" mode — reference upload or the list of
// comments. Submission, and the variant count since 2026-10-06, live in the
// shared CommandBar at the bottom (one action point across all modes), so
// this panel only holds the controls specific to the active mode.
import { useEffect, useState } from 'react';
import { Upload, CloseSquare } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import type { Pin } from './AnnotationLayer';
import { MAX_ANNOTATIONS } from '@/lib/server/generation/annotations';

export function EditPanel({
  mode,
  canEdit,
  referenceFile,
  onReferenceChange,
  pins,
  onPinsChange,
}: {
  mode: Extract<AppMode, 'retouch' | 'add'>;
  canEdit: boolean;
  referenceFile: File | null;
  onReferenceChange: (file: File | null) => void;
  /** "Commenter" mode: the comments placed on the image, in order. */
  pins: Pin[];
  onPinsChange: (pins: Pin[]) => void;
}) {
  const t = useTranslations();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object URLs are held by the document until explicitly revoked, so each one
  // is released as soon as the file it points at is replaced or cleared.
  useEffect(() => {
    if (!referenceFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(referenceFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceFile]);

  return (
    // Mirrors MaterialsPanel: outlined panel on desktop, opaque drawer on
    // mobile where it sits over a dimmed backdrop.
    <aside className="w-[300px] overflow-y-auto border-l border-[#ECECF2] bg-white px-4 py-4.5 min-[900px]:m-2.5 min-[900px]:rounded-2xl min-[900px]:border min-[900px]:border-[#DEDEE8]">
      <h3 className="mb-1 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]">
        {t('edit.panelTitle')}
      </h3>
      <p className="mb-4 text-xs leading-relaxed text-[#8A8896]">{t('edit.panelSubtitle')}</p>

      {!canEdit && (
        <div className="mb-4.5 rounded-xl bg-[#F7F7FA] p-3.5 text-xs leading-relaxed text-[#8A8896]">
          {t('app.modeSelectNodeHint')}
        </div>
      )}

      {mode === 'add' ? (
        <div className="mb-4.5">
          <span className="mb-2 block text-xs font-semibold text-[#17161F]">
            {t('edit.referenceLabel')}
          </span>
          <label
            className={`block rounded-xl border border-dashed border-[#ECECF2] p-4.5 text-center text-xs text-[#8A8896] ${
              canEdit ? 'cursor-pointer hover:border-[#16A34A]' : 'cursor-not-allowed opacity-50'
            }`}
          >
            {previewUrl ? (
              // Seeing the reference beats reading its filename — a wrong pick
              // is obvious at a glance, unreadable from "IMG_4831.jpg".
              <img
                src={previewUrl}
                alt=""
                className="mx-auto mb-2 h-[86px] w-full rounded-lg object-cover"
              />
            ) : (
              <span className="mx-auto mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-[#EFF3F0]">
                <Upload set="light" size={15} primaryColor="#8A8896" />
              </span>
            )}
            <span className="block truncate">
              {referenceFile ? referenceFile.name : t('edit.referenceHint')}
            </span>
            <input
              type="file"
              accept={ACCEPTED_UPLOAD_TYPES.join(',')}
              disabled={!canEdit}
              className="hidden"
              onChange={(e) => onReferenceChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {/* Outside the label on purpose: nested in it, this click would also
              reopen the file picker it just cleared. */}
          {referenceFile && (
            <button
              type="button"
              onClick={() => onReferenceChange(null)}
              className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[#8A8896] hover:text-[#E5484D]"
            >
              <CloseSquare set="light" size={13} primaryColor="currentColor" />
              {t('edit.referenceRemove')}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-4.5">
          <p className="mb-3 text-xs leading-relaxed text-[#5F6B64]">{t('edit.zoneHint')}</p>
          {pins.some((p) => p.comment.trim()) && (
            <>
              <span className="mb-2 block text-xs font-semibold text-[#17161F]">
                {t('annotate.listTitle')}
              </span>
              <ol className="flex flex-col gap-1.5">
                {pins.map((p, i) =>
                  p.comment.trim() ? (
                    <li
                      key={p.id}
                      className="flex items-start gap-2 rounded-xl bg-[#F7F7FA] px-2.5 py-2"
                    >
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#15803D] font-[family-name:var(--font-mono)] text-[10.5px] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[#17161F]">
                        {p.comment}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPinsChange(pins.filter((q) => q.id !== p.id))}
                        aria-label={t('annotate.remove')}
                        className="flex-shrink-0 rounded-full p-0.5 hover:bg-[#E5484D0F]"
                      >
                        <CloseSquare set="light" size={14} primaryColor="#E5484D" />
                      </button>
                    </li>
                  ) : null,
                )}
              </ol>
            </>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[#5F6B64]">
            {t('annotate.max', { n: MAX_ANNOTATIONS })} {t('annotate.engineNote')}
          </p>
        </div>
      )}

      <p className="text-center text-[10.5px] leading-relaxed text-[#8A8896]">{t('edit.note')}</p>
    </aside>
  );
}
