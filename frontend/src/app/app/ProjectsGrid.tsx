'use client';

// The dashboard at /app: banners, account figures, then the project grid.
// Also rendered on its own (without `dashboard`) as a plain grid.
//
// Opening a project is a deliberate click, and creating one is a single
// visible action rather than a side-effect of the first upload.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Folder, Edit, Delete, Search, Image as ImageIcon, Category } from 'react-iconly';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { DashboardStats, type DashboardData } from './DashboardStats';
import { DashboardVideoCard } from './DashboardVideoCard';
import { DashboardCarousel } from './DashboardCarousel';
import { HomeSidebar } from './HomeSidebar';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';

// Full literal class strings — Tailwind's scanner cannot see a class built
// from an interpolated value (see the JIT note in CLAUDE.md).
const FILTER_PILL =
  'rounded-full border border-[#ECECF2] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6B6880] transition-colors hover:border-[#DEDEE8] hover:text-[#17161F]';
const FILTER_PILL_ACTIVE =
  'rounded-full border border-[#716FFF] bg-[#EFECFF] px-3 py-1.5 text-[12px] font-semibold text-[#716FFF]';

export interface ProjectCardData {
  id: string;
  name: string;
  /** Newest GENERATED node, falling back to the starting photo. */
  thumbnailNodeId: string | null;
  lastActivityAt: string;
  /** Ambiances this project contains — drives the filter row. */
  presets: string[];
  renderCount: number;
}

type Dialog =
  | { kind: 'create' }
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

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#ECECF2] bg-white transition-colors hover:border-[#DEDEE8]">
      <Link href={`/app/${project.id}`} className="block">
        {/* Landscape, not the reference's portrait poster: film posters are
            portrait by nature, architectural renders are not, and a 2:3 frame
            would crop every one of them badly. */}
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F7F7FA]">
          {project.thumbnailNodeId ? (
            <img
              src={`/api/render-nodes/${project.thumbnailNodeId}/image`}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
          ) : (
            // A project with no render yet. Quiet on purpose: the brand
            // gradient used to sit here, which made the strongest colour on
            // the page mark what is MISSING — a grid of five saturated tiles
            // pulling the eye away from the project names. The glyph stays
            // (the charter forbids a bare coloured tile), it just recedes, so
            // a real thumbnail will read as the exception it should be.
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#F7F7FA]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#DEDEE8] bg-white">
                <ImageIcon set="light" size={18} primaryColor="#8A8896" />
              </span>
              <span className="text-[11px] text-[#6B6880]">{t('projects.cardEmpty')}</span>
            </div>
          )}
        </div>
        {/* Compact meta line under the image, like the reference: the poster
            carries the page, the text stays to one row of small facts. */}
        <div className="px-3 pb-3 pt-2.5">
          <div className="truncate text-[13px] font-semibold text-[#17161F]">{project.name}</div>
          <div className="mt-1 flex items-center gap-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] text-[#8A8896]">
            <span>{t('projects.renderCount', { n: String(project.renderCount) })}</span>
            <span className="text-[#DEDEE8]">·</span>
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
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ECECF2] bg-white shadow-[0_2px_8px_-4px_rgba(23,22,31,0.3)] hover:border-[#DEDEE8]"
        >
          <Edit set="light" size={14} primaryColor="#17161F" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('projects.deleteAction')}
          title={t('projects.deleteAction')}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#ECECF2] bg-white shadow-[0_2px_8px_-4px_rgba(23,22,31,0.3)] hover:border-[#E5484D]"
        >
          <Delete set="light" size={14} primaryColor="#E5484D" />
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[380px] rounded-2xl border border-[#ECECF2] bg-white p-5 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]">
        {children}
      </div>
    </div>
  );
}

