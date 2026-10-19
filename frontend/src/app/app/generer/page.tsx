import { prisma } from '@/lib/server/prisma';
import { loadShell } from '../shell-data';
import { GenerationHome } from '../GenerationHome';
import { loadRecentRenders } from '../recent-renders';

// /app/generer — the "Espace de génération": the owner's templates in the
// fan, the command bar, and the account's recent renders (across every
// project) in the right column (2026-10-19).
//
// This used to be /app. The dashboard took that route on 2026-09-03 because
// it is the first screen a new account lands on; generation is one click away
// from it, in the sidebar.
export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ image?: string }>;
}) {
  // Account and plan: shared with the app layout, see shell-data.ts.
  const { auth, quota } = await loadShell();
  const { image } = await searchParams;
  // An image opened from the gallery or an old project link (2026-10-19,
  // owner: no more project tree): pinned as the source, if it is the
  // account's own — anything else opens the empty page.
  const [recentRenders, opened] = await Promise.all([
    loadRecentRenders(auth.user.sub),
    image
      ? prisma.renderNode.findFirst({
          where: { id: image, project: { userId: auth.user.sub } },
          select: { id: true, projectId: true },
        })
      : null,
  ]);

  return (
    <GenerationHome
      initialImage={opened ? { projectId: opened.projectId, nodeId: opened.id } : null}
      recentRenders={recentRenders}
      tier={quota.tier}
      max={quota.max}
      remaining={quota.remaining}
      userEmail={auth.user.email ?? ''}
    />
  );
}
