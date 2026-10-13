// Step V: reads the Postgres major version of the Neon project RenderBox uses,
// through Neon's console API — never through the database (no SQL, no
// Prisma). The project is the one whose endpoint host is DIRECT_URL's host in
// frontend/.env; that host, the URL and the API key are never printed.
//
// The key comes from RB_NEON_KEY (typed by the user, hidden); a personal key
// working on an organisation's projects also needs RB_NEON_ORG.
//
// CLI: node neon-version.mjs <path of frontend/.env>
// stdout: the major version (14–18) only; stderr: the project's name, or
// "V_REFUSED:<reason>". Exit code 0 only when exactly one project matches.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SUPPORTED_MAJORS = [14, 15, 16, 17, 18];
const NEON_HOST_RE = /^ep-[a-z0-9-]+[.][a-z0-9.-]+[.]neon[.]tech$/;

/** DIRECT_URL's host from a .env text, or a reason. Nothing else is read. */
export function directHost(envText) {
  const line = envText.split(/\r?\n/).find((l) => l.startsWith('DIRECT_URL='));
  if (!line) return { ok: false, reason: 'direct_url_absent' };
  let host;
  try {
    host = new URL(
      line
        .slice('DIRECT_URL='.length)
        .trim()
        .replace(/^["']|["']$/g, ''),
    ).hostname;
  } catch {
    return { ok: false, reason: 'direct_url_unreadable' };
  }
  if (!NEON_HOST_RE.test(host)) return { ok: false, reason: 'host_not_neon' };
  return { ok: true, host };
}

/**
 * The single project owning an endpoint with this host, and its version.
 * `endpointsOf(projectId)` returns that project's endpoints.
 */
export async function pickProject(projects, endpointsOf, host) {
  if (!Array.isArray(projects) || projects.length === 0)
    return { ok: false, reason: 'no_project_visible' };
  const hits = [];
  for (const p of projects) {
    const endpoints = await endpointsOf(p.id);
    if ((endpoints || []).some((e) => e.host === host)) hits.push(p);
  }
  if (hits.length !== 1) return { ok: false, reason: 'matches_' + hits.length };
  const v = hits[0].pg_version;
  if (!SUPPORTED_MAJORS.includes(v)) return { ok: false, reason: 'unexpected_version_' + v };
  return { ok: true, version: v, name: String(hits[0].name), projects: projects.length };
}

async function main() {
  const fail = (r) => {
    process.stderr.write('V_REFUSED:' + r + '\n');
    process.exit(1);
  };
  const key = process.env.RB_NEON_KEY || '';
  if (!/^[!-~]{20,300}$/.test(key)) fail('key_missing_or_malformed');
  const org = process.env.RB_NEON_ORG || '';
  if (org && !/^[A-Za-z0-9_-]{1,100}$/.test(org)) fail('org_id_malformed');
  const found = directHost(fs.readFileSync(process.argv[2], 'utf8'));
  if (!found.ok) fail(found.reason);
  const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json' };
  const get = async (path) => {
    const r = await fetch('https://console.neon.tech/api/v2' + path, {
      headers,
      redirect: 'error',
    });
    if (!r.ok) fail('http_' + r.status);
    return r.json();
  };
  const projects = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const q =
      '?limit=400' +
      (org ? '&org_id=' + org : '') +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const j = await get('/projects' + q);
    projects.push(...(j.projects || []));
    cursor = (j.pagination && j.pagination.cursor) || '';
    if (!cursor || (j.projects || []).length < 400) break;
  }
  const res = await pickProject(
    projects,
    async (id) => (await get('/projects/' + encodeURIComponent(id) + '/endpoints')).endpoints,
    found.host,
  );
  if (!res.ok) fail(res.reason);
  process.stderr.write(
    '  projet Neon « ' +
      res.name +
      ' » : Postgres ' +
      res.version +
      ' (un seul projet sur ' +
      res.projects +
      ' possède l’hôte de DIRECT_URL)\n',
  );
  process.stdout.write(String(res.version));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write('V_REFUSED:exception_' + e.message + '\n');
    process.exit(1);
  });
}
