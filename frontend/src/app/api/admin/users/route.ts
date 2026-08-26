// ADMIN-01 — GET /api/admin/users (list with q + status + role filters,
// cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor }
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  deletedAt: true,
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    // Phase 6 — "DELETED" is a virtual status value layered over the
    // soft-delete deletedAt column, not a real User.status value (that
    // column stays ACTIVE|SUSPENDED). Default listing (no ?status, or
    // ?status=ACTIVE/SUSPENDED) excludes soft-deleted accounts so they
    // don't linger in the active back-office view during their 30-day
    // grace window; ?status=DELETED is the only way to see them (to
    // restore via POST /api/admin/users/[id]/restore).
    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status === 'DELETED'
        ? { deletedAt: { not: null } }
        : { ...(status ? { status } : {}), deletedAt: null }),
      ...(role ? { role } : {}),
      ...cursorWhere(cursor),
    };

    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: USER_SELECT,
    });

    // Phase 6 — per-row generation count for the admin table (D-06 spec).
    // One extra query for the whole page (not N+1): RenderNode has no
    // direct userId column (it belongs to Project), so we fetch the
    // matching rows' owning userId and reduce in JS.
    const pageIds = rows.slice(0, limit).map((r) => r.id);
    const genRows =
      pageIds.length > 0
        ? ((await prisma.renderNode.findMany({
            where: { kind: 'GENERATED', project: { userId: { in: pageIds } } },
            select: { project: { select: { userId: true } } },
          })) ?? [])
        : [];
    const generationsByUser = new Map<string, number>();
    for (const g of genRows) {
      generationsByUser.set(g.project.userId, (generationsByUser.get(g.project.userId) ?? 0) + 1);
    }

    const page = buildPage(rows, limit);
    return NextResponse.json(
      {
        ...page,
        items: page.items.map((u) => ({
          ...u,
          generationsCount: generationsByUser.get(u.id) ?? 0,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
