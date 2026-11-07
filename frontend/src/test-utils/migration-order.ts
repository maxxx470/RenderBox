/**
 * The order Prisma applies the migrations in, declared once (2026-10-31).
 *
 * Prisma applies migration folders in BYTE order, not in the order they were
 * written — so a badly named new folder would run BEFORE a migration it
 * depends on, against the shared database (local = production). Every
 * migration shape test checks that, and each one used to say it its own way:
 * « I sort last ». Which stopped being true for all eleven of them the day a
 * twelfth was added, and told us nothing about the real invariant.
 *
 * So the list below is the chronological order, by hand, and the check is
 * that the byte order matches it. Adding a migration is appending one line
 * here; naming one so that it sorts into the middle of the list fails loudly,
 * which is the point.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';

/** frontend/src/test-utils → frontend/ */
const MIGRATIONS = join(resolve(__dirname, '../..'), 'prisma/migrations');

export const MIGRATION_ORDER: readonly string[] = [
  '0_init',
  '10_phase6_finition',
  '1_oauth_accounts',
  '20260829225539_tier_quota',
  '2_organizations',
  '3_admin',
  '4_phase3_admin_orders',
  '5_phase1_renderbox_core',
  '6_phase2_materials_memory',
  '7_phase3_presets',
  '8_phase4_second_engine',
  '9_phase5_advanced_editing',
  '9_phase7_materials_per_node',
  '9_phase8_credits',
  '9_phase9_auth_onboarding',
  '9_phase9b_engine_versions',
  '9_phase9c_user_engine_versions',
  '9_phase9d_support_messages',
  '9_phase9e_user_info_seen',
  '9_phase9f_render_provider_credits',
  '9_phase9g_render_sheet',
  '9_phase9h_kie_credits',
  '9_phase9i_building_sheets',
  '9_phase9j_reengagement',
  '9_phase9k_video_jobs',
];

const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** The folders on disk, in the order Prisma will apply them. */
export function migrationFoldersInApplyOrder(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => statSync(join(MIGRATIONS, f)).isDirectory())
    .sort(byteOrder);
}

/**
 * `name` runs after every migration written before it — and nothing has been
 * named so that it jumps the queue.
 */
export function expectAppliedAfterEarlier(name: string): void {
  expect(
    migrationFoldersInApplyOrder(),
    'a new migration folder must be appended to MIGRATION_ORDER in src/test-utils/migration-order.ts',
  ).toEqual([...MIGRATION_ORDER]);
  expect(MIGRATION_ORDER).toContain(name);
}
