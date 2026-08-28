import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { isDevBypassActive } from '@/lib/server/dev-bypass';
import { AppShell } from './AppShell';

export default async function AppPage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) {
    redirect('/connexion');
  }

  // Redirect to the URL-addressable /app/[projet] route for the most recent
  // project, so the active project is always reflected in the URL. Only a
  // brand-new user with zero projects renders AppShell here directly —
  // it creates one lazily on first upload (see ensureProject in AppShell).
  const project = await prisma.project.findFirst({
    where: { userId: auth.user.sub },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (project) {
    redirect(`/app/${project.id}`);
  }

  return (
    <AppShell
      initialProjectId={null}
      initialProjectName={null}
      initialTree={[]}
      devBypassActive={isDevBypassActive()}
    />
  );
}
