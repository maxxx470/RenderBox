// frontend/src/lib/server/observability/vercel-json-shape.test.ts — Phase 5 D-20.
//
// Tripwire: verifies vercel.json declares the daily-eligible cron schedules
// with valid cron-format strings and paths that correspond to actual
// route.ts files.
//
// RenderBox runs on Vercel Hobby, which only permits once-per-day cron
// schedules. Only the 3 crons that are genuinely daily
// (webhook-log-purge / email-job-purge / account-purge) stay registered in
// vercel.json. The 5 sub-daily crons (outbox-drain, email-queue-drain,
// verification-cleanup, order-expiration, maketou-reconcile) still exist as
// route.ts handlers guarded by verifyCronSecret, but are invoked by an
// external scheduler (e.g. cron-job.org) instead — see README.md
// "Déploiement Vercel" for the exact URLs/schedules. Upgrading to Vercel Pro
// would allow moving them back into this file.
//
// Once GREEN, this test guards against route-rename / schedule-drift
// regressions where a developer renames a cron route file but forgets
// vercel.json (or vice versa).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fg from 'fast-glob';

// frontend/src/lib/server/observability/ → frontend/ is 4 levels up.
const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(here, '../../../../');
const VERCEL_JSON = resolve(FRONTEND_ROOT, 'vercel.json');
const APP_API_CRON = resolve(FRONTEND_ROOT, 'src/app/api/cron');

const PATH_RE = /^\/api\/cron\/[a-z][a-z0-9-]*$/;
// Permissive cron-format: 5 fields, each containing only digits, *, /, ,, -, or whitespace
const SCHED_RE = /^[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+\s+[\d*/,-]+$/;

interface VercelConfig {
  crons?: Array<{ path: string; schedule: string }>;
}

describe('vercel.json schema (CRON-07, D-20)', () => {
  it('frontend/vercel.json exists', () => {
    expect(existsSync(VERCEL_JSON)).toBe(true);
  });

  it('declares exactly 3 cron schedules (Hobby plan: daily-only)', () => {
    if (!existsSync(VERCEL_JSON)) return; // skip silently when RED-by-design
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    expect(cfg.crons).toBeDefined();
    expect(cfg.crons!.length).toBe(3);
  });

  it('every cron path matches /^\\/api\\/cron\\/[a-z-]+$/ and schedule is valid 5-field cron', () => {
    if (!existsSync(VERCEL_JSON)) return;
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    for (const c of cfg.crons ?? []) {
      expect(c.path).toMatch(PATH_RE);
      expect(c.schedule).toMatch(SCHED_RE);
    }
  });

  it('every cron path corresponds to an existing app/api/cron/<name>/route.ts file', async () => {
    if (!existsSync(VERCEL_JSON)) return;
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const routeFiles = await fg('*/route.ts', { cwd: APP_API_CRON, onlyFiles: true });
    const routeNames = new Set(routeFiles.map((f) => f.split('/')[0]));
    for (const c of cfg.crons ?? []) {
      const name = c.path.replace('/api/cron/', '');
      expect(
        routeNames.has(name),
        `vercel.json declares /api/cron/${name} but no route.ts found`,
      ).toBe(true);
    }
  });

  it('declares schedules for the 3 daily-eligible crons (Hobby plan)', () => {
    if (!existsSync(VERCEL_JSON)) return;
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const paths = (cfg.crons ?? []).map((c) => c.path).sort();
    expect(paths).toEqual([
      '/api/cron/account-purge',
      '/api/cron/email-job-purge',
      '/api/cron/webhook-log-purge',
    ]);
  });

  it('every declared schedule is once-per-day or less frequent (Hobby plan limit)', () => {
    if (!existsSync(VERCEL_JSON)) return;
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    for (const c of cfg.crons ?? []) {
      const [minute = '*', hour = '*'] = c.schedule.split(/\s+/);
      const isDailyOrLess =
        minute !== '*' && !minute.includes('/') && hour !== '*' && !hour.includes('/');
      expect(isDailyOrLess, `${c.path} schedule "${c.schedule}" runs more than once/day`).toBe(
        true,
      );
    }
  });

  it('the 5 sub-daily cron routes still exist for external-scheduler invocation', () => {
    const externallyScheduled = [
      'outbox-drain',
      'email-queue-drain',
      'verification-cleanup',
      'order-expiration',
      'maketou-reconcile',
    ];
    for (const name of externallyScheduled) {
      expect(
        existsSync(resolve(APP_API_CRON, name, 'route.ts')),
        `expected app/api/cron/${name}/route.ts to exist for external scheduling`,
      ).toBe(true);
    }
  });
});
