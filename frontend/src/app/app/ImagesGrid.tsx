'use client';

// The dashboard at /app (banners, account figures, the latest images) and
// Mes images at /app/images — every image of the account, uploaded,
// generated or enhanced, filtered Tout / Importées / Générées / Enhance. One
// component, so a card behaves the same on both.
//
// Mes images replaced the Projets page on 2026-10-08 (owner, after Krea's
// "Assets"): the user keeps images, not projects. A card opens its image
// where it can be worked on — the editor, on that image, or the Enhance page
// for an Enhance project — and can be downloaded or deleted. Deleting removes
// that image only (owner): what was made from it stays.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Delete, Download, Image as ImageIcon, ArrowRight, Chat } from 'react-iconly';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { DashboardStats, type DashboardData } from './DashboardStats';
import { DashboardVideoCard } from './DashboardVideoCard';
import { DashboardCarousel } from './DashboardCarousel';
import { AppFrame } from './AppFrame';
import { MOBILE_NAV_PAD } from './MobileNav';
import { PageHeader } from './PageHeader';
import { openAssistant } from './AssistantWidget';
import { IMAGE_TYPES, type ImageType } from './project-kinds';

// Full literal class strings — Tailwind's scanner cannot see a class built
// from an interpolated value (see the JIT note in CLAUDE.md).
const FILTER_PILL =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F2F2F5] px-3 py-1 text-[11.5px] font-bold text-[#4B4A57] transition-colors hover:bg-[#E9E9EE] hover:text-[#17161F]';
const FILTER_PILL_ACTIVE =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#2948FC] px-3 py-1 text-[11.5px] font-bold text-white';
const COUNT = 'font-[family-name:var(--font-mono)] text-[11px] opacity-70';
const ICON_BUTTON =
  'flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-[0_2px_8px_-4px_rgba(23,22,31,0.3)]';

/** How many images the dashboard shows before "Voir toutes mes images". */
const DASHBOARD_RECENT = 8;

const FILTER_KEY = {
  uploaded: 'images.filterUploaded',
  generated: 'images.filterGenerated',
  enhance: 'images.filterEnhance',
} as const satisfies Record<ImageType, string>;

export interface ImageCardData {
  id: string;
  type: ImageType;
  preset: string | null;
  editType: string | null;
  createdAt: string;
  /** Where the card opens — see imageHref in project-kinds.ts. */
  href: string;
}

function imageSrc(id: string) {
  return `/api/render-nodes/${id}/image`;
}

function ImageCard({
  image,
  selecting,
  selected,
  onToggle,
  onDelete,
}: {
  image: ImageCardData;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();

  // The one word that says what the image is.
  const tag =
    image.type === 'uploaded'
      ? t('images.typeUploaded')
      : image.type === 'enhance'
        ? t('enhance.tag')
        : image.editType === 'add_element'
          ? t('edit.tabAdd')
          : image.editType === 'annotate' || image.editType === 'targeted_retouch'
            ? t('edit.tabRetouch')
            : image.preset && image.preset in PRESETS
              ? PRESETS[image.preset as PresetKey].label[locale]
              : t('images.typeGenerated');

  const body = (
    <>
      <img
        src={imageSrc(image.id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-[400ms] ease-out motion-safe:group-hover:scale-[1.04]"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/60 to-transparent"
      />
      <span className="absolute left-2.5 top-2.5 rounded-lg bg-white/90 px-2 py-0.5 text-[10.5px] font-semibold text-[#17161F] backdrop-blur-sm">
        {tag}
      </span>
      <span className="absolute bottom-2.5 left-3 font-[family-name:var(--font-mono)] text-[10.5px] text-white/85">
        {new Date(image.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
          day: 'numeric',
          month: 'short',
        })}
      </span>
    </>
  );

  return (
    <div
      className={`group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F7F7FA] transition-[translate,box-shadow] duration-[220ms] ease-out hover:shadow-[0_18px_34px_-18px_rgba(23,22,31,0.35)] motion-safe:hover:-translate-y-0.5 ${
        selected ? 'shadow-[0_0_0_3px_#2948FC]' : ''
      }`}
    >
      {selecting ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={tag}
          onClick={onToggle}
          className="absolute inset-0 block"
        >
          {body}
          <span
            aria-hidden
            className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-md ${
              selected
                ? 'bg-[#2948FC]'
                : 'bg-white/90 shadow-[inset_0_0_0_1.5px_#DEDEE8] backdrop-blur-sm'
            }`}
          >
            {selected && (
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
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
        </button>
      ) : (
        <>
          <Link href={image.href} className="absolute inset-0 block">
            {body}
          </Link>
          {/* Siblings of the link, never inside it — a button inside an anchor
              is invalid HTML and swallows the click. Always visible on touch,
              where there is no hover to reveal them. */}
          <div className="absolute right-2 top-2 flex gap-1.5 transition-opacity min-[900px]:opacity-0 min-[900px]:group-hover:opacity-100 min-[900px]:group-focus-within:opacity-100">
            <a
              href={imageSrc(image.id)}
              download
              aria-label={t('images.download')}
              title={t('images.download')}
              className={`${ICON_BUTTON} hover:bg-[#E9E9EE]`}
            >
              <Download set="curved" size={14} primaryColor="#17161F" />
            </a>
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('images.delete')}
              title={t('images.delete')}
              className={`${ICON_BUTTON} hover:bg-[#FDEEEE]`}
            >
              <Delete set="curved" size={14} primaryColor="#E5484D" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]">
        {children}
      </div>
    </div>
  );
}

export function ImagesGrid({
  variant,
  initialImages,
  dashboard,
  userEmail,
}: {
  /** The dashboard shows the latest images; Mes images all of them, filtered. */
  variant: 'dashboard' | 'images';
  initialImages: ImageCardData[];
  /** Account figures: the stat row on the dashboard, the header bar on both. */
  dashboard: DashboardData;
  userEmail: string;
}) {
  const t = useTranslations();
  const { toast } = useToast();

  const [images, setImages] = useState(initialImages);
  const [type, setType] = useState<ImageType | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The images a confirmed delete will remove: one card's, or the selection.
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const isDashboard = variant === 'dashboard';

  // Every filter shows, even at zero: they name what the product makes, not
  // what this account happens to hold.
  const typeCounts = useMemo(
    () => IMAGE_TYPES.map((k) => ({ key: k, count: images.filter((i) => i.type === k).length })),
    [images],
  );

  // The server sends them newest first.
  const visible = useMemo(
    () =>
      isDashboard
        ? images.slice(0, DASHBOARD_RECENT)
        : images.filter((i) => !type || i.type === type),
    [images, type, isDashboard],
  );

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  // One at a time: each delete moves what was made from that image up a
  // level, so they must not race on the same tree.
  async function handleDelete(ids: string[]) {
    setBusy(true);
    const done = new Set<string>();
    try {
      for (const id of ids) {
        await api(`/api/render-nodes/${id}?scope=single`, { method: 'DELETE' });
        done.add(id);
      }
    } catch {
      toast(t('images.deleteError'), 'error');
    } finally {
      setImages((cur) => cur.filter((i) => !done.has(i.id)));
      setSelected((cur) => new Set([...cur].filter((id) => !done.has(id))));
      if (done.size === ids.length) stopSelecting();
      setPendingDelete(null);
      setBusy(false);
    }
  }

  return (
    <AppFrame
      current={isDashboard ? 'dashboard' : 'images'}
      topbar={{
        title: t(isDashboard ? 'dashboard.title' : 'app.railImages'),
        tier: dashboard.tier,
        quotaMax: dashboard.quotaMax,
        quotaRemaining: dashboard.quotaRemaining,
        userEmail,
      }}
    >
      {/* min-w-0: without it this flex child refuses to shrink below its
          content's intrinsic width. */}
      <main
        className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#EEEEF1] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 ${MOBILE_NAV_PAD}`}
      >
        <div className="mx-auto max-w-[1100px]">
          <PageHeader
            eyebrow={t(isDashboard ? 'page.dashboardEyebrow' : 'images.eyebrow')}
            title={t(isDashboard ? 'dashboard.title' : 'app.railImages')}
            subtitle={t(isDashboard ? 'page.dashboardSubtitle' : 'images.subtitle')}
            action={
              isDashboard ? (
                <button
                  type="button"
                  onClick={openAssistant}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#EEF1FF] px-4 py-2 text-[12.5px] font-semibold text-[#2948FC] transition-[background-color,color,translate] duration-200 hover:-translate-y-0.5 hover:bg-[#2948FC] hover:text-white"
                >
                  <Chat set="curved" size={16} primaryColor="currentColor" />
                  {t('page.askAssistant')}
                </button>
              ) : undefined
            }
          />

          {isDashboard && (
            // As on Metrio: the four figures straight under the title, then
            // the two banners (the "3 steps" film and the showcase).
            <div className="mb-8 flex flex-col gap-5">
              <DashboardStats data={dashboard} />
              <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
                <DashboardVideoCard />
                <DashboardCarousel />
              </div>
            </div>
          )}

          {isDashboard && images.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[#17161F]">
                {t('images.recentTitle')}
              </h2>
              <Link
                href="/app/images"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2948FC] underline-offset-4 hover:underline"
              >
                {t('images.seeAll')}
                <ArrowRight set="curved" size={15} primaryColor="#2948FC" />
              </Link>
            </div>
          )}

          {/* The filter band: "FILTRE :" and the four filters, the chosen one
              solid blue; on the right, the selection for deleting several. */}
          {!isDashboard && (
            <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl bg-[#F7F7FA] p-2.5">
              <div
                role="radiogroup"
                aria-label={t('images.filterGroup')}
                className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
              >
                <span className="mr-1 hidden text-[11px] font-bold uppercase text-[#4B4A57] min-[640px]:inline">
                  {t('projects.filterLabel')}
                </span>
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === null}
                  onClick={() => setType(null)}
                  className={type === null ? FILTER_PILL_ACTIVE : FILTER_PILL}
                >
                  {t('projects.filterAll')}
                  <span className={COUNT}>{images.length}</span>
                </button>
                {typeCounts.map(({ key, count }) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={type === key}
                    onClick={() => setType(key)}
                    className={type === key ? FILTER_PILL_ACTIVE : FILTER_PILL}
                  >
                    {t(FILTER_KEY[key])}
                    <span className={COUNT}>{count}</span>
                  </button>
                ))}
              </div>
              {images.length > 0 &&
                (selecting ? (
                  <div className="flex items-center gap-1.5">
                    <span className="px-1 text-[12px] font-semibold text-[#3D3B49]">
                      {t('images.selectedCount', { n: String(selected.size) })}
                    </span>
                    <button
                      type="button"
                      disabled={selected.size === 0}
                      onClick={() => setPendingDelete([...selected])}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#E5484D] px-3 py-1 text-[11.5px] font-bold text-white disabled:opacity-40"
                    >
                      <Delete set="curved" size={13} primaryColor="#ffffff" />
                      {t('images.delete')}
                    </button>
                    <button type="button" onClick={stopSelecting} className={FILTER_PILL}>
                      {t('projects.dialogCancel')}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setSelecting(true)} className={FILTER_PILL}>
                    {t('images.select')}
                  </button>
                ))}
            </div>
          )}

          {images.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#DEDEE8] bg-[#F7F7FA] p-10 text-center">
              <div className="mb-2 flex justify-center">
                <ImageIcon set="curved" size={32} primaryColor="#2948FC" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-[14px] font-bold text-[#17161F]">
                {t('images.emptyTitle')}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-[#6B6878]">
                {t('images.emptyBody')}
              </p>
              <Link
                href="/app/generer"
                className="mt-3 inline-block text-[13px] font-medium text-[#2948FC] underline underline-offset-4 hover:opacity-70"
              >
                {t('projects.startCta')}
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[#8A8896]">{t('images.typeEmpty')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4">
              {visible.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  selecting={selecting}
                  selected={selected.has(image.id)}
                  onToggle={() => toggle(image.id)}
                  onDelete={() => setPendingDelete([image.id])}
                />
              ))}
            </div>
          )}
        </div>

        {pendingDelete && (
          <Modal onClose={() => !busy && setPendingDelete(null)}>
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
              {pendingDelete.length === 1
                ? t('images.deleteTitle')
                : t('images.deleteTitleMany', { n: String(pendingDelete.length) })}
            </h2>
            <p className="mb-4 text-[13px] leading-relaxed text-[#8A8896]">
              {t(pendingDelete.length === 1 ? 'images.deleteBody' : 'images.deleteBodyMany')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-[#8A8896] hover:text-[#17161F]"
              >
                {t('projects.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(pendingDelete)}
                className="rounded-xl bg-[#E5484D] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('projects.deleteConfirm')}
              </button>
            </div>
          </Modal>
        )}
      </main>
    </AppFrame>
  );
}
