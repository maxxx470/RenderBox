// Checks what the extraction wrote under <root>/pgsql against dl/pg.list, the
// list zip-check.mjs produced from the archive before extraction (step P5b):
// every listed file present with its exact name, type, size and CRC-32, every
// listed directory present, nothing else, no symlink or junction. Nothing is
// executed here.
//
// CLI: node extract-check.mjs <sandbox root>
// Prints "EXTRACT_OK <entries>" or "EXTRACT_REFUSED:<reason>".
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { SANDBOX_ROOT_RE } from './zip-check.mjs';

const LINE_RE = /^([FD]) ([0-9]+) ([0-9a-f]{8}) (pgsql\/.*)$/;

class Refused extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}
const no = (reason) => {
  throw new Refused(reason);
};

/** The entries pg.list allows, implied parent directories included. */
export function parseList(text) {
  const want = new Map();
  for (const line of text.split('\n')) {
    if (line === '') continue;
    const m = LINE_RE.exec(line);
    if (!m) no('pg_list_malformed');
    const name = m[4].replace(/\/$/, '');
    want.set(name, { t: m[1], size: Number(m[2]), crc: m[3] });
    const segs = name.split('/');
    for (let i = 1; i < segs.length; i++) {
      const d = segs.slice(0, i).join('/');
      if (!want.has(d)) want.set(d, { t: 'D' });
    }
  }
  return want;
}

export function checkExtraction(fsLike, root) {
  try {
    if (!SANDBOX_ROOT_RE.test(root)) no('root_invalid');
    const want = parseList(fsLike.readFileSync(root + '/dl/pg.list', 'utf8'));
    const rs = fsLike.lstatSync(root + '/pgsql');
    if (rs.isSymbolicLink() || !rs.isDirectory()) no('pgsql_not_plain_directory');
    const seen = new Set(['pgsql']);
    const walk = (rel) => {
      for (const name of fsLike.readdirSync(root + '/' + rel)) {
        const r = rel + '/' + name;
        const s = fsLike.lstatSync(root + '/' + r);
        const w = want.get(r);
        if (s.isSymbolicLink()) no('link:' + r);
        if (!w) no('unexpected:' + r);
        if (s.isDirectory()) {
          if (w.t !== 'D') no('type:' + r);
          seen.add(r);
          walk(r);
        } else if (s.isFile()) {
          if (w.t !== 'F') no('type:' + r);
          if (s.size !== w.size) no('size:' + r);
          const c = (zlib.crc32(fsLike.readFileSync(root + '/' + r)) >>> 0)
            .toString(16)
            .padStart(8, '0');
          if (c !== w.crc) no('crc:' + r);
          seen.add(r);
        } else no('special:' + r);
      }
    };
    walk('pgsql');
    for (const k of want.keys()) if (!seen.has(k)) no('missing:' + k);
    return 'EXTRACT_OK ' + seen.size;
  } catch (e) {
    return 'EXTRACT_REFUSED:' + (e instanceof Refused ? e.reason : 'exception:' + e.message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(checkExtraction(fs, process.argv[2] || ''));
}
