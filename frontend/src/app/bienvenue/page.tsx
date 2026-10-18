import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { NextResponse } from 'next/server';
import { AuthShell } from '../AuthShell';
import { OnboardingForm } from './OnboardingForm';

// Private pages: never listed by search engines (robots.ts also keeps them out).
export const metadata: Metadata = { robots: { index: false, follow: false } };

// /bienvenue — the onboarding, right after the first sign-in (the app layout
// sends every account here until it is done). Step 2 of the panel's three.
// An onboarded account goes straight to /app.
export default async function BienvenuePage() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) redirect('/connexion?next=/bienvenue');

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: {
      name: true,
      phone: true,
      profession: true,
      company: true,
      teamSize: true,
      projectTypes: true,
      mainUse: true,
      defaultEngine: true,
      country: true,
      city: true,
      referralSource: true,
      onboardedAt: true,
    },
  });
  if (!user) redirect('/connexion');
  if (user.onboardedAt) redirect('/app');

  const { onboardedAt: _done, ...initial } = user;
  void _done;
  return (
    <AuthShell step={2}>
      <OnboardingForm initial={initial} />
    </AuthShell>
  );
}
