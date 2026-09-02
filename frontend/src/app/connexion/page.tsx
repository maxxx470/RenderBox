import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_PREFIX } from '@/lib/constants';
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { ConnexionForm } from './ConnexionForm';
import { LanguageToggle } from '@/components/LanguageToggle';

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ magicLinkError?: string }>;
}) {
  // Temporary site-wide kill-switch (see lib/server/auth-disabled.ts) — while
  // active, nobody needs to log in at all, so skip the form entirely.
  if (isAuthDisabled()) {
    redirect('/app');
  }

  // Heuristic (mirrors AuthContext's client-side check): the CSRF cookie is
  // only ever set after a successful login, so its presence is a reliable
  // "already signed in" signal — an invalid/expired session still bounces
  // back here via useUser() on /app.
  const store = await cookies();
  const hasSession = store.has(`${COOKIE_PREFIX}-csrf`);
  if (hasSession) {
    redirect('/app');
  }

  const { magicLinkError } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <LanguageToggle />
      <div className="w-[380px] rounded-[18px] border border-[#ECECF2] px-8 py-9">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
          <span className="font-[family-name:var(--font-general-sans)] text-[17px] font-bold text-[#17161F]">
            RenderBox
          </span>
        </div>
        <ConnexionForm
          initialError={
            magicLinkError === 'expired'
              ? 'expired'
              : magicLinkError === 'invalid'
                ? 'invalid'
                : null
          }
        />
      </div>
    </main>
  );
}
