'use client';

// The dashboard at /app (banners, account figures, the latest projects) and
// the Projets page at /app/projets (every project, searched, sorted and
// filtered by category). One component, so a card behaves the same on both.
//
// Opening a project is a deliberate click, and creating one is a single
// visible action rather than a side-effect of the first upload.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Folder, Edit, Delete, Search, Image as ImageIcon, ArrowRight, Chat } from 'react-iconly';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { DashboardStats, type DashboardData } from './DashboardStats';
import { DashboardVideoCard } from './DashboardVideoCard';
import { DashboardCarousel } from './DashboardCarousel';
import { AppFrame } from './AppFrame';
import { MOBILE_NAV_PAD } from './MobileNav';
import { PageHeader } from './PageHeader';
import { openAssistant } from './AssistantWidget';
import { CATEGORY_LABELS, PROJECT_CATEGORIES, type ProjectCategory } from './project-categories';

// Full literal class strings — Tailwind's scanner cannot see a class built
// from an interpolated value (see the JIT note in CLAUDE.md).
// Metrio's filter pills: white with a hairline and bold grey text, the chosen
// one filled with the brand colour (#2948FC carries white 11.5px bold at 5:1).
const FILTER_PILL =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F2F2F5] px-3 py-1 text-[11.5px] font-bold text-[#4B4A57] transition-colors hover:bg-[#E9E9EE] hover:text-[#17161F]';
const FILTER_PILL_ACTIVE =
  'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#2948FC] bg-[#2948FC] px-3 py-1 text-[11.5px] font-bold text-white';
const COUNT = 'font-[family-name:var(--font-mono)] text-[11px] opacity-70';

/** How many projects the dashboard shows before "Voir tous les projets". */
const DASHBOARD_RECENT = 8;

export interface ProjectCardData {
  id: string;
  name: string;
  /** Newest GENERATED node, falling back to the starting photo. */
  thumbnailNodeId: string | null;
  lastActivityAt: string;
  renderCount: number;
  /** What the Projets page filters by — see project-categories.ts. */
  categories: ProjectCategory[];
}

type Dialog =
  | { kind: 'rename'; project: ProjectCardData }
  | { kind: 'delete'; project: ProjectCardData }
  | null;

function ProjectCard({
  project,
  onRename,
  onDelete,
}: {
  project: ProjectCardData;
  onRename: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const hasThumbnail = Boolean(project.thumbnailNodeId);

  return (
    // The card IS the thumbnail. It used to be a poster with a two-line meta
    // block bolted underneath, on a white ground: at the grid's size that
    // caption strip was a third of the card's height, and the thing the card
    // exists to show got two thirds. The latest render of a project is the
    // best available answer to "which project is this", so it fills the card
    // and the name sits on it.
    <div className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#F7F7FA] transition-[transform,translate,scale,box-shadow,border-color] duration-[220ms] ease-out hover:shadow-[0_18px_34px_-18px_rgba(23,22,31,0.35)] motion-safe:hover:-translate-y-0.5">
      <Link href={`/app/${project.id}`} className="absolute inset-0 block">
        {project.thumbnailNodeId ? (
          <img
            src={`/api/render-nodes/${project.thumbnailNodeId}/image`}
            alt=""
            className="h-full w-full object-cover transition-transform duration-[400ms] ease-out motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          // A project with no render yet. Quiet on purpose: the brand
          // gradient used to sit here, which made the strongest colour on
          // the page mark what is MISSING — a grid of saturated tiles pulling
          // the eye away from the project names. The glyph stays (the charter
          // forbids a bare coloured tile), it just recedes.
          // pb-10 lifts it clear of the name that now sits at the bottom
          // of the same card.
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#F7F7FA] pb-10">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F2F2F5]">
              <ImageIcon set="curved" size={18} primaryColor="#8A8896" />
            </span>
            <span className="text-[11px] text-[#6B6878]">{t('projects.cardEmpty')}</span>
          </div>
        )}

        {/* The scrim is the reason white text is readable on an image nobody
            chose for its darkness — and it is painted ONLY over an image. A
            first version painted it unconditionally "so both cards carry
            their name at the same weight", which dropped a black gradient
            over the pale empty state and turned a project with no render yet
            into an unreadable grey slab. A card with nothing behind the text
            does not need the text lifted off anything. */}
        {hasThumbnail && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/78 via-black/38 to-transparent"
          />
        )}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <div
            className={`truncate text-[13px] font-semibold ${
              hasThumbnail
                ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]'
                : 'text-[#17161F]'
            }`}
          >
            {project.name}
          </div>
          {/* white/75 over a photograph, the charter's muted grey over the
              empty state: a grey chosen for a white ground turns muddy on an
              image, and white on #F7F7FA is invisible. */}
          <div
            className={`mt-0.5 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] ${
              hasThumbnail ? 'text-white/75' : 'text-[#8A8896]'
            }`}
          >
            <span>{t('projects.renderCount', { n: String(project.renderCount) })}</span>
            <span className={hasThumbnail ? 'text-white/40' : 'text-[#DEDEE8]'}>·</span>
            <span>
              {new Date(project.lastActivityAt).toLocaleDateString(
                locale === 'fr' ? 'fr-FR' : 'en-US',
                { day: 'numeric', month: 'short' },
              )}
            </span>
          </div>
        </div>
      </Link>

      {/* Siblings of the link, never nested inside it — a button inside an
          anchor is invalid HTML and swallows the click. Always visible on
          touch, where there is no hover to reveal them. */}
      <div className="absolute right-2 top-2 flex gap-1.5 transition-opacity min-[900px]:opacity-0 min-[900px]:group-hover:opacity-100 min-[900px]:group-focus-within:opacity-100">
        <button
          type="button"
          onClick={onRename}
          aria-label={t('projects.renameAction')}
          title={t('projects.renameAction')}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-[0_2px_8px_-4px_rgba(23,22,31,0.3)] hover:bg-[#E9E9EE]"
        >
          <Edit set="curved" size={14} primaryColor="#17161F" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('projects.deleteAction')}
          title={t('projects.deleteAction')}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-[0_2px_8px_-4px_rgba(23,22,31,0.3)] hover:bg-[#FDEEEE]"
        >
          <Delete set="curved" size={14} primaryColor="#E5484D" />
        </button>
      </div>
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

export function ProjectsGrid({
  variant,
  initialProjects,
  dashboard,
  userEmail,
}: {
  /** The dashboard shows the latest projects; the Projets page all of them,
      with search, sort and category filters. */
  variant: 'dashboard' | 'projects';
  initialProjects: ProjectCardData[];
  /** Account figures: the stat row on the dashboard, the header bar on both. */
  dashboard: DashboardData;
  userEmail: string;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();

  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProjectCategory | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);

  const isDashboard = variant === 'dashboard';

  // Only the categories the user actually has, each with its count: an empty
  // filter would be a control that can only ever return nothing.
  const categoryCounts = useMemo(
    () =>
      PROJECT_CATEGORIES.map((c) => ({
        key: c,
        count: projects.filter((p) => p.categories.includes(c)).length,
      })).filter((c) => c.count > 0),
    [projects],
  );

  const visible = useMemo(() => {
    const byRecent = (a: ProjectCardData, b: ProjectCardData) =>
      b.lastActivityAt.localeCompare(a.lastActivityAt);
    if (isDashboard) return [...projects].sort(byRecent).slice(0, DASHBOARD_RECENT);
    const q = query.trim().toLowerCase();
    return projects
      .filter(
        (p) =>
          (!q || p.name.toLowerCase().includes(q)) &&
          (!category || p.categories.includes(category)),
      )
      .sort(byRecent);
  }, [projects, query, category, isDashboard]);

  function openRename(project: ProjectCardData) {
    setDraftName(project.name);
    setDialog({ kind: 'rename', project });
  }

  async function handleRename(project: ProjectCardData) {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, { method: 'PATCH', body: { name } });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, name } : p)));
      setDialog(null);
    } catch {
      toast(t('projects.renameError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(project: ProjectCardData) {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setDialog(null);
    } catch {
      toast(t('projects.deleteError'), 'error');
    } finally {
      setBusy(false);
    }
  }

  // No "Nouveau projet" here (owner, 2026-10-06): a project is born from a
  // render, in the generation space. This page is the archive of everything
  // already worked on, to come back to.

  return (
    <AppFrame
      current={isDashboard ? 'dashboard' : 'projects'}
      topbar={{
        title: t(isDashboard ? 'dashboard.title' : 'app.railProjects'),
        tier: dashboard.tier,
        quotaMax: dashboard.quotaMax,
        quotaRemaining: dashboard.quotaRemaining,
        userEmail,
      }}
    >
      {/* min-w-0: without it this flex child refuses to shrink below its
          content's intrinsic width, and a single long unwrapped string would
          stretch the page past the viewport. */}
      <main
        className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#EEEEF1] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 ${MOBILE_NAV_PAD}`}
      >
        <div className="mx-auto max-w-[1100px]">
          {/* The page head, as on every Metrio page: eyebrow, bold title, one
              line — and on the dashboard Metrio's "ask the assistant" pill. */}
          <PageHeader
            eyebrow={t(isDashboard ? 'page.dashboardEyebrow' : 'page.projectsEyebrow')}
            title={t(isDashboard ? 'dashboard.title' : 'page.projectsTitle')}
            subtitle={t(isDashboard ? 'page.dashboardSubtitle' : 'projects.archiveSubtitle')}
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

          {/* On the dashboard: the latest projects and the way to all of them. */}
          {isDashboard && projects.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-display)] text-[16px] font-bold text-[#17161F]">
                {t('projects.recentTitle')}
              </h2>
              <Link
                href="/app/projets"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2948FC] underline-offset-4 hover:underline"
              >
                {t('projects.seeAll')}
                <ArrowRight set="curved" size={15} primaryColor="#2948FC" />
              </Link>
            </div>
          )}

          {/* Metrio's search-and-filter bar: one grey band holding the search
              field, then "FILTRE :" and the categories as pills — the chosen
              one solid green, as Metrio fills its own in blue. */}
          {!isDashboard && (
            <div className="mb-6 flex flex-col items-stretch gap-3 rounded-xl bg-[#F7F7FA] p-2.5 min-[900px]:flex-row min-[900px]:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-[#ECECF2] bg-white px-3 py-2 focus-within:border-[#435CFE]">
                <Search set="curved" size={15} primaryColor="#2948FC" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('projects.searchPlaceholder')}
                  aria-label={t('projects.searchPlaceholder')}
                  className="w-full bg-transparent text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
                />
              </div>
              <div
                role="radiogroup"
                aria-label={t('projects.categoryLabel')}
                className="flex items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] min-[900px]:pb-0"
              >
                <span className="mr-1 hidden text-[11px] font-bold uppercase text-[#4B4A57] min-[1100px]:inline">
                  {t('projects.filterLabel')}
                </span>
                <button
                  type="button"
                  role="radio"
                  aria-checked={category === null}
                  onClick={() => setCategory(null)}
                  className={category === null ? FILTER_PILL_ACTIVE : FILTER_PILL}
                >
                  {t('projects.filterAll')}
                </button>
                {categoryCounts.map(({ key, count }) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={category === key}
                    onClick={() => setCategory(key)}
                    className={category === key ? FILTER_PILL_ACTIVE : FILTER_PILL}
                  >
                    {CATEGORY_LABELS[key][locale]}
                    <span className={COUNT}>{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            // Metrio's empty state: a dashed grey panel, the folder, a bold
            // line, one sentence and an underlined link.
            <div className="rounded-2xl border border-dashed border-[#DEDEE8] bg-[#F7F7FA] p-10 text-center">
              <div className="mb-2 flex justify-center">
                <Folder set="curved" size={32} primaryColor="#2948FC" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-[14px] font-bold text-[#17161F]">
                {t('projects.emptyTitle')}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-[#6B6878]">
                {t('projects.emptyBody')}
              </p>
              <Link
                href="/app/generer"
                className="mt-3 inline-block text-[13px] font-medium text-[#2948FC] underline underline-offset-4 hover:opacity-70"
              >
                {t('projects.startCta')}
              </Link>
            </div>
          ) : visible.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[#8A8896]">
              {query.trim()
                ? t('projects.searchEmpty', { query: query.trim() })
                : t('projects.categoryEmpty')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4">
              {visible.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onRename={() => openRename(p)}
                  onDelete={() => setDialog({ kind: 'delete', project: p })}
                />
              ))}
            </div>
          )}
        </div>

        {dialog?.kind === 'rename' && (
          <Modal onClose={() => setDialog(null)}>
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
              {t('projects.renameTitle')}
            </h2>
            <input
              type="text"
              autoFocus
              value={draftName}
              maxLength={200}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || busy || !draftName.trim()) return;
                void handleRename(dialog.project);
              }}
              className="mb-4 w-full rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-2.5 text-[13px] text-[#17161F] outline-none focus:border-[#435CFE]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-[#8A8896] hover:text-[#17161F]"
              >
                {t('projects.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={busy || !draftName.trim()}
                onClick={() => void handleRename(dialog.project)}
                className="rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('projects.renameConfirm')}
              </button>
            </div>
          </Modal>
        )}

        {dialog?.kind === 'delete' && (
          <Modal onClose={() => setDialog(null)}>
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
              {t('projects.deleteTitle', { name: dialog.project.name })}
            </h2>
            <p className="mb-4 text-[13px] leading-relaxed text-[#8A8896]">
              {t('projects.deleteBody')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-[#8A8896] hover:text-[#17161F]"
              >
                {t('projects.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDelete(dialog.project)}
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
