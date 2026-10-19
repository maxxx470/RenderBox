'use client';

// The account's recent renders, in the right column of the image generator
// (2026-10-19, owner: « au lieu de l'arbre de projet … une petite galerie des
// images récentes »): small thumbnails (the image proxy's `?size=thumb`),
// newest first; a click makes one the source in the command bar. The one in
// use is ringed blue.
import { Image as ImageIcon } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { RecentRenderCardData } from './GenerationHome';
import { PRESETS, isPresetKey } from '@/lib/server/generation/presets';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';

/** What made an image, for its tooltip: its ambiance, or else its engine. */
export function recentImageLabel(image: RecentRenderCardData, locale: 'fr' | 'en'): string {
  if (image.preset && isPresetKey(image.preset)) return PRESETS[image.preset].label[locale];
  if (image.engine === 'nanobanana' || image.engine === 'gpt_image') {
    return ENGINE_LABELS[image.engine].name[locale];
  }
  return '';
}

export function RecentImages({
  images,
  selectedId,
  disabled,
  onPick,
  labelFor,
  columns = 3,
}: {
  images: RecentRenderCardData[];
  selectedId: string | null;
  disabled: boolean;
  onPick: (image: RecentRenderCardData) => void;
  /** What made the image (ambiance or engine), for its tooltip. */
  labelFor: (image: RecentRenderCardData) => string;
  /** Four in Améliorer's column, where the improvements need the room. */
  columns?: 3 | 4;
}) {
  const t = useTranslations();

  if (images.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[#8A8896]">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#ECECF2]">
          <ImageIcon set="curved" size={16} primaryColor="#8A8896" />
        </div>
        <p className="max-w-[190px] text-xs leading-relaxed">{t('app.recentEmpty')}</p>
      </div>
    );
  }

  return (
    <div className={columns === 4 ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-3 gap-2'}>
      {images.map((image) => {
        const selected = image.id === selectedId;
        const label = labelFor(image);
        const title = label ? `${label} — ${t('app.genUseAsSource')}` : t('app.genUseAsSource');
        return (
          <button
            key={image.id}
            type="button"
            onClick={() => onPick(image)}
            disabled={disabled}
            title={title}
            aria-label={title}
            aria-pressed={selected}
            className={`group relative aspect-square overflow-hidden rounded-lg bg-[#F7F7FA] transition-[box-shadow,opacity] disabled:opacity-50 ${
              selected ? 'ring-2 ring-[#2948FC]' : 'ring-1 ring-[#ECECF2] hover:ring-[#D5DCFF]'
            }`}
          >
            <img
              src={`/api/render-nodes/${image.id}/image?size=thumb`}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
            />
          </button>
        );
      })}
    </div>
  );
}
