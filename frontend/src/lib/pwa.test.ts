// The installable app (2026-10-20): the manifest, the icons it names, the
// service worker's rules (what it may and may never store) and the platform
// detection behind the install card. The worker is run for real in a vm with
// a fake `self` and `caches`.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import sharp from 'sharp';
import manifest from '@/app/manifest';
import { buildCsp } from '@/lib/csp';
import { detectPlatform } from '@/lib/pwa-install';

const PUBLIC = path.resolve(__dirname, '../../public');

describe('the web app manifest', () => {
  const m = manifest();

  it('is an app of its own: name, start page inside its scope, standalone window', () => {
    expect(m.name).toBe('RenderPro');
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/');
    expect(m.start_url?.startsWith('/app')).toBe(true);
    expect(m.id).toBe('/app');
    expect(m.theme_color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it('names real icons of the right size, any and maskable (every launcher)', async () => {
    const purposes = new Set(m.icons?.map((i) => i.purpose));
    expect(purposes).toEqual(new Set(['any', 'maskable']));
    for (const icon of m.icons ?? []) {
      const file = path.join(PUBLIC, icon.src);
      expect(fs.existsSync(file)).toBe(true);
      const meta = await sharp(file).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
    }
    // Android's install prompt needs 192 and 512.
    const sizes = (m.icons ?? []).map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('shortcuts lead to real app pages', () => {
    for (const s of m.shortcuts ?? []) expect(s.url.startsWith('/app/')).toBe(true);
    expect((m.shortcuts ?? []).length).toBeGreaterThan(0);
  });
});

describe('the service worker', () => {
  const source = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

  function load() {
    const handlers: Record<string, (e: unknown) => void> = {};
    const store = new Map<string, Map<string, unknown>>();
    const caches = {
      open: async (name: string) => {
        const cache = store.get(name) ?? new Map();
        store.set(name, cache);
        return {
          match: async (req: unknown) =>
            cache.get(typeof req === 'string' ? req : (req as { url: string }).url),
          put: async (req: { url: string }, res: unknown) => void cache.set(req.url, res),
          addAll: async (urls: string[]) => urls.forEach((u) => cache.set(u, { offline: u })),
          keys: async () => [...cache.keys()],
          delete: async (k: string) => cache.delete(k),
        };
      },
      match: async (u: string) => {
        for (const c of store.values()) if (c.has(u)) return c.get(u);
        return undefined;
      },
      keys: async () => [...store.keys()],
      delete: async (n: string) => store.delete(n),
    };
    const fetchMock = vi.fn(async () => {
      throw new Error('offline');
    });
    const self = {
      location: { origin: 'https://www.renderpro.app' },
      addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    };
    vm.runInNewContext(source, {
      self,
      caches,
      fetch: fetchMock,
      URL,
      Response: { error: () => ({ error: true }) },
      Promise,
    });
    return { handlers, caches, fetchMock, store };
  }

  const req = (
    url: string,
    init: { method?: string; mode?: string; destination?: string } = {},
  ) => ({
    url,
    method: init.method ?? 'GET',
    mode: init.mode ?? 'cors',
    destination: init.destination ?? '',
  });
  const fire = (h: (e: unknown) => void, request: unknown) => {
    const respondWith = vi.fn();
    h({ request, respondWith });
    return respondWith;
  };
  const ORIGIN = 'https://www.renderpro.app';

  it('never touches the API, other origins, the worker itself or anything but GET', () => {
    const { handlers } = load();
    const f = handlers.fetch!;
    expect(
      fire(f, req(`${ORIGIN}/api/render-nodes/n1/image`, { destination: 'image' })),
    ).not.toHaveBeenCalled();
    expect(fire(f, req(`${ORIGIN}/api/credits`))).not.toHaveBeenCalled();
    expect(fire(f, req(`${ORIGIN}/api/projects`, { method: 'POST' }))).not.toHaveBeenCalled();
    expect(fire(f, req('https://elsewhere.example/_next/static/a.js'))).not.toHaveBeenCalled();
    expect(fire(f, req(`${ORIGIN}/sw.js`))).not.toHaveBeenCalled();
    expect(fire(f, req(`${ORIGIN}/app/generer`, { method: 'HEAD' }))).not.toHaveBeenCalled();
  });

  it('a page is always asked of the server, and the offline page answers only when it is gone', async () => {
    const { handlers, fetchMock, caches } = load();
    // Install precaches the offline page.
    await new Promise<void>((resolve) =>
      handlers.install!({ waitUntil: (p: Promise<unknown>) => void p.then(() => resolve()) }),
    );
    const respond = fire(handlers.fetch!, req(`${ORIGIN}/app/images`, { mode: 'navigate' }));
    expect(respond).toHaveBeenCalledTimes(1);
    const answer = await (respond.mock.calls[0]![0] as Promise<unknown>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(answer).toEqual({ offline: '/offline' });
    // Nothing of the page was stored.
    expect(await caches.match(`${ORIGIN}/app/images`)).toBeUndefined();
  });

  it('keeps the hashed Next chunks and the icons, answered from the cache the second time', async () => {
    const { handlers, fetchMock } = load();
    fetchMock.mockImplementation(
      async () => ({ ok: true, clone: () => ({ cloned: true }) }) as never,
    );
    const url = `${ORIGIN}/_next/static/chunks/a.js`;
    const first = fire(handlers.fetch!, req(url));
    await first.mock.calls[0]![0];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const second = fire(handlers.fetch!, req(url));
    expect(await second.mock.calls[0]![0]).toEqual({ cloned: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('only the site’s own public pictures are kept, never a user’s', () => {
    const { handlers } = load();
    expect(
      fire(handlers.fetch!, req(`${ORIGIN}/brand/mark.webp`, { destination: 'image' })),
    ).toHaveBeenCalledTimes(1);
    expect(
      fire(handlers.fetch!, req(`${ORIGIN}/communaute/1.webp`, { destination: 'image' })),
    ).not.toHaveBeenCalled();
  });

  it('retires the caches of an older version on activate', async () => {
    const { handlers, store, caches } = load();
    store.set('rp-v0-static', new Map());
    store.set('rp-v1-static', new Map());
    store.set('other-site', new Map());
    await new Promise<void>((resolve) =>
      handlers.activate!({ waitUntil: (p: Promise<unknown>) => void p.then(() => resolve()) }),
    );
    expect(await caches.keys()).toEqual(['rp-v1-static', 'other-site']);
  });
});

describe('the platform behind the install steps', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const MAC_SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const CHROME_WIN =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const CHROME_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

  it('iPhone, iPad (also when it says it is a Mac), Safari on Mac, everything else', () => {
    expect(detectPlatform({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBe(
      'ios',
    );
    expect(detectPlatform({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(
      'ios',
    );
    expect(detectPlatform({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
      'mac-safari',
    );
    expect(detectPlatform({ userAgent: CHROME_WIN, platform: 'Win32', maxTouchPoints: 0 })).toBe(
      'other',
    );
    expect(
      detectPlatform({ userAgent: CHROME_ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 }),
    ).toBe('other');
  });
});

describe('the policy lets the worker and the manifest load', () => {
  it('names worker-src and manifest-src', () => {
    const { policy } = buildCsp({ nonce: 'n', isProduction: true, enforce: false });
    expect(policy).toContain("worker-src 'self'");
    expect(policy).toContain("manifest-src 'self'");
  });
});
