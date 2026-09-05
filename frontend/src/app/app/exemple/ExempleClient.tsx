'use client';

import Link from 'next/link';
import { Plus } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { GALLERY_IMAGES } from '@/app/exemple/gallery';

export function ExempleClient({ surface }: { surface: AppSurfaceProps }) {
  const t = useTranslations();

  return (
    <AppSurface {...surface} title={t('exemple.title')} subtitle={t('exemple.appGallerySubtitle')}>
      {/* One wall, no headings. The first row is eager, everything below it
          waits to be scrolled to — otherwise opening this page pulls every
          render at once. */}
      <div className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4">
        {GALLERY_IMAGES.map((src, i) => (
          <div
            key={src}
            className="group relative aspect-[4/3] overflow-hidden rounded-[14px] border border-[#ECECF2] bg-[#F7F7FA]"
          >
            <img
              src={src}
              alt=""
              loading={i < 4 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-[400ms] ease-out motion-safe:group-hover:scale-[1.04]"
            />
          </div>
        ))}
      </div>

      {/* The gallery has to lead somewhere. Without this the page is a wall
          you look at and then leave with the browser's back button. */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#ECECF2] bg-[#F7F7FA] px-5 py-4">
        <p className="max-w-[46ch] text-[13.5px] leading-[1.55] text-[#3D3B49]">
          {t('exemple.appGalleryCta')}
        </p>
        <Link
          href="/app/generer"
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-4.5 py-2.5 text-[13px] font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
        >
          <Plus set="light" size={16} primaryColor="#ffffff" />
          {t('app.genHomeTitle')}
        </Link>
      </div>
    </AppSurface>
  );
}
