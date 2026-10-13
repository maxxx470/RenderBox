// The local-sandbox guard, one source for the shell steps and the PostgreSQL
// test suite: the process may only reach the throw-away PostgreSQL on
// 127.0.0.1:55432 (database rb_materials_test, role rb_test), never Neon, and
// may hold no production value from frontend/.env or .env.local.
//
// The server-side half (which server actually answers) is checked separately,
// against the database comment holding the sandbox marker's nonce.
//
// CLI: node guard.mjs <sandbox root>  → "SHELL_OK" or "REFUSED:<reason>"
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SANDBOX_ROOT_RE } from './zip-check.mjs';

export const SANDBOX = {
  host: '127.0.0.1',
  port: '55432',
  database: 'rb_materials_test',
  user: 'rb_test',
};
export const PASSWORD_RE = /^[A-Za-z0-9_-]{24}$/;

export function sandboxUrl(password) {
  return `postgresql://${SANDBOX.user}:${password}@${SANDBOX.host}:${SANDBOX.port}/${SANDBOX.database}?schema=public`;
}

/** "SHELL_OK" or "REFUSED:<reason>" — never a value of the environment. */
export function checkSandboxEnv(env, root, password) {
  if (!SANDBOX_ROOT_RE.test(root)) return 'REFUSED:root_invalid';
  const a = env.DATABASE_URL;
  const b = env.DIRECT_URL;
  if (!a || !b) return 'REFUSED:url_missing';
  if (a !== b) return 'REFUSED:url_differ';
  let u;
  try {
    u = new URL(a);
  } catch {
    return 'REFUSED:url_unparseable';
  }
  if (u.protocol !== 'postgresql:') return 'REFUSED:protocol';
  if (u.hostname !== SANDBOX.host) return 'REFUSED:host';
  if (u.port !== SANDBOX.port) return 'REFUSED:port';
  if (u.pathname !== '/' + SANDBOX.database) return 'REFUSED:database';
  if (u.username !== SANDBOX.user) return 'REFUSED:user';
  if (u.search !== '?schema=public' || u.hash !== '') return 'REFUSED:params';
  for (const k of Object.keys(env)) {
    if (/^PG/i.test(k) && k !== 'PGPASSFILE') return 'REFUSED:env_' + k;
  }
  if (env.PGPASSFILE !== root + '/pgpass.conf') return 'REFUSED:pgpassfile';
  if (typeof password !== 'string') return 'REFUSED:pw_unreadable';
  if (!PASSWORD_RE.test(password) || u.password !== password) return 'REFUSED:password';
  if (a !== sandboxUrl(password)) return 'REFUSED:url_shape';
  return 'SHELL_OK';
}

/**
 * The variable names a .env file defines (names only — values are never read out).
 * @param {string} text
 * @returns {string[]}
 */
export function envKeyNames(text) {
  /** @type {string[]} */
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m && m[1]) names.push(m[1]);
  }
  return names;
}

/**
 * The names, among `names`, whose value in `env` is neither empty nor an
 * allowed value (`allowed[name]`: the test fixtures and the sandbox URL).
 * Proves no production value from the .env files reached the process,
 * without reading those values.
 */
export function leakedEnvNames(env, names, allowed) {
  return [...new Set(names)].filter((k) => {
    const v = env[k];
    if (v === undefined || v === '') return false;
    return !(Object.hasOwn(allowed, k) && allowed[k] === v);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || '';
  let password = null;
  if (SANDBOX_ROOT_RE.test(root)) {
    try {
      password = fs.readFileSync(root + '/pw.txt', 'utf8');
    } catch {
      password = null;
    }
  }
  process.stdout.write(checkSandboxEnv(process.env, root, password));
}
