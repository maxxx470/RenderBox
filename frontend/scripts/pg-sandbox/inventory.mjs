// Inventory of the sandbox before anything in it is deleted (steps N2a/N2b).
// Every entry must be on an allow-list: the 11 top-level names, 4 files in
// dl/, under pgsql/ only what dl/pg.list lists (written before extraction),
// under work/ only paths that exist in the repository's prisma/, under data/
// only PostgreSQL's top-level names and an empty pg_tblspc/ (a tablespace
// there would be a junction). The marker must be a file of the exact shape
// P2 writes. Symlinks, junctions (Node reports both as links) and special
// files are refused; Windows reparse points Node does not see are checked
// separately by the shell (PowerShell, ReparsePoint attribute).
//
// The token printed is a SHA-256 over every entry's type, size, content
// SHA-256 and path: N2b deletes only if it recomputes the same token as the
// one N2a printed and the user typed back.
//
// CLI: node inventory.mjs <sandbox root> <repository prisma dir>
// Prints "INV_OK ABSENT", "INV_OK VIDE", "INV_OK <sha256>" + a summary, or
// "INV_REFUSED:<reason>".
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SANDBOX_ROOT_RE } from './zip-check.mjs';
import { parseList } from './extract-check.mjs';

export const MARKER_RE = /^nonce=[0-9a-f]{32}\npath=([A-Za-z]:\/rb-pgtest)\n$/;

const TOP = {
  '.rb-pgtest-marker': 'F',
  'lib.sh': 'F',
  'choice.txt': 'F',
  'pw_admin.txt': 'F',
  'pw.txt': 'F',
  'pgpass.conf': 'F',
  'pg.log': 'F',
  dl: 'D',
  work: 'D',
  pgsql: 'D',
  data: 'D',
};
const DL = { 'final-url.txt': 'F', 'pg.zip': 'F', 'pg.zip.sha256': 'F', 'pg.list': 'F' };
const DATA = new Set([
  'PG_VERSION',
  'base',
  'global',
  'pg_commit_ts',
  'pg_dynshmem',
  'pg_hba.conf',
  'pg_ident.conf',
  'pg_logical',
  'pg_multixact',
  'pg_notify',
  'pg_replslot',
  'pg_serial',
  'pg_snapshots',
  'pg_stat',
  'pg_stat_tmp',
  'pg_subtrans',
  'pg_tblspc',
  'pg_twophase',
  'pg_wal',
  'pg_xact',
  'postgresql.auto.conf',
  'postgresql.conf',
  'postmaster.opts',
  'postmaster.pid',
  'current_logfiles',
  'log',
]);

class Refused extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const no = (reason) => {
  throw new Refused(reason);
};

export function inventory(fsLike, root, repoPrisma) {
  try {
    if (!SANDBOX_ROOT_RE.test(root)) no('root_invalid');
    let st;
    try {
      st = fsLike.lstatSync(root);
    } catch (e) {
      if (e.code === 'ENOENT') return 'INV_OK ABSENT';
      throw e;
    }
    if (st.isSymbolicLink() || !st.isDirectory()) no('root_not_plain_directory');
    const items = [];
    const walk = (rel) => {
      for (const name of fsLike.readdirSync(rel ? root + '/' + rel : root)) {
        const r = rel ? rel + '/' + name : name;
        const s = fsLike.lstatSync(root + '/' + r);
        if (s.isSymbolicLink()) no('link:' + r);
        if (s.isDirectory()) {
          items.push({ t: 'D', size: 0, r });
          walk(r);
        } else if (s.isFile()) items.push({ t: 'F', size: s.size, r });
        else no('special:' + r);
      }
    };
    walk('');
    if (items.length === 0) return 'INV_OK VIDE';
    const has = (r) => items.some((i) => i.r === r);

    if (!items.some((i) => i.r === '.rb-pgtest-marker' && i.t === 'F')) no('marker_missing');
    const marker = MARKER_RE.exec(fsLike.readFileSync(root + '/.rb-pgtest-marker', 'utf8'));
    if (!marker) no('marker_content');
    if (marker[1] !== root) no('marker_path');

    let pg = null;
    if (has('pgsql')) {
      if (!has('dl/pg.list')) no('pgsql_without_list');
      pg = new Map(
        [...parseList(fsLike.readFileSync(root + '/dl/pg.list', 'utf8'))].map(([k, v]) => [k, v.t]),
      );
    }
    for (const { t, r } of items) {
      const segs = r.split('/');
      const top = segs[0];
      if (!Object.hasOwn(TOP, top)) no('unexpected:' + r);
      if (segs.length === 1) {
        if (TOP[top] !== t) no('type:' + r);
        continue;
      }
      if (top === 'dl') {
        if (segs.length !== 2 || !Object.hasOwn(DL, segs[1]) || DL[segs[1]] !== t)
          no('unexpected:' + r);
        continue;
      }
      if (top === 'pgsql') {
        if (pg.get(r) !== t) no('unexpected:' + r);
        continue;
      }
      if (top === 'work') {
        if (segs[1] !== 'prisma') no('unexpected:' + r);
        let s;
        try {
          s = fsLike.lstatSync(repoPrisma + (segs.length > 2 ? '/' + segs.slice(2).join('/') : ''));
        } catch {
          no('not_in_repo:' + r);
        }
        if ((s.isDirectory() ? 'D' : s.isFile() ? 'F' : '?') !== t) no('type:' + r);
        continue;
      }
      if (top === 'data') {
        if (!DATA.has(segs[1])) no('unexpected:' + r);
        if (segs[1] === 'pg_tblspc' && segs.length > 2) no('tablespace:' + r);
        continue;
      }
      no('unexpected:' + r);
    }

    const lines = items
      .map((i) => {
        const digest =
          i.t === 'F'
            ? crypto
                .createHash('sha256')
                .update(fsLike.readFileSync(root + '/' + i.r))
                .digest('hex')
            : '-';
        return i.t + ' ' + i.size + ' ' + digest + ' ' + i.r;
      })
      .sort();
    const token = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
    const count = (k) => items.filter((i) => i.r === k || i.r.startsWith(k + '/')).length;
    return (
      'INV_OK ' +
      token +
      '\n' +
      Object.keys(TOP)
        .filter(has)
        .map((k) => '  ' + k + ' : ' + count(k))
        .join('\n')
    );
  } catch (e) {
    return 'INV_REFUSED:' + (e instanceof Refused ? e.reason : 'exception:' + e.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(inventory(fs, process.argv[2] || '', process.argv[3] || ''));
}
