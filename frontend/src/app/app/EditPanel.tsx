'use client';

// Right panel for "retouch"/"add" mode — reference upload or zone hint, plus
// the variant-count stepper. Submission itself happens from the shared
// CommandBar at the bottom (one action point across all 3 modes), so this
// panel only holds the controls specific to the active mode.
import { useEffect, useState } from 'react';
import { Upload, CloseSquare } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';

export function EditPanel({
  mode,
  canEdit,
  referenceFile,
  onReferenceChange,
  variantCount,
  onVariantCountChange,
}: {
  mode: Extract<AppMode, 'retouch' | 'add'>;
  canEdit: boolean;
  referenceFile: File | null;
  onReferenceChange: (file: File | null) => void;
  variantCount: number;
  onVariantCountChange: (n: number) => void;
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
      <h3 className="mb-1 font-[family-name:var(--font-general-sans)] text-[11px] uppercase tracking-wide text-[#8A8896]">
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
              canEdit ? 'cursor-pointer hover:border-[#716FFF]' : 'cursor-not-allowed opacity-50'
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
              <span className="mx-auto mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#F1F0F6]">
                <Upload set="bold" size={15} primaryColor="#8A8896" />
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
              <CloseSquare set="bold" size={13} primaryColor="currentColor" />
              {t('edit.referenceRemove')}
            </button>
          )}
        </div>
      ) : (
        <p className="mb-4.5 text-xs leading-relaxed text-[#8A8896]">{t('edit.zoneHint')}</p>
      )}

      <div className="mb-4.5 flex items-center justify-between rounded-xl bg-[#F7F7FA] px-3.5 py-3">
        <div>
          <div className="text-[12.5px] font-medium text-[#17161F]">{t('edit.variantLabel')}</div>
          <div className="text-[10.5px] text-[#8A8896]">{t('edit.variantSub')}</div>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onVariantCountChange(Math.max(1, variantCount - 1))}
            className="h-[26px] w-[26px] rounded-lg border border-[#ECECF2] bg-white text-sm disabled:opacity-50"
          >
            −
          </button>
          <span className="w-4 text-center font-[family-name:var(--font-jetbrains-mono)] text-[13px]">
            {variantCount}
          </span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onVariantCountChange(Math.min(4, variantCount + 1))}
            className="h-[26px] w-[26px] rounded-lg border border-[#ECECF2] bg-white text-sm disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>

      <p className="text-center text-[10.5px] leading-relaxed text-[#8A8896]">{t('edit.note')}</p>
    </aside>
  );
}
