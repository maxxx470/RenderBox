// PATCH /api/users/me/profile — what the onboarding (/bienvenue) learns about
// the user, saved on the account at every step so nothing typed is lost
// (owner, 2026-10-13: « toutes les informations s'enregistreront en même
// temps … sur son compte »). Every field is optional in a request; the
// choices must be keys of lib/onboarding.ts. `complete: true` marks the
// onboarding done — refused with 400 ONBOARDING_INCOMPLETE until the account
// has a name, a profession and a country.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import {
  MAIN_USES,
  PROFESSIONS,
  PROJECT_TYPES,
  REFERRAL_SOURCES,
  TEAM_SIZES,
} from '@/lib/onboarding';

// A text field: trimmed, an empty string clears it.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s));

const Body = z
  .object({
    name: text(120),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[+\d\s().-]*$/)
      .transform((s) => (s === '' ? null : s)),
    profession: z.enum(PROFESSIONS),
    company: text(120),
    teamSize: z.enum(TEAM_SIZES),
    projectTypes: z.array(z.enum(PROJECT_TYPES)).max(PROJECT_TYPES.length),
    mainUse: z.enum(MAIN_USES),
    defaultEngine: z.enum(ENGINE_NAMES),
    country: text(80),
    city: text(80),
    referralSource: z.enum(REFERRAL_SOURCES),
    complete: z.literal(true),
  })
  .partial()
  .strict();

const PROFILE_SELECT = {
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
} as const;

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers },
      );
    }
    const { complete, ...fields } = parsed.data;
    // Only the fields sent: an absent key leaves the account as it is.
    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    ) as Prisma.UserUpdateInput;

    const profile = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: auth.user.sub },
        data,
        select: PROFILE_SELECT,
      });
      if (!complete || updated.onboardedAt) return updated;
      if (!updated.name || !updated.profession || !updated.country) return null;
      return tx.user.update({
        where: { id: auth.user.sub },
        data: { onboardedAt: new Date() },
        select: PROFILE_SELECT,
      });
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'ONBOARDING_INCOMPLETE', message: 'Name, profession and country are required' },
        { status: 400, headers },
      );
    }
    return NextResponse.json({ profile }, { status: 200, headers });
  });
}
