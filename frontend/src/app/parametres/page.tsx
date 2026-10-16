// /parametres — the account page, inside the workspace frame.
//
// Redrawn 2026-10-16 (owner chose « solution A » of the audit mock-up): the
// settings on the left (the onboarding profile, now editable, then the
// default engine with each engine's version and the language), the account on
// the right (the plan and its credits, sign-in methods, the last payments,
// sign-out). Everything shown already existed somewhere; nothing is invented
// to fill the page.
import { isAuthDisabled } from '@/lib/server/auth-disabled';
import { prisma } from '@/lib/server/prisma';
import { getOrderMetadataTier } from '@/lib/pricing-tiers';
import { loadAppSurface } from '@/app/app/surface-data';
import { loadShell } from '@/app/app/shell-data';
import type { PaymentRow } from '@/app/app/tarifs/TarifsClient';
import { ParametresClient, type SettingsAccount } from './ParametresClient';

/** The page shows the latest few; Abonnement lists them all. */
const RECENT_PAYMENTS = 3;

export default async function ParametresPage() {
  // Both read the same cached shell data — one query for the frame.
  const [surface, { auth, quota }] = await Promise.all([loadAppSurface('settings'), loadShell()]);

  // Serial on purpose: DATABASE_URL pins connection_limit=1.
  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: {
      email: true,
      name: true,
      phone: true,
      profession: true,
      company: true,
      teamSize: true,
      mainUse: true,
      country: true,
      city: true,
      defaultEngine: true,
      passwordHash: true,
      oauthAccounts: { select: { provider: true } },
    },
  });
  const orders = await prisma.order.findMany({
    where: { userId: auth.user.sub, status: 'PAID' },
    orderBy: { createdAt: 'desc' },
    take: RECENT_PAYMENTS,
    select: { id: true, amount: true, metadata: true, paidAt: true, createdAt: true },
  });
  const payments: PaymentRow[] = orders.flatMap((o) => {
    const tier = getOrderMetadataTier(o.metadata);
    if (!tier) return [];
    return [{ id: o.id, tier, amount: o.amount, at: (o.paidAt ?? o.createdAt).toISOString() }];
  });

  const account: SettingsAccount = {
    email: user?.email ?? auth.user.email ?? '',
    profile: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      profession: user?.profession ?? '',
      company: user?.company ?? '',
      teamSize: user?.teamSize ?? '',
      mainUse: user?.mainUse ?? '',
      country: user?.country ?? '',
      city: user?.city ?? '',
    },
    defaultEngine: user?.defaultEngine === 'gpt_image' ? 'gpt_image' : 'nanobanana',
    // Only whether one exists — never the hash itself.
    hasPassword: Boolean(user?.passwordHash),
    googleLinked: Boolean(user?.oauthAccounts.some((a) => a.provider === 'google')),
  };

  return (
    <ParametresClient
      surface={surface}
      account={account}
      periodEndsAt={quota.periodEndsAt?.toISOString() ?? null}
      payments={payments}
      demo={isAuthDisabled()}
    />
  );
}
