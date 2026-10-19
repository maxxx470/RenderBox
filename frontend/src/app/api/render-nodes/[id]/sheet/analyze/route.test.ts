import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockRequireAuth = vi.fn();
vi.mock('@/lib/server/middleware', () => ({ requireAuth: () => mockRequireAuth() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: () => null }));
const mockRequest = vi.fn();
vi.mock('@/lib/server/materials/render-sheet', () => ({
  requestSheetAnalysis: (...args: unknown[]) => mockRequest(...args),
}));

import { POST } from './route';

const call = () =>
  POST(new NextRequest('http://localhost/api/render-nodes/n1/sheet/analyze', { method: 'POST' }), {
    params: Promise.resolve({ id: 'n1' }),
  });

describe('POST /api/render-nodes/[id]/sheet/analyze', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset().mockResolvedValue({ user: { sub: 'u1' } });
    mockRequest.mockReset();
  });

  it('starts the analysis for the signed-in user and says what was charged', async () => {
    mockRequest.mockResolvedValue({ kind: 'started', balance: 92 });
    const res = await call();
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ status: 'pending', charged: 8, balance: 92 });
    expect(mockRequest).toHaveBeenCalledWith({ nodeId: 'n1', userId: 'u1' });
  });

  it('charges nothing when the sheet already exists or is running', async () => {
    mockRequest.mockResolvedValue({ kind: 'already', status: 'ready' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready', charged: 0 });
  });

  it('answers the credit refusals with their stable codes', async () => {
    mockRequest.mockResolvedValue({
      kind: 'refused',
      refusal: { ok: false, reason: 'INSUFFICIENT_CREDITS', balance: 3 },
    });
    const res = await call();
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'INSUFFICIENT_CREDITS', cost: 8 });
    mockRequest.mockResolvedValue({
      kind: 'refused',
      refusal: { ok: false, reason: 'NO_ACTIVE_TIER', balance: null },
    });
    expect((await call()).status).toBe(403);
  });

  it('404 for another account’s image, 409 for an upload, 503 without a key', async () => {
    mockRequest.mockResolvedValue({ kind: 'not_found' });
    expect((await call()).status).toBe(404);
    mockRequest.mockResolvedValue({ kind: 'no_sheet' });
    expect((await call()).status).toBe(409);
    mockRequest.mockResolvedValue({ kind: 'not_configured' });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'SHEET_NOT_CONFIGURED' });
  });

  it('refuses without a session', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    expect((await call()).status).toBe(401);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
