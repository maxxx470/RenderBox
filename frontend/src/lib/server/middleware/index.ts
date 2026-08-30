/**
 * Higher-order helpers callable from Next.js route handlers. Each one
 * either:
 *   - returns a NextResponse 4xx to short-circuit the handler, OR
 *   - returns the resolved auth context the handler needs.
 *
 * Example:
 *   export async function POST(req: NextRequest) {
 *     const csrfFail = verifyCsrf(req);
 *     if (csrfFail) return csrfFail;
 *     const auth = await requireAuth();
 *     if (auth instanceof NextResponse) return auth;
 *     // …handler logic with `auth.user.sub`
 *   }
 *
 * Why not Express-style middleware chains? Next.js route handlers are
 * plain functions; HOFs compose more naturally and keep the type of
 * `req`/`ctx` standard.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '../auth';
import { prisma } from '../prisma';
import { AUTH_DISABLED_USER_ID, AUTH_DISABLED_USER_EMAIL, isAuthDisabled } from '../auth-disabled';
import type { AdminRole } from './require-admin';
import { roleRank } from './require-admin';

export interface AuthContext {
  user: { sub: string; email: string };
}

export interface AdminContext extends AuthContext {
  admin: { id: string; email: string; role: AdminRole };
}

/**
 * Real cookie/Bearer session resolution — NEVER short-circuited by
 * AUTH_DISABLED. requireAdmin/requireSuperadmin call this directly (instead
 * of requireAuth) so /admin always requires a genuine session regardless of
 * the temporary AUTH_DISABLED kill-switch (see lib/server/auth-disabled.ts),
 * which only ever affects requireAuth/optionalAuth (standard /app routes).
 *
 * The DB re-query blocks stale-JWT bypass (deleted accounts, bumped
 * tokenVersion).
 */
async function resolveRealAuth(authHeader?: string | null): Promise<AuthContext | NextResponse> {
  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;

  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, tokenVersion: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  if (user.tokenVersion !== payloadVersion) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
  return { user: { sub: user.id, email: user.email } };
}

/**
 * Resolve the authenticated user from the cookie / Bearer header. Returns
 * `AuthContext` on success, or a 401 NextResponse on failure.
 */
export async function requireAuth(authHeader?: string | null): Promise<AuthContext | NextResponse> {
  // Temporary site-wide kill-switch — see lib/server/auth-disabled.ts.
  // requireAdmin/requireSuperadmin never consult this (they call
  // resolveRealAuth directly below), so /admin is never affected.
  if (isAuthDisabled()) {
    return { user: { sub: AUTH_DISABLED_USER_ID, email: AUTH_DISABLED_USER_EMAIL } };
  }
  return resolveRealAuth(authHeader);
}

/**
 * Soft auth — returns `{ user }` if a valid cookie/Bearer is present,
 * `null` otherwise. Never returns a NextResponse. Use for routes that
 * accept both guests and authenticated callers.
 */
export async function optionalAuth(authHeader?: string | null): Promise<AuthContext | null> {
  if (isAuthDisabled()) {
    return { user: { sub: AUTH_DISABLED_USER_ID, email: AUTH_DISABLED_USER_EMAIL } };
  }

  const store = await cookies();
  let token = store.get(COOKIE_NAME)?.value;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length);
  }
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const payloadVersion = payload.tokenVersion ?? 0;
  const user = await prisma.user
    .findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, tokenVersion: true },
    })
    .catch(() => null);
  if (!user || user.tokenVersion !== payloadVersion) return null;
  return { user: { sub: user.id, email: user.email } };
}

/**
 * requireAdmin / requireSuperadmin — real session only (see resolveRealAuth
 * above). Re-reads the user role from DB so an in-flight role change is
 * honored on the very next request (no need to wait for the JWT to expire).
 */
export async function requireAdmin(
  minRole: AdminRole = 'ADMIN',
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  // Real session only — never resolves through requireAuth(), so
  // AUTH_DISABLED can never grant /admin access (see resolveRealAuth above).
  const auth = await resolveRealAuth(authHeader);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 });
  }
  const role = (user.role as AdminRole) ?? 'USER';
  if (roleRank(role) < roleRank(minRole)) {
    return NextResponse.json(
      { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
      { status: 403 },
    );
  }
  return {
    user: { sub: user.id, email: user.email },
    admin: { id: user.id, email: user.email, role },
  };
}

export async function requireSuperadmin(
  authHeader?: string | null,
): Promise<AdminContext | NextResponse> {
  return requireAdmin('SUPERADMIN', authHeader);
}
