// Reading a relance before anyone else does (2026-11-01, owner).
//
// GET  → the mail rendered exactly as it will land, as HTML, for the iframe
//        on /admin/relances. Reads nothing, sends nothing.
// POST → sends that one mail to the ADMIN'S OWN address and nowhere else.
//
// It cannot reach a user: the recipient is never taken from the request, it
// is the signed-in admin's own address. And it writes no ReengagementEmail
// row, so a preview never spends anybody's place in the sequence.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { createMailer } from '@/lib/server/email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { relanceEmail } from '@/lib/server/reengagement/emails';
import { REENGAGEMENT_KINDS, type ReengagementKind } from '@/lib/server/reengagement/schedule';
import { unsubscribeUrl } from '@/lib/server/reengagement/unsubscribe-token';
import type { Locale } from '@/lib/i18n/dictionaries';

function readParams(req: NextRequest): { kind: ReengagementKind; locale: Locale } | null {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind');
  const lang = url.searchParams.get('lang');
  if (!kind || !REENGAGEMENT_KINDS.includes(kind as ReengagementKind)) return null;
  return { kind: kind as ReengagementKind, locale: lang === 'en' ? 'en' : 'fr' };
}

/** The preview is addressed to the admin, so it shows their own first name. */
function previewFor(
  kind: ReengagementKind,
  locale: Locale,
  admin: { id: string; email: string },
  name: string | null,
) {
  const first = name?.trim().split(/\s+/)[0] ?? null;
  return relanceEmail(kind, {
    firstName: first && first.length > 0 ? first : null,
    locale,
    // The admin's own link: clicking it would unsubscribe the ADMIN, which
    // is honest — it is their own copy of the e-mail.
    unsubscribeUrl: unsubscribeUrl(admin.id, process.env.JWT_SECRET ?? 'preview', locale),
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const params = readParams(req);
    if (!params) {
      return NextResponse.json(
        { error: 'UNKNOWN_KIND' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const me = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { name: true },
    });
    const mail = previewFor(params.kind, params.locale, auth.admin, me?.name ?? null);

    return new NextResponse(mail.html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        // Shown in an iframe on /admin/relances — our own origin only.
        'x-frame-options': 'SAMEORIGIN',
        'x-request-id': ctx.requestId,
      },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;
    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const params = readParams(req);
    if (!params) {
      return NextResponse.json(
        { error: 'UNKNOWN_KIND' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) {
      return NextResponse.json(
        { error: 'MAILER_NOT_CONFIGURED' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const me = await prisma.user.findUnique({
      where: { id: auth.admin.id },
      select: { name: true },
    });
    const mail = previewFor(params.kind, params.locale, auth.admin, me?.name ?? null);

    try {
      await createMailer({ RESEND_API_KEY: key, EMAIL_FROM: from }).send({
        // Never from the request: the admin's own address, nobody else's.
        to: auth.admin.email,
        subject: `[Essai] ${mail.subject}`,
        html: mail.html,
        text: mail.text,
      });
    } catch (err) {
      return NextResponse.json(
        {
          error: 'SEND_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'reengagement.preview_send',
      targetType: 'relance',
      targetId: params.kind,
      metadata: { locale: params.locale, to: auth.admin.email },
    });

    return NextResponse.json(
      { ok: true, to: auth.admin.email },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
