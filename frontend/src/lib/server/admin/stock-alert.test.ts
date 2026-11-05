import { describe, it, expect } from 'vitest';
import { saleStockAlert, alertMessage } from './stock-alert';
import type { StockBalance } from './kie-stock';

const known = (balance: number): StockBalance => ({ kind: 'known', balance });

describe('saleStockAlert — when a sale leaves the stock short', () => {
  it('raises the alarm when the accounts hold more than Kie has left', () => {
    // 2 000 credits owed against 1 200 left: 800 of them cannot be served.
    const a = saleStockAlert({ stock: known(1200), circulation: 2000, soldCredits: 500 });
    expect(a?.level).toBe('red');
    expect(a?.missing).toBe(800);
    expect(a?.soldCredits).toBe(500);
  });

  it('warns while the stock is merely thin, before anything breaks', () => {
    const a = saleStockAlert({ stock: known(1100), circulation: 1000, soldCredits: 500 });
    expect(a?.level).toBe('orange');
    // Nothing is uncovered yet — the warning is about the margin, and
    // saying « 0 credits missing » keeps the message honest.
    expect(a?.missing).toBe(0);
  });

  it('says nothing when the stock covers what is owed', () => {
    expect(saleStockAlert({ stock: known(5000), circulation: 1000, soldCredits: 500 })).toBeNull();
  });

  it('says nothing when there is no Kie account at all', () => {
    // The renders then run on the direct Google / OpenAI keys and a site
    // credit answers to no stock, so there is nothing to be short of.
    expect(
      saleStockAlert({ stock: { kind: 'open' }, circulation: 9999, soldCredits: 500 }),
    ).toBeNull();
  });

  it('says nothing when Kie did not answer', () => {
    // A transient hiccup must not page the owner on every sale; the admin
    // page already shows that the balance could not be read.
    expect(
      saleStockAlert({ stock: { kind: 'unknown' }, circulation: 9999, soldCredits: 500 }),
    ).toBeNull();
  });

  it('says nothing when no account holds a credit', () => {
    // Nothing owed cannot be uncovered, whatever Kie reports.
    expect(saleStockAlert({ stock: known(0), circulation: 0, soldCredits: 500 })).toBeNull();
  });
});

describe('what the owner actually reads', () => {
  it('a red alert names the sale, the gap and what to do', () => {
    const a = saleStockAlert({ stock: known(1200), circulation: 2000, soldCredits: 500 })!;
    const { title, body } = alertMessage(a);
    expect(title).toContain('insuffisant');
    expect(body).toContain('500');
    expect(body).toContain('800');
    expect(body).toContain('kie.ai');
    // 1200 / 2000 = 60 %
    expect(body).toContain('60 %');
  });

  it('an orange alert does not claim anything is broken', () => {
    const a = saleStockAlert({ stock: known(1100), circulation: 1000, soldCredits: 500 })!;
    const { body } = alertMessage(a);
    expect(body).toContain('Tout fonctionne');
    expect(body).not.toContain('échoueront');
  });
});
