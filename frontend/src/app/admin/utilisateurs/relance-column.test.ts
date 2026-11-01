// « Relances » in the back-office's users section (2026-11-01, owner: « tu me
// fais savoir si ça a été relancé dans l'espace admin … le nombre de relances
// sur le nombre total »).
//
// What must stay true, and is cheap to check at the source:
//
//  1. The figure comes from schedule.ts's own `reengagementProgress`, never
//     from a count re-derived in a route — a second implementation of the
//     rules would drift from the sender within a week.
//  2. The fact-gathering stays batched. One query per fact for a whole page,
//     not one per user: the table lists up to a hundred accounts.
//  3. It reads the GUARD columns for real. run.ts filters the guarded
//     accounts out before it starts and hands schedule.ts `false`; here a
//     desubscribed account must still appear, saying why it hears nothing.
//  4. Both dictionaries carry every label, or the owner reads a raw key.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fr from '@/lib/i18n/dictionaries/fr';
import en from '@/lib/i18n/dictionaries/en';
import type { TranslationKey } from '@/lib/i18n/dictionaries';

const SRC = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

const LIST_ROUTE = read('app/api/admin/users/route.ts');
const DETAIL_ROUTE = read('app/api/admin/users/[id]/route.ts');
const LIST_PAGE = read('app/admin/utilisateurs/page.tsx');
const DETAIL_PAGE = read('app/admin/utilisateurs/[id]/page.tsx');
const FACTS = read('lib/server/reengagement/facts.ts');

describe('the figure comes from the sender’s own rules', () => {
  it.each([
    ['the list route', LIST_ROUTE],
    ['the user’s file', DETAIL_ROUTE],
  ])('%s asks schedule.ts, and answers with `reengagement`', (_name, src) => {
    expect(src).toContain('reengagementProgress');
    expect(src).toContain('gatherReengagementFacts');
    expect(src).toContain('reengagement');
  });

  it('neither route counts the relances itself', () => {
    // A `reengagementEmail.count()` here would be a second, drifting
    // implementation of « how many is this account owed ».
    expect(LIST_ROUTE).not.toContain('reengagementEmail');
    expect(DETAIL_ROUTE).not.toContain('reengagementEmail');
  });

  it('the user’s file lists each relance with its date', () => {
    expect(DETAIL_ROUTE).toContain('history');
    expect(DETAIL_ROUTE).toContain('sentAt');
  });
});

describe('the gathering is batched and read-only', () => {
  it('queries by a list of ids, not one user at a time', () => {
    expect(FACTS).toContain('in: ids');
    // Five reads at most for a whole page: user, orders, support, relances,
    // renders. Any `for (const` around a query would be the N+1.
    const queries = FACTS.match(/prisma\.\w+\.\w+\(/g) ?? [];
    expect(queries.length).toBeLessThanOrEqual(5);
  });

  it('writes nothing', () => {
    for (const write of ['.create(', '.update(', '.delete(', '.upsert(', '$executeRaw']) {
      expect(FACTS).not.toContain(write);
    }
  });

  it('survives an empty or missing result instead of throwing', () => {
    // The users table must still load when a relance read comes back empty.
    expect(FACTS).toContain('?? []');
  });

  it('reads the guards for real, unlike the sender’s own pass', () => {
    for (const col of ['marketingUnsubscribedAt', 'emailBouncedAt', 'deletedAt', 'status']) {
      expect(FACTS).toContain(col);
    }
    expect(FACTS).toContain("u.status === 'SUSPENDED'");
    expect(FACTS).toContain('u.deletedAt !== null');
  });
});

describe('what the owner actually sees', () => {
  it('the table has a Relances column showing sent over total', () => {
    expect(LIST_PAGE).toContain('admin.users.colRelances');
    expect(LIST_PAGE).toContain('u.reengagement.sent');
    expect(LIST_PAGE).toContain('u.reengagement.total');
  });

  it('and names the guard when the sequence has stopped', () => {
    expect(LIST_PAGE).toContain('STOP_KEY');
    expect(LIST_PAGE).toContain('u.reengagement.stopped');
  });

  it('red text on white is the charter’s #C21F33, not the badge red', () => {
    expect(LIST_PAGE).toContain('#C21F33');
    expect(LIST_PAGE).not.toContain('text-[#F34857]');
  });

  it('the file names each relance as /admin/relances names it', () => {
    expect(DETAIL_PAGE).toContain('admin.relances.name.');
  });

  it('the file says a row is written at send time, not at delivery', () => {
    // Without this the owner would read the list as proof of delivery; the
    // row is reserved BEFORE the send, deliberately (run.ts).
    expect(DETAIL_PAGE).toContain('admin.users.relanceReserved');
  });
});

describe('both dictionaries', () => {
  const KEYS: TranslationKey[] = [
    'admin.users.colRelances',
    'admin.users.relanceHint',
    'admin.users.relanceTitle',
    'admin.users.relanceEmpty',
    'admin.users.relanceReserved',
    'admin.users.relanceStage.prospect',
    'admin.users.relanceStage.subscriber',
    'admin.users.relanceStage.lapsed',
    'admin.users.relanceStage.dormant',
    'admin.users.relanceStage.none',
    'admin.users.relanceStop.unsubscribed',
    'admin.users.relanceStop.bounced',
    'admin.users.relanceStop.suspended',
    'admin.users.relanceStop.deleted',
  ];

  it.each(KEYS)('%s is in French and in English', (key) => {
    expect(fr[key]).toBeTruthy();
    expect(en[key]).toBeTruthy();
  });

  it('the French says « vous », never « tu »', () => {
    for (const key of KEYS) {
      expect(fr[key]).not.toMatch(/(?<!\p{L})(tu|ton|ta|tes|toi)(?!\p{L})/iu);
    }
  });
});
