'use client';

// Krea-style "my projects" grid — the new /app root. Replaces the old
// behavior of auto-redirecting to the most-recent project: opening a
// project is now a deliberate click, and creating one is a single visible
// action instead of an implicit side-effect of the first upload.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Folder } from 'react-iconly';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';

export interface ProjectCardData {
  id: string;
  name: string;
  thumbnailNodeId: string | null;
  lastActivityAt: string;
}

function ProjectCard({ project }: { project: ProjectCardData }) {
  const t = useTranslations();
  const { locale } = useLocale();

  return (
    <Link
      href={`/app/${project.id}`}
      className="group overflow-hidden rounded-2xl border border-[#ECE3E5] bg-white transition-colors hover:border-[#D9C4C6]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F8F5F6]">
        {project.thumbnailNodeId ? (
          <img
            src={`/api/render-nodes/${project.thumbnailNodeId}/image`}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[#7A6E71]">
            <Folder set="bold" size={26} primaryColor="#7A6E71" style={{ opacity: 0.5 }} />
            <span className="text-xs">{t('projects.cardEmpty')}</span>
          </div>
        )}
      </div>
      <div className="p-3.5">
        <div className="truncate text-[13.5px] font-semibold text-[#170608]">{project.name}</div>
        <div className="mt-1 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
          {t('projects.lastModified', {
            date: new Date(project.lastActivityAt).toLocaleDateString(
              locale === 'fr' ? 'fr-FR' : 'en-US',
              { day: 'numeric', month: 'short', year: 'numeric' },
            ),
          })}
        </div>
      </div>
    </Link>
  );
}

function NewProjectButton({ prominent }: { prominent?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const created = await api<{ id: string }>('/api/projects', {
        method: 'POST',
        body: { name: `Projet ${new Date().toLocaleDateString()}` },
      });
      router.push(`/app/${created.id}`);
    } catch {
      toast(t('projects.createError'), 'error');
      setCreating(false);
    }
  }

  return (
    <button
      type="button"
      disabled={creating}
      onClick={() => void handleCreate()}
      className={
        prominent
          ? 'inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_20px_-6px_#C8112050] disabled:opacity-60'
          : 'inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-4.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60'
      }
    >
      <Plus set="bold" size={16} primaryColor="#ffffff" />
      {t('projects.newButton')}
    </button>
  );
}

export function ProjectsGrid({
  initialProjects,
  authDisabled = false,
}: {
  initialProjects: ProjectCardData[];
  authDisabled?: boolean;
}) {
  const t = useTranslations();

  return (
    <main className="min-h-screen bg-white px-6 py-8">
      <LanguageToggle />
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
            <h1 className="font-[family-name:var(--font-poppins)] text-lg font-semibold text-[#170608]">
              {t('projects.title')}
            </h1>
            {authDisabled && (
              <span className="rounded-2xl bg-amber-100 px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] font-medium text-amber-800">
                {t('app.authDisabledBanner')}
              </span>
            )}
          </div>
          {initialProjects.length > 0 && <NewProjectButton />}
        </div>

        {initialProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-[#ECE3E5] bg-[#F8F5F6] py-20 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000]">
              <Folder set="bold" size={24} primaryColor="#ffffff" />
            </div>
            <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
              {t('projects.emptyTitle')}
            </h2>
            <p className="max-w-[280px] text-[13px] text-[#7A6E71]">{t('projects.emptyBody')}</p>
            <NewProjectButton prominent />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 min-[640px]:grid-cols-3 min-[900px]:grid-cols-4">
            {initialProjects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
