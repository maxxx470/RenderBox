'use client';

// Right panel for "retouch"/"add" mode — reference upload or zone hint, plus
// the variant-count stepper. Submission itself happens from the shared
// CommandBar at the bottom (one action point across all 3 modes), so this
// panel only holds the controls specific to the active mode.
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';

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

  return (
    <aside className="w-[300px] overflow-y-auto border-l border-[#ECECF2] px-4 py-4.5">
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
        <>
          <span className="mb-2 block text-xs font-semibold text-[#17161F]">
            {t('edit.referenceLabel')}
          </span>
          <label
            className={`mb-4.5 block rounded-xl border border-dashed p-4.5 text-center text-xs text-[#8A8896] ${
              canEdit ? 'cursor-pointer hover:border-[#716FFF]' : 'cursor-not-allowed opacity-50'
            } border-[#ECECF2]`}
          >
            <div className="mx-auto mb-2 h-[30px] w-[30px] rounded-lg bg-[#F1F0F6]" />
            {referenceFile ? referenceFile.name : t('edit.referenceHint')}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canEdit}
              className="hidden"
              onChange={(e) => onReferenceChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </>
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
