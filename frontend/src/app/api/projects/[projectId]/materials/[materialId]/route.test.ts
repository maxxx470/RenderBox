// IDOR + happy-path coverage for PATCH /api/projects/[projectId]/materials/[materialId].
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

import { verifyToken } from '@/lib/server/auth';
import { PATCH } from './route';

const OWNER_ID = 'user-owner';
const OTHER_ID = 'user-other';
const PROJECT_ID = 'project-1';
const MATERIAL_ID = 'material-1';

function makeReq(body: unknown): NextRequest {
  return new NextRequest(`https://test/api/projects/${PROJECT_ID}/materials/${MATERIAL_ID}`, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer valid-access-token',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ projectId: PROJECT_ID, materialId: MATERIAL_ID }) };
}

beforeEach(() => {
  __cookieStore.clear();
  vi.mocked(verifyToken).mockReset();
});

describe('PATCH /api/projects/[projectId]/materials/[materialId]', () => {
  it('404s when the project belongs to a different user (IDOR)', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: OTHER_ID,
      email: 'other@test.local',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: OTHER_ID,
      email: 'other@test.local',
      tokenVersion: 0,
    } as never);
    prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);

    const res = await PATCH(makeReq({ valeur: 'Bardage bois' }), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.material.update).not.toHaveBeenCalled();
  });

  it("404s when the project doesn't exist at all", async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    } as never);
    prismaMock.project.findUnique.mockResolvedValue(null);

    const res = await PATCH(makeReq({ valeur: 'Bardage bois' }), ctx());
    expect(res.status).toBe(404);
  });

  it('404s when the material exists but belongs to a different project', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    } as never);
    prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);
    prismaMock.material.findUnique.mockResolvedValue({
      id: MATERIAL_ID,
      projectId: 'some-other-project',
    } as never);

    const res = await PATCH(makeReq({ valeur: 'Bardage bois' }), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.material.update).not.toHaveBeenCalled();
  });

  it('forces source=manuel and confidence=null on a successful manual edit', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    } as never);
    prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);
    prismaMock.material.findUnique.mockResolvedValue({
      id: MATERIAL_ID,
      projectId: PROJECT_ID,
    } as never);
    prismaMock.material.update.mockResolvedValue({
      id: MATERIAL_ID,
      face: 'facade_arriere',
      valeur: 'Bardage bois clair',
      source: 'manuel',
      confidence: null,
      updatedAt: new Date(),
    } as never);

    const res = await PATCH(makeReq({ valeur: 'Bardage bois clair' }), ctx());
    expect(res.status).toBe(200);
    expect(prismaMock.material.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { valeur: 'Bardage bois clair', source: 'manuel', confidence: null },
      }),
    );
  });

  it('400s on an empty valeur', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: OWNER_ID,
      email: 'owner@test.local',
      tokenVersion: 0,
    } as never);
    prismaMock.project.findUnique.mockResolvedValue({ userId: OWNER_ID } as never);

    const res = await PATCH(makeReq({ valeur: '' }), ctx());
    expect(res.status).toBe(400);
  });

  it('403s when CSRF header is missing', async () => {
    const req = new NextRequest(
      `https://test/api/projects/${PROJECT_ID}/materials/${MATERIAL_ID}`,
      {
        method: 'PATCH',
        headers: { authorization: 'Bearer valid-access-token', 'content-type': 'application/json' },
        body: JSON.stringify({ valeur: 'x' }),
      },
    );
    const res = await PATCH(req, ctx());
    expect(res.status).toBe(403);
  });
});
