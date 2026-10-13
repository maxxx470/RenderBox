// Which handler Next.js picks for the paths under one image (étape 3C.5.5).
// The attach route lived under materials/ as a static "attach" segment,
// which Next.js prefers to materials/[face] — a face whose key is "attach" could
// not be read, set or cancelled any more. It now lives at …/legacy-attach.
//
// The routes are read from the files under src/app/api, as Next.js reads
// them, and ordered and matched by Next.js's own helpers (getSortedRoutes,
// getRouteRegex) — no server is started. The handlers themselves are
// exercised in materials/[face]/route.test.ts and legacy-attach/route.test.ts.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import '@/test-utils/prisma-mock';
import { getSortedRoutes } from 'next/dist/shared/lib/router/utils/sorted-routes';
import { getRouteRegex } from 'next/dist/shared/lib/router/utils/route-regex';

const SRC = join(process.cwd(), 'src');
const APP = join(SRC, 'app');
const NODE_DIR = join(APP, 'api', 'projects', '[projectId]', 'nodes', '[nodeId]');
const FACE_ROUTE = '/api/projects/[projectId]/nodes/[nodeId]/materials/[face]';
const ATTACH_ROUTE = '/api/projects/[projectId]/nodes/[nodeId]/legacy-attach';
/** Built, so this file does not count as a reference to the old path. */
const OLD_SEGMENT = ['materials', 'attach'].join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every API route as Next.js names it: route groups dropped, one per route.ts. */
function apiRoutes(): string[] {
  return walk(join(APP, 'api'))
    .filter((f) => f.endsWith(`${sep}route.ts`))
    .map((f) => {
      const segments = relative(APP, f).split(sep).slice(0, -1);
      return '/' + segments.filter((s) => !/^\(.*\)$/.test(s)).join('/');
    });
}

const SORTED = getSortedRoutes(apiRoutes());

/** The route Next.js serves a path with: the first, in its order, that matches. */
function resolve(path: string): string | undefined {
  return SORTED.find((r) => getRouteRegex(r).re.test(path));
}

const IMAGE = '/api/projects/p1/nodes/n1';

describe('routing under one image (3C.5.5)', () => {
  it('a face named "attach" reaches materials/[face] — for GET, PUT and DELETE alike', () => {
    // One route serves every method: the path decides, not the verb.
    expect(resolve(`${IMAGE}/${OLD_SEGMENT}`)).toBe(FACE_ROUTE);
    expect(resolve(`${IMAGE}/materials/Attach`)).toBe(FACE_ROUTE);
    expect(resolve(`${IMAGE}/materials/legacy-attach`)).toBe(FACE_ROUTE);
  });

  it('the attach route is reached at …/legacy-attach', () => {
    expect(resolve(`${IMAGE}/legacy-attach`)).toBe(ATTACH_ROUTE);
    expect(resolve(`${IMAGE}/materials`)).toBe(
      '/api/projects/[projectId]/nodes/[nodeId]/materials',
    );
  });

  it('nothing static sits beside materials/[face]: any face name reaches it', () => {
    const beside = readdirSync(join(NODE_DIR, 'materials')).filter((n) =>
      statSync(join(NODE_DIR, 'materials', n)).isDirectory(),
    );
    expect(beside).toEqual(['[face]']);
    expect(SORTED.filter((r) => r.startsWith(`${FACE_ROUTE.slice(0, -'[face]'.length)}`))).toEqual([
      FACE_ROUTE,
    ]);
  });

  it('the old route is gone: no file, no route', () => {
    expect(existsSync(join(NODE_DIR, 'materials', 'attach'))).toBe(false);
    expect(SORTED.some((r) => r.endsWith(`/${OLD_SEGMENT}`))).toBe(false);
  });

  it('the handlers: POST only at legacy-attach; GET, PUT and DELETE at materials/[face]', async () => {
    const attach = await import('./legacy-attach/route');
    expect(typeof attach.POST).toBe('function');
    expect(Object.keys(attach).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
    expect(attach.runtime).toBe('nodejs');

    const face = await import('./materials/[face]/route');
    expect(
      Object.keys(face)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort(),
    ).toEqual(['DELETE', 'GET', 'PUT']);
  });

  it('no file under src still names the old path', () => {
    const offenders = walk(SRC)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes(OLD_SEGMENT))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