export function ProjectsGrid({
  initialProjects,
  dashboard,
  userEmail = '',
  authDisabled = false,
}: {
  initialProjects: ProjectCardData[];
  /** Absent when the grid is rendered outside the dashboard. */
  dashboard?: DashboardData;
  /** Shown in the sidebar's account row; only used alongside `dashboard`. */
  userEmail?: string;
  authDisabled?: boolean;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const { toast } = useToast();

  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState('');
  const [presetFilter, setPresetFilter] = useState<PresetKey | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [draftName, setDraftName] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Only the ambiances the user actually has: an empty filter pill would be a
  // control that can only ever return nothing.
  const availablePresets = useMemo(
    () => PRESET_KEYS.filter((k) => projects.some((p) => p.presets.includes(k))),
    [projects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (!presetFilter || p.presets.includes(presetFilter)),
    );
  }, [projects, query, presetFilter]);

  function openCreate() {
    setDraftName(
      t('projects.defaultName', {
        date: new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
          day: 'numeric',
          month: 'short',
        }),
      }),
    );
    setDialog({ kind: 'create' });
  }

  function openRename(project: ProjectCardData) {
    setDraftName(project.name);
    setDialog({ kind: 'rename', project });
  }

  async function handleCreate() {
    const name = draftName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await api<{ id: string }>('/api/projects', {
        method: 'POST',
        body: { name },
      });
      router.push(`/app/${created.id}`);
    } catch {
      toast(t('projects.createError'), 'error');
      setBusy(false);
    }
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

  const content = (
    <>
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            {/* Below 900px the rail is off-canvas, so this is the only way to
                reach Image / Paramètres / Informations. Without it the
                dashboard is a dead end on a phone. */}
            {dashboard && (
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg border border-[#ECECF2] p-1.5 min-[900px]:hidden"
                aria-label={t('app.openMenu')}
              >
                <Category set="light" size={16} primaryColor="#8A8896" />
              </button>
            )}
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
            <h1 className="font-[family-name:var(--font-general-sans)] text-lg font-semibold text-[#17161F]">
              {t(dashboard ? 'dashboard.title' : 'projects.title')}
            </h1>
            {authDisabled && (
              <span className="rounded-2xl bg-amber-100 px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium text-amber-800">
                {t('app.authDisabledBanner')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3.5">
            <LanguageInlineSwitch />
            {projects.length > 0 && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-4.5 py-2.5 text-[13px] font-semibold text-white"
              >
                <Plus set="light" size={16} primaryColor="#ffffff" />
                {t('projects.newButton')}
              </button>
            )}
          </div>
        </div>

        {dashboard && (
          <>
            {/* Two banners on top, as in the reference — the video narrower
                than the carousel beside it. */}
            <div className="mb-5 grid grid-cols-1 gap-4 min-[900px]:grid-cols-[42fr_58fr]">
              <DashboardVideoCard />
              <DashboardCarousel />
            </div>
            <DashboardStats data={dashboard} />
          </>
        )}

        {/* The grid keeps its own heading under the dashboard: without it the
            cards would read as a continuation of the stat row. The ambiance
            filter sits on the same row, where the reference puts its own
            filter controls. */}
        {dashboard && projects.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
              {t('projects.title')}
            </h2>
            {availablePresets.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPresetFilter(null)}
                  className={presetFilter === null ? FILTER_PILL_ACTIVE : FILTER_PILL}
                >
                  {t('projects.filterAll')}
                </button>
                {availablePresets.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPresetFilter(key)}
                    className={presetFilter === key ? FILTER_PILL_ACTIVE : FILTER_PILL}
                  >
                    {PRESETS[key].label[locale]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Only worth the row once there is enough to sift through. */}
        {projects.length > 5 && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-2.5 focus-within:border-[#716FFF]">
            <Search set="light" size={15} primaryColor="#8A8896" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('projects.searchPlaceholder')}
              aria-label={t('projects.searchPlaceholder')}
              className="w-full bg-transparent text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
            />
          </div>
        )}

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#ECECF2] bg-[#F7F7FA] py-20 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
              <Folder set="light" size={24} primaryColor="#ffffff" />
            </div>
            <h2 className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
              {t('projects.emptyTitle')}
            </h2>
            <p className="max-w-[280px] text-[13px] text-[#8A8896]">{t('projects.emptyBody')}</p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-6px_#716FFF50]"
            >
              <Plus set="light" size={16} primaryColor="#ffffff" />
              {t('projects.newButton')}
            </button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-[#8A8896]">
            {t('projects.searchEmpty', { query: query.trim() })}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 min-[640px]:grid-cols-3 min-[1000px]:grid-cols-4 min-[1280px]:grid-cols-5">
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

      {dialog && dialog.kind !== 'delete' && (
        <Modal onClose={() => setDialog(null)}>
          <h2 className="mb-3 font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
            {t(dialog.kind === 'create' ? 'projects.createTitle' : 'projects.renameTitle')}
          </h2>
          <input
            type="text"
            autoFocus
            value={draftName}
            maxLength={200}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || busy || !draftName.trim()) return;
              if (dialog.kind === 'create') void handleCreate();
              else void handleRename(dialog.project);
            }}
            className="mb-4 w-full rounded-xl border border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-2.5 text-[13px] text-[#17161F] outline-none focus:border-[#716FFF]"
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
              onClick={() =>
                dialog.kind === 'create' ? void handleCreate() : void handleRename(dialog.project)
              }
              className="rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {t(dialog.kind === 'create' ? 'projects.createConfirm' : 'projects.renameConfirm')}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'delete' && (
        <Modal onClose={() => setDialog(null)}>
          <h2 className="mb-2 font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
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
    </>
  );

  // The rail only appears on the dashboard: it needs the plan figures the
  // dashboard already loaded, and this grid is also rendered on its own
  // elsewhere, where a second nav rail would just be noise. Hidden below
  // 900px like every other rail in the workspace.
  if (!dashboard) {
    return <main className="min-h-screen bg-white px-6 py-8">{content}</main>;
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* Backdrop for the mobile drawer. Tapping anywhere outside closes it —
          the same dismissal the workspace drawer already uses. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}
      {/* block, not flex: the rail inside is `sticky`, and it needs a plain
          block container as tall as the page to stick within. The rail hides
          itself below 900px, so this wrapper no longer does. */}
      <div>
        <HomeSidebar
          tier={dashboard.tier}
          max={dashboard.quotaMax}
          remaining={dashboard.quotaRemaining}
          userEmail={userEmail}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </div>
      {/* min-w-0: without it this flex child refuses to shrink below its
          content's intrinsic width, and a single long unwrapped string would
          stretch the page past the viewport. */}
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8">{content}</main>
    </div>
  );
}
