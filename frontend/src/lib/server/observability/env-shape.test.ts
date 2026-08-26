// Source: planner-derived; covers OPS-01 + OPS-04.
// Asserts .env.example documents the dual Neon URL contract + CRON_SECRET.
//
// On failure, each assertion message names the offending file path so an
// incident responder can grep a CI log without grepping the test source.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// frontend/src/lib/server/observability/ → repo root is 5 levels up.
// Use import.meta.url so this works under both ESM and CJS Vitest configs.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_EXAMPLE = resolve(__dirname, '../../../../../.env.example');

describe('.env.example shape (OPS-01, OPS-04)', () => {
  const src = readFileSync(ENV_EXAMPLE, 'utf8');

  it(`declares DATABASE_URL using the Neon -pooler hostname (file: ${ENV_EXAMPLE})`, () => {
    // Hostname shape: <project>-pooler.<region>.aws.neon.tech (e.g. ep-xxx-pooler.us-east-2.aws.neon.tech).
    // Matches plan key_links pattern: `-pooler\.[a-z0-9-]+\.aws\.neon\.tech`.
    expect(src).toMatch(/DATABASE_URL="postgresql:\/\/[^"]*-pooler\.[a-z0-9-]+\.aws\.neon\.tech/);
  });

  it('DATABASE_URL carries pgbouncer=true & connection_limit=1 & pool_timeout=15 & sslmode=require', () => {
    // Match a single DATABASE_URL line with all four params (order-independent).
    const m = src.match(/^DATABASE_URL="([^"]+)"/m);
    expect(m, `DATABASE_URL line not found in ${ENV_EXAMPLE}`).not.toBeNull();
    const url = m![1]!;
    expect(url).toContain('pgbouncer=true');
    expect(url).toContain('connection_limit=1');
    expect(url).toContain('pool_timeout=15');
    expect(url).toContain('sslmode=require');
  });

  it('declares DIRECT_URL for prisma migrate deploy', () => {
    expect(src).toMatch(/^DIRECT_URL="postgresql:\/\/[^"]+"/m);
  });

  it('declares CRON_SECRET with empty default + openssl hint', () => {
    expect(src).toMatch(/^CRON_SECRET=""/m);
    expect(src).toContain('openssl rand -base64 32');
  });

  it('explains why DIRECT_URL is needed (prevents future deletion)', () => {
    // D-03: short rationale comment near DIRECT_URL.
    expect(src.toLowerCase()).toContain('migrate deploy');
  });
});

// ───────────────────────────────────────────────────────────────────────
// Phase 4 — UPLOAD + Cloudinary + WITHDRAWAL safety knobs.
//
// These assertions are tripwires: refactors that "tidy up" .env.example by
// stripping the FINANCIAL-SAFETY warning block or the verbatim defaults
// will fail CI here. The wording is the product — the test quotes it
// character-for-character.
// ───────────────────────────────────────────────────────────────────────
describe('.env.example RenderBox additions (upload + storage + AI engine)', () => {
  const src = readFileSync(ENV_EXAMPLE, 'utf8');

  it('declares the upload allow-list and max-bytes defaults', () => {
    expect(src).toContain('UPLOAD_ALLOWED_MIME="image/jpeg,image/png,image/webp"');
    expect(src).toContain('UPLOAD_MAX_BYTES="15728640"');
  });

  it('declares BLOB_READ_WRITE_TOKEN with an empty default', () => {
    expect(src).toMatch(/^BLOB_READ_WRITE_TOKEN=""$/m);
  });

  it('declares GEMINI_API_KEY with an empty default', () => {
    expect(src).toMatch(/^GEMINI_API_KEY=""$/m);
  });

  it('declares magic-link tunables', () => {
    expect(src).toContain('AUTH_MAGIC_LINK_TTL_MIN=15');
    expect(src).toContain('AUTH_MAGIC_LINK_RATE_LIMIT_MAX=3');
  });
});

// ───────────────────────────────────────────────────────────────────────
// Phase 5 — webhook log retention + order expiration knobs.
//
// Tripwires for the two new env keys CRON-05 (webhook-log-purge retention)
// and the Phase-3 fork-knob ORDER_EXPIRATION_MINUTES. Refactors that drop
// either default fail CI here.
// ───────────────────────────────────────────────────────────────────────
describe('.env.example phase 5 additions (CRON-05 + Phase 5 ENV)', () => {
  const src = readFileSync(ENV_EXAMPLE, 'utf8');

  it('contains WEBHOOK_LOG_RETENTION_DAYS and ORDER_EXPIRATION_MINUTES with defaults', () => {
    expect(src).toContain('WEBHOOK_LOG_RETENTION_DAYS="90"');
    expect(src).toContain('ORDER_EXPIRATION_MINUTES="30"');
  });
});

// ───────────────────────────────────────────────────────────────────────
// Phase 6 — Maketou payments + account-purge retention knob.
// ───────────────────────────────────────────────────────────────────────
describe('.env.example phase 6 additions (Maketou + account deletion)', () => {
  const src = readFileSync(ENV_EXAMPLE, 'utf8');

  it('declares MAKETOU_API_KEY and MAKETOU_PRODUCT_ID with empty defaults', () => {
    expect(src).toContain('MAKETOU_API_KEY=""');
    expect(src).toContain('MAKETOU_PRODUCT_ID=""');
  });

  it('contains ACCOUNT_DELETION_GRACE_DAYS with a 30-day default', () => {
    expect(src).toContain('ACCOUNT_DELETION_GRACE_DAYS="30"');
  });
});
