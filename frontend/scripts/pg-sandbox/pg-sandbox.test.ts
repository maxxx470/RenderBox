// The local PostgreSQL sandbox's safety checks, on SYNTHETIC inputs only:
// archives built in memory, a simulated file system, made-up signature
// reports and Neon API answers. Nothing here downloads, extracts, starts a
// server or contacts Neon. What these tests show is the checks' logic; they
// say nothing about the real EDB archive, which has never been run through
// them.
import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { checkZip, defaultOptions } from './zip-check.mjs';
import { checkExtraction } from './extract-check.mjs';
import { inventory } from './inventory.mjs';
import { checkSandboxEnv, sandboxUrl, envKeyNames, leakedEnvNames } from './guard.mjs';
import { archiveMode, evaluateSignatures, PINNED_ARCHIVES } from './policy.mjs';
import { directHost, pickProject } from './neon-version.mjs';

const ROOT = 'C:/rb-pgtest';
const REPO_PRISMA = 'C:/repo/frontend/prisma';
const BS = String.fromCharCode(92);
const crc = (b: Buffer) => zlib.crc32(b) >>> 0;
const hex8 = (s: string) => crc(Buffer.from(s)).toString(16).padStart(8, '0');

// ── An in-memory ZIP builder (stored entries) ────────────────────────────

interface Item {
  name: string;
  data?: string;
  nameBuf?: Buffer;
  localName?: string;
  utf8?: boolean;
  flags?: number;
  method?: number;
  extraC?: Buffer;
  extraL?: Buffer;
  ext?: number;
  madeBy?: number;
  csize?: number;
  lhoFrom?: number;
}
interface BuildOpts {
  zip64?: boolean;
  badLocator?: boolean;
  disk?: number;
  count?: number;
  trailing?: Buffer;
}

function build(items: Item[], o: BuildOpts = {}): Buffer {
  const parts: Buffer[] = [];
  const cds: Buffer[] = [];
  const offs: number[] = [];
  let off = 0;
  for (const it of items) {
    const nb = it.nameBuf ?? Buffer.from(it.name, 'utf8');
    const lnb = it.localName ? Buffer.from(it.localName, 'utf8') : nb;
    const data = Buffer.from(it.data ?? '');
    const flags = it.flags ?? (it.utf8 ? 0x800 : 0);
    const method = it.method ?? 0;
    const xl = it.extraL ?? Buffer.alloc(0);
    const xc = it.extraC ?? Buffer.alloc(0);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc(data), 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(lnb.length, 26);
    lh.writeUInt16LE(xl.length, 28);
    offs.push(off);
    const lho = it.lhoFrom !== undefined ? offs[it.lhoFrom]! : off;
    parts.push(lh, lnb, xl, data);
    const isDir = it.name.endsWith('/');
    const ext = it.ext ?? (isDir ? ((0o40755 * 65536) >>> 0) + 0x10 : (0o100644 * 65536) >>> 0);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(it.madeBy ?? 0x031e, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc(data), 16);
    c.writeUInt32LE(it.csize ?? data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nb.length, 28);
    c.writeUInt16LE(xc.length, 30);
    c.writeUInt32LE(ext, 38);
    c.writeUInt32LE(lho, 42);
    cds.push(c, nb, xc);
    off += 30 + lnb.length + xl.length + data.length;
  }
  const cd = Buffer.concat(cds);
  const n = o.count ?? items.length;
  const tail: Buffer[] = [];
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(o.disk ?? 0, 4);
  if (o.zip64) {
    const z = Buffer.alloc(56);
    const zOff = off + cd.length;
    z.writeUInt32LE(0x06064b50, 0);
    z.writeBigUInt64LE(44n, 4);
    z.writeUInt16LE(45, 12);
    z.writeUInt16LE(45, 14);
    z.writeBigUInt64LE(BigInt(n), 24);
    z.writeBigUInt64LE(BigInt(n), 32);
    z.writeBigUInt64LE(BigInt(cd.length), 40);
    z.writeBigUInt64LE(BigInt(off), 48);
    const l = Buffer.alloc(20);
    l.writeUInt32LE(o.badLocator ? 0x12345678 : 0x07064b50, 0);
    l.writeBigUInt64LE(BigInt(zOff), 8);
    l.writeUInt32LE(1, 16);
    tail.push(z, l);
    e.writeUInt16LE(0xffff, 8);
    e.writeUInt16LE(0xffff, 10);
    e.writeUInt32LE(0xffffffff, 12);
    e.writeUInt32LE(0xffffffff, 16);
  } else {
    e.writeUInt16LE(n, 8);
    e.writeUInt16LE(n, 10);
    e.writeUInt32LE(cd.length, 12);
    e.writeUInt32LE(off, 16);
  }
  return Buffer.concat([...parts, cd, ...tail, e, o.trailing ?? Buffer.alloc(0)]);
}

function zcheck(buf: Buffer): string {
  const read = (pos: number, len: number) => {
    if (pos + len > buf.length) throw new Error('short_read');
    return buf.subarray(pos, pos + len);
  };
  return checkZip(read, buf.length, defaultOptions(ROOT));
}

const D = (name: string, o: Partial<Item> = {}): Item => ({ name, ...o });
const F = (name: string, data = 'x', o: Partial<Item> = {}): Item => ({ name, data, ...o });
const VALID: Item[] = [
  D('pgsql/'),
  D('pgsql/bin/'),
  F('pgsql/bin/initdb.exe', 'init'),
  F('pgsql/bin/psql.exe', 'psql'),
  D('pgsql/lib/'),
  F('pgsql/lib/plpgsql.dll', 'pl'),
  D('pgsql/share/'),
  F('pgsql/share/postgres.bki', 'bki'),
  F('pgsql/doc/readme.txt', 'doc'),
  F('pgsql/pgAdmin 4/x.txt', 'pga'),
];
const unicodePath = (() => {
  const b = Buffer.alloc(9);
  b.writeUInt16LE(0x7075, 0);
  b.writeUInt16LE(5, 2);
  return b;
})();

describe('zip-check — an archive is refused before extraction (synthetic archives)', () => {
  it('a well-formed archive passes; only bin/, lib/ and share/ are listed, with size and CRC', () => {
    const out = zcheck(build(VALID));
    expect(out.split('\n')[0]).toBe('ZIP_OK 10 8');
    expect(out).toContain(`F 4 ${hex8('psql')} pgsql/bin/psql.exe\n`);
    expect(out).not.toMatch(/pgAdmin|doc[/]/);
  });

  it('a ZIP64 end record is read', () => {
    expect(zcheck(build(VALID, { zip64: true })).split('\n')[0]).toBe('ZIP_OK 10 8');
  });

  it.each<[string, Item[], string]>([
    ['backslash', [...VALID, F(`pgsql${BS}bin${BS}x.exe`)], 'backslash'],
    ['absolute path', [...VALID, F('/pgsql/x')], 'absolute'],
    ['drive letter', [...VALID, F('C:/pgsql/x')], 'drive_letter'],
    ['colon (NTFS stream)', [...VALID, F('pgsql/bin/a.exe:evil')], 'colon'],
    ['.. segment', [...VALID, F('pgsql/../evil.exe')], 'dot_segment'],
    ['. segment', [...VALID, F('pgsql/./x')], 'dot_segment'],
    ['empty segment', [...VALID, F('pgsql//x')], 'empty_segment'],
    ['outside pgsql/', [...VALID, F('other/x')], 'outside_root'],
    ['duplicate', [...VALID, F('pgsql/bin/psql.exe')], 'duplicate'],
    ['case collision (file)', [...VALID, F('pgsql/bin/PSQL.exe')], 'case_collision'],
    ['case collision (directory)', [...VALID, D('pgsql/BIN/')], 'case_collision'],
    [
      'NFC/NFD collision',
      [
        ...VALID,
        F('pgsql/caf\xe9', 'a', { utf8: true }),
        F('pgsql/cafe\u0301', 'b', { utf8: true }),
      ],
      'case_collision',
    ],
    ['file and directory of one name', [F('pgsql/x'), F('pgsql/X/y')], 'file_directory_conflict'],
    [
      'symlink (Unix mode)',
      [...VALID, F('pgsql/bin/lnk', 't', { ext: (0o120777 * 65536) >>> 0 })],
      'special_entry',
    ],
    [
      'reparse attribute (DOS)',
      [...VALID, F('pgsql/bin/r.exe', 'x', { madeBy: 0x0014, ext: 0x400 })],
      'reparse_attribute',
    ],
    [
      'directory mode on a file',
      [...VALID, F('pgsql/bin/d', '', { ext: (0o40755 * 65536) >>> 0 })],
      'type_mismatch',
    ],
    ['directory with data', [...VALID, D('pgsql/z/', { data: 'abc' })], 'directory_with_data'],
    ['encrypted', [...VALID, F('pgsql/bin/e.exe', 'x', { flags: 1 })], 'encrypted'],
    ['unsupported method', [...VALID, F('pgsql/bin/m.exe', 'x', { method: 12 })], 'method_12'],
    [
      'Unicode Path field (central)',
      [...VALID, F('pgsql/bin/u.exe', 'x', { extraC: unicodePath })],
      'unicode_path_extra',
    ],
    [
      'Unicode Path field (local only)',
      [...VALID, F('pgsql/bin/u.exe', 'x', { extraL: unicodePath })],
      'unicode_path_extra',
    ],
    [
      'local name differs',
      [...VALID, F('pgsql/bin/a.exe', 'x', { localName: 'pgsql/../../evil.exe' })],
      'local_name_mismatch',
    ],
    [
      'non-ASCII without the UTF-8 flag',
      [
        ...VALID,
        F('x', 'x', { nameBuf: Buffer.concat([Buffer.from('pgsql/bin/'), Buffer.from([0xe9])]) }),
      ],
      'name_non_ascii',
    ],
    [
      'invalid UTF-8',
      [
        ...VALID,
        F('x', 'x', {
          flags: 0x800,
          nameBuf: Buffer.concat([Buffer.from('pgsql/bin/'), Buffer.from([0xff])]),
        }),
      ],
      'name_not_utf8',
    ],
    ['reserved name CON.txt', [...VALID, F('pgsql/bin/CON.txt')], 'reserved_name'],
    ['reserved name nul', [...VALID, F('pgsql/bin/nul')], 'reserved_name'],
    ['reserved name com1.dat', [...VALID, F('pgsql/share/com1.dat')], 'reserved_name'],
    ['trailing dot', [...VALID, F('pgsql/bin/a.')], 'trailing_dot_or_space'],
    ['trailing space', [...VALID, F('pgsql/bin/a ')], 'trailing_dot_or_space'],
    ['control character', [...VALID, F('pgsql/bin/a' + String.fromCharCode(1))], 'control_char'],
    ['reserved character', [...VALID, F('pgsql/bin/a?b')], 'reserved_char'],
    [
      'two entries at one offset',
      [...VALID, F('pgsql/bin/b.exe', 'x', { lhoFrom: 2 })],
      'overlapping_entries',
    ],
    [
      'inflated compressed size',
      [F('pgsql/a', 'aaaa', { csize: 999 }), ...VALID],
      'overlapping_entries',
    ],
    ['extracted path too long', [...VALID, F('pgsql/bin/' + 'a'.repeat(250))], 'path_too_long'],
    [
      'a required directory missing',
      VALID.filter((i) => !i.name.startsWith('pgsql/lib/')),
      'missing_prefix:pgsql/lib/',
    ],
    ['empty archive', [], 'empty_archive'],
  ])('%s → refused', (_label, items, reason) => {
    expect(zcheck(build(items))).toMatch(
      new RegExp('^ZIP_REFUSED:' + reason.replace(/[.*+?^${}()|[\]]/g, '\\$&')),
    );
  });

  it.each<[string, Buffer, string]>([
    ['data after the end record', build(VALID, { trailing: Buffer.from('junk') }), 'trailing_data'],
    ['truncated', build(VALID).subarray(0, build(VALID).length - 10), 'eocd_missing'],
    ['multi-volume', build(VALID, { disk: 1 }), 'multi_disk'],
    ['wrong entry count', build(VALID, { count: 11 }), 'cd_entry'],
    [
      'corrupt ZIP64 locator',
      build(VALID, { zip64: true, badLocator: true }),
      'zip64_locator_missing',
    ],
    ['too short', Buffer.from('PK'), 'too_small'],
  ])('%s → refused', (_label, buf, reason) => {
    expect(zcheck(buf)).toBe('ZIP_REFUSED:' + reason);
  });
});

// ── A simulated file system ──────────────────────────────────────────────

type Node = { t: 'F'; data: string } | { t: 'D' } | { t: 'L' } | { t: 'S' };
function vfs(spec: Record<string, Node | undefined>) {
  const tree: Record<string, Node> = {};
  for (const [p, n] of Object.entries(spec)) {
    if (!n) continue;
    tree[p] = n;
    const segs = p.split('/');
    for (let i = 2; i < segs.length; i++) {
      const d = segs.slice(0, i).join('/');
      if (!tree[d]) tree[d] = { t: 'D' };
    }
  }
  const err = (p: string, code: string) => Object.assign(new Error(code + ' ' + p), { code });
  const get = (p: string) => tree[p.split(BS).join('/')];
  return {
    lstatSync(p: string) {
      const n = get(p);
      if (!n) throw err(p, 'ENOENT');
      return {
        isSymbolicLink: () => n.t === 'L',
        isDirectory: () => n.t === 'D',
        isFile: () => n.t === 'F',
        size: n.t === 'F' ? Buffer.byteLength(n.data) : 0,
      };
    },
    readdirSync(p: string) {
      const n = get(p);
      if (!n) throw err(p, 'ENOENT');
      if (n.t !== 'D') throw err(p, 'ENOTDIR');
      const pre = p + '/';
      return Object.keys(tree)
        .filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes('/'))
        .map((k) => k.slice(pre.length));
    },
    readFileSync(p: string, enc?: string) {
      const n = get(p);
      if (!n) throw err(p, 'ENOENT');
      if (n.t !== 'F') throw err(p, 'EISDIR');
      const b = Buffer.from(n.data);
      return enc ? b.toString(enc as BufferEncoding) : b;
    },
  };
}
const f = (data: string): Node => ({ t: 'F', data });
const d: Node = { t: 'D' };
const LIST =
  [
    'D 0 00000000 pgsql/',
    'D 0 00000000 pgsql/bin/',
    `F 4 ${hex8('init')} pgsql/bin/initdb.exe`,
    `F 4 ${hex8('psql')} pgsql/bin/psql.exe`,
    'D 0 00000000 pgsql/lib/',
    `F 2 ${hex8('pl')} pgsql/lib/plpgsql.dll`,
    'D 0 00000000 pgsql/share/',
    `F 3 ${hex8('bki')} pgsql/share/postgres.bki`,
  ].join('\n') + '\n';
const PG = {
  [`${ROOT}/pgsql`]: d,
  [`${ROOT}/pgsql/bin/initdb.exe`]: f('init'),
  [`${ROOT}/pgsql/bin/psql.exe`]: f('psql'),
  [`${ROOT}/pgsql/lib/plpgsql.dll`]: f('pl'),
  [`${ROOT}/pgsql/share/postgres.bki`]: f('bki'),
};

describe('extract-check — what extraction wrote matches the validated list (simulated disk)', () => {
  const xc = (extra: Record<string, Node | undefined> = {}) =>
    checkExtraction(vfs({ [`${ROOT}/dl/pg.list`]: f(LIST), ...PG, ...extra }), ROOT);

  it('a conforming extraction passes', () => {
    expect(xc()).toBe('EXTRACT_OK 8');
  });
  it.each<[string, Record<string, Node | undefined>, string]>([
    ['an extra file', { [`${ROOT}/pgsql/bin/evil.dll`]: f('e') }, 'unexpected:pgsql/bin/evil.dll'],
    ['a missing file', { [`${ROOT}/pgsql/bin/psql.exe`]: undefined }, 'missing:pgsql/bin/psql.exe'],
    ['another size', { [`${ROOT}/pgsql/bin/psql.exe`]: f('psqlX') }, 'size:pgsql/bin/psql.exe'],
    [
      'other content (CRC)',
      { [`${ROOT}/pgsql/bin/psql.exe`]: f('PSQL') },
      'crc:pgsql/bin/psql.exe',
    ],
    ['a link', { [`${ROOT}/pgsql/lib/j`]: { t: 'L' } }, 'link:pgsql/lib/j'],
    [
      'a directory instead of a file',
      { [`${ROOT}/pgsql/bin/psql.exe`]: d },
      'type:pgsql/bin/psql.exe',
    ],
    ['a special entry', { [`${ROOT}/pgsql/bin/s`]: { t: 'S' } }, 'unexpected:pgsql/bin/s'],
  ])('%s → refused', (_label, extra, reason) => {
    expect(xc(extra)).toBe('EXTRACT_REFUSED:' + reason);
  });
  it('pgsql/ itself a link → refused', () => {
    expect(
      checkExtraction(
        vfs({ [`${ROOT}/dl/pg.list`]: f(LIST), [`${ROOT}/pgsql`]: { t: 'L' } }),
        ROOT,
      ),
    ).toBe('EXTRACT_REFUSED:pgsql_not_plain_directory');
  });
  it('a malformed list or a root other than the sandbox → refused', () => {
    expect(checkExtraction(vfs({ [`${ROOT}/dl/pg.list`]: f('X bad\n'), ...PG }), ROOT)).toBe(
      'EXTRACT_REFUSED:pg_list_malformed',
    );
    expect(checkExtraction(vfs({}), 'C:/Users')).toBe('EXTRACT_REFUSED:root_invalid');
  });
});

describe('inventory — nothing is deleted unless every entry is on the allow-list (simulated disk)', () => {
  const MARK = f(`nonce=${'a'.repeat(32)}\npath=${ROOT}\n`);
  const REPO = {
    [`${REPO_PRISMA}/schema.prisma`]: f('s'),
    [`${REPO_PRISMA}/migrations/0_init/migration.sql`]: f('m'),
  };
  const NOMINAL: Record<string, Node | undefined> = {
    [`${ROOT}/.rb-pgtest-marker`]: MARK,
    [`${ROOT}/choice.txt`]: f('c'),
    [`${ROOT}/pw_admin.txt`]: f('p'),
    [`${ROOT}/pw.txt`]: f('p'),
    [`${ROOT}/pgpass.conf`]: f('p'),
    [`${ROOT}/pg.log`]: f('log'),
    [`${ROOT}/dl/final-url.txt`]: f('u'),
    [`${ROOT}/dl/pg.zip`]: f('z'),
    [`${ROOT}/dl/pg.zip.sha256`]: f('h'),
    [`${ROOT}/dl/pg.list`]: f(LIST),
    ...PG,
    [`${ROOT}/work/prisma/schema.prisma`]: f('s'),
    [`${ROOT}/work/prisma/migrations/0_init/migration.sql`]: f('m'),
    [`${ROOT}/data/PG_VERSION`]: f('17'),
    [`${ROOT}/data/base/1/1259`]: f('x'),
    [`${ROOT}/data/pg_tblspc`]: d,
    [`${ROOT}/data/postmaster.opts`]: f('o'),
    [`${ROOT}/data/postmaster.pid`]: f('1'),
  };
  const inv = (spec: Record<string, Node | undefined>) =>
    inventory(vfs({ ...REPO, ...spec }), ROOT, REPO_PRISMA);
  const without = (...ks: string[]) => {
    const c = { ...NOMINAL };
    for (const k of ks) delete c[k];
    return c;
  };
  const token = (out: string) => out.split('\n')[0];

  it('absent, empty (P2 failed right after mkdir), marker only, marker + empty dl/ and work/', () => {
    expect(inv({})).toBe('INV_OK ABSENT');
    expect(inv({ [ROOT]: d })).toBe('INV_OK VIDE');
    expect(inv({ [`${ROOT}/.rb-pgtest-marker`]: MARK })).toMatch(/^INV_OK [0-9a-f]{64}/);
    expect(
      inv({ [`${ROOT}/.rb-pgtest-marker`]: MARK, [`${ROOT}/dl`]: d, [`${ROOT}/work`]: d }),
    ).toMatch(/^INV_OK [0-9a-f]{64}/);
  });
  it('a full sandbox, a partial extraction, an interrupted deletion: accepted', () => {
    expect(inv(NOMINAL)).toMatch(/^INV_OK [0-9a-f]{64}/);
    expect(inv(without(`${ROOT}/pgsql/share/postgres.bki`))).toMatch(/^INV_OK [0-9a-f]{64}/);
    expect(
      inv(
        without(
          `${ROOT}/data/PG_VERSION`,
          `${ROOT}/data/base/1/1259`,
          `${ROOT}/data/pg_tblspc`,
          `${ROOT}/data/postmaster.opts`,
          `${ROOT}/data/postmaster.pid`,
        ),
      ),
    ).toMatch(/^INV_OK [0-9a-f]{64}/);
  });
  it('the token is stable, and changes with any byte of any file (content SHA-256)', () => {
    expect(token(inv(NOMINAL))).toBe(token(inv(NOMINAL)));
    expect(token(inv({ ...NOMINAL, [`${ROOT}/pg.log`]: f('loh') }))).not.toBe(token(inv(NOMINAL)));
  });
  it.each<[string, Record<string, Node | undefined>, string]>([
    [
      'an unexpected top-level file',
      { ...NOMINAL, [`${ROOT}/notes.txt`]: f('n') },
      'unexpected:notes.txt',
    ],
    [
      'an unexpected file in dl/',
      { ...NOMINAL, [`${ROOT}/dl/other.zip`]: f('o') },
      'unexpected:dl/other.zip',
    ],
    [
      'a file in pgsql/ not on the list',
      { ...NOMINAL, [`${ROOT}/pgsql/bin/evil.dll`]: f('e') },
      'unexpected:pgsql/bin/evil.dll',
    ],
    ['pgsql/ without pg.list', without(`${ROOT}/dl/pg.list`), 'pgsql_without_list'],
    [
      'a work/ file absent from the repository',
      { ...NOMINAL, [`${ROOT}/work/prisma/extra.sql`]: f('e') },
      'not_in_repo:work/prisma/extra.sql',
    ],
    [
      'something other than prisma in work/',
      { ...NOMINAL, [`${ROOT}/work/x`]: f('e') },
      'unexpected:work/x',
    ],
    [
      'an unknown entry in data/',
      { ...NOMINAL, [`${ROOT}/data/evil`]: f('e') },
      'unexpected:data/evil',
    ],
    [
      'a tablespace in pg_tblspc',
      { ...NOMINAL, [`${ROOT}/data/pg_tblspc/16384`]: d },
      'tablespace:data/pg_tblspc/16384',
    ],
    [
      'a deep link',
      { ...NOMINAL, [`${ROOT}/data/base/1/lnk`]: { t: 'L' } },
      'link:data/base/1/lnk',
    ],
    ['a special entry', { ...NOMINAL, [`${ROOT}/data/sock`]: { t: 'S' } }, 'special:data/sock'],
    ['the root a link', { [ROOT]: { t: 'L' } }, 'root_not_plain_directory'],
    ['no marker, content present', without(`${ROOT}/.rb-pgtest-marker`), 'marker_missing'],
    ['the marker a directory', { [`${ROOT}/.rb-pgtest-marker`]: d }, 'marker_missing'],
    [
      'a malformed marker',
      { ...NOMINAL, [`${ROOT}/.rb-pgtest-marker`]: f(`nonce=zz\npath=${ROOT}\n`) },
      'marker_content',
    ],
    [
      'a marker naming another path',
      {
        ...NOMINAL,
        [`${ROOT}/.rb-pgtest-marker`]: f(`nonce=${'a'.repeat(32)}\npath=D:/rb-pgtest\n`),
      },
      'marker_path',
    ],
    ['dl a file', { [`${ROOT}/.rb-pgtest-marker`]: MARK, [`${ROOT}/dl`]: f('x') }, 'type:dl'],
  ])('%s → refused', (_label, spec, reason) => {
    expect(inv(spec)).toBe('INV_REFUSED:' + reason);
  });
  it('a root other than the sandbox is never inventoried', () => {
    expect(inventory(vfs({}), 'C:/Users', REPO_PRISMA)).toBe('INV_REFUSED:root_invalid');
    expect(inventory(vfs({}), 'C:/rb-pgtest/..', REPO_PRISMA)).toBe('INV_REFUSED:root_invalid');
  });
});

describe('guard — only the sandbox database, no production value', () => {
  const PW = 'A1b2C3d4E5f6G7h8I9j0K_-z';
  const ok = {
    DATABASE_URL: sandboxUrl(PW),
    DIRECT_URL: sandboxUrl(PW),
    PGPASSFILE: `${ROOT}/pgpass.conf`,
  };
  const G = `postgresql://rb_test:${PW}@127.0.0.1`;
  const U = '/rb_materials_test?schema=public';
  const neon = 'postgresql://rb_test:x@ep-abc.eu-central-1.aws.neon.tech:55432' + U;

  it('the sandbox URL passes', () => {
    expect(checkSandboxEnv(ok, ROOT, PW)).toBe('SHELL_OK');
  });
  it.each<[string, Record<string, string>, string]>([
    [
      'port 55433 (decided before any connection)',
      { ...ok, DATABASE_URL: `${G}:55433${U}`, DIRECT_URL: `${G}:55433${U}` },
      'port',
    ],
    ['a Neon host', { ...ok, DATABASE_URL: neon, DIRECT_URL: neon }, 'host'],
    [
      'another IP',
      {
        ...ok,
        DATABASE_URL: `postgresql://rb_test:x@10.0.0.5:55432${U}`,
        DIRECT_URL: `postgresql://rb_test:x@10.0.0.5:55432${U}`,
      },
      'host',
    ],
    [
      'a user-info trick',
      {
        ...ok,
        DATABASE_URL: `postgresql://rb_test:x@127.0.0.1:55432@evil.example:55432${U}`,
        DIRECT_URL: `postgresql://rb_test:x@127.0.0.1:55432@evil.example:55432${U}`,
      },
      'host',
    ],
    ['DIRECT_URL elsewhere', { ...ok, DIRECT_URL: neon }, 'url_differ'],
    [
      'an extra host parameter',
      {
        ...ok,
        DATABASE_URL: `${G}:55432${U}&host=remote.example`,
        DIRECT_URL: `${G}:55432${U}&host=remote.example`,
      },
      'params',
    ],
    [
      'another database',
      {
        ...ok,
        DATABASE_URL: `${G}:55432/neondb?schema=public`,
        DIRECT_URL: `${G}:55432/neondb?schema=public`,
      },
      'database',
    ],
    [
      'another role',
      {
        ...ok,
        DATABASE_URL: `postgresql://postgres:${PW}@127.0.0.1:55432${U}`,
        DIRECT_URL: `postgresql://postgres:${PW}@127.0.0.1:55432${U}`,
      },
      'user',
    ],
    [
      'another protocol',
      {
        ...ok,
        DATABASE_URL: `mysql://rb_test:x@127.0.0.1:55432${U}`,
        DIRECT_URL: `mysql://rb_test:x@127.0.0.1:55432${U}`,
      },
      'protocol',
    ],
    ['PGHOSTADDR set', { ...ok, PGHOSTADDR: '10.0.0.5' }, 'env_PGHOSTADDR'],
    ['PGSERVICE set', { ...ok, PGSERVICE: 'prod' }, 'env_PGSERVICE'],
    ['another PGPASSFILE', { ...ok, PGPASSFILE: 'C:/Users/x/pgpass.conf' }, 'pgpassfile'],
    ['no URL', { ...ok, DATABASE_URL: '', DIRECT_URL: '' }, 'url_missing'],
  ])('%s → refused', (_label, env, reason) => {
    expect(checkSandboxEnv(env, ROOT, PW)).toBe('REFUSED:' + reason);
  });
  it('a wrong or unreadable password, or a root other than the sandbox → refused', () => {
    expect(checkSandboxEnv(ok, ROOT, 'B'.repeat(24))).toBe('REFUSED:password');
    expect(checkSandboxEnv(ok, ROOT, null)).toBe('REFUSED:pw_unreadable');
    expect(checkSandboxEnv(ok, 'C:/Users', PW)).toBe('REFUSED:root_invalid');
  });
  it('production values from .env are detected by name, without reading them', () => {
    const names = envKeyNames(
      'DATABASE_URL=x\nJWT_SECRET=y\n# c=1\nUPSTASH_REDIS_REST_URL=z\nAUTH_DISABLED=true\n',
    );
    expect(names).toEqual([
      'DATABASE_URL',
      'JWT_SECRET',
      'UPSTASH_REDIS_REST_URL',
      'AUTH_DISABLED',
    ]);
    const allowed = { DATABASE_URL: sandboxUrl(PW), JWT_SECRET: 'fixture', AUTH_DISABLED: 'true' };
    expect(
      leakedEnvNames(
        {
          DATABASE_URL: sandboxUrl(PW),
          JWT_SECRET: 'fixture',
          UPSTASH_REDIS_REST_URL: '',
          AUTH_DISABLED: 'true',
        },
        names,
        allowed,
      ),
    ).toEqual([]);
    expect(
      leakedEnvNames(
        {
          DATABASE_URL: neon,
          JWT_SECRET: 'fixture',
          UPSTASH_REDIS_REST_URL: 'https://prod',
          AUTH_DISABLED: 'true',
        },
        names,
        allowed,
      ),
    ).toEqual(['DATABASE_URL', 'UPSTASH_REDIS_REST_URL']);
  });
});

describe('policy — Authenticode (made-up reports)', () => {
  const EDB =
    'CN=EnterpriseDB Corporation, O=EnterpriseDB Corporation, L=Bedford, S=Massachusetts, C=US';
  const exes = ['bin/postgres.exe', 'bin/initdb.exe', 'bin/pg_ctl.exe', 'bin/psql.exe'].map(
    (p) => `${p}|Valid|${EDB}`,
  );
  const report = (...extra: string[]) => [...exes, ...extra].join('\r\n');

  it('signed executables, a signed and an unsigned DLL: accepted in standard mode, blocked in strict mode', () => {
    const r = report(
      'bin/libssl-3-x64.dll|Valid|CN=Some Vendor, O=Some Vendor',
      'lib/plpgsql.dll|NotSigned|',
    );
    expect(evaluateSignatures(r, 'standard')).toMatch(
      /^SIG_OK exe=4 dll_signed=1 dll_unsigned=1\n.*lib\/plpgsql\.dll/,
    );
    expect(evaluateSignatures(r, 'strict')).toBe('SIG_BLOCKED:dll_not_signed:lib/plpgsql.dll');
  });
  it.each<[string, string, string]>([
    [
      'an unsigned executable',
      report('bin/pg_dump.exe|NotSigned|'),
      'exe_not_signed:bin/pg_dump.exe',
    ],
    [
      'an executable signed by someone else',
      report('bin/pg_dump.exe|Valid|CN=Other, O=Other'),
      'exe_signer:bin/pg_dump.exe',
    ],
    ['a hash mismatch', report('lib/x.dll|HashMismatch|'), 'status_HashMismatch:lib/x.dll'],
    ['an untrusted chain', report('lib/x.dll|NotTrusted|CN=x'), 'status_NotTrusted:lib/x.dll'],
    [
      'a required executable missing',
      exes.slice(1).join('\n'),
      'required_missing:bin/postgres.exe',
    ],
    ['a path outside bin/ and lib/', report('share/x.dll|Valid|' + EDB), 'path:share/x.dll'],
    ['a malformed line', report('bin/x.exe|Valid'), 'report_malformed:bin/x.exe|Valid'],
    ['an empty report', '', 'no_executable:-'],
  ])('%s → blocked', (_label, r, reason) => {
    expect(evaluateSignatures(r, 'standard')).toBe('SIG_BLOCKED:' + reason);
  });
  it('a subject merely containing "EnterpriseDB" outside O= is not EDB', () => {
    expect(
      evaluateSignatures(report('bin/x.exe|Valid|CN=Not EnterpriseDB, O=Mallory'), 'standard'),
    ).toBe('SIG_BLOCKED:exe_signer:bin/x.exe');
  });

  describe('pinned archive (EDB 18.6-5 ships unsigned executables)', () => {
    const sha = 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2';
    const url =
      'https://get.enterprisedb.com/postgresql/postgresql-18.6-5-windows-x64-binaries.zip';
    const unsignedExes = ['bin/postgres.exe', 'bin/initdb.exe', 'bin/pg_ctl.exe', 'bin/psql.exe']
      .map((p) => `${p}|NotSigned|`)
      .join('\n');

    it('pins exactly the 18.6-5 archive', () => {
      expect(PINNED_ARCHIVES).toEqual({ [sha]: 'postgresql-18.6-5-windows-x64-binaries.zip' });
    });
    it('standard + pinned hash + matching file name → pinned', () => {
      expect(archiveMode('standard', sha, url)).toBe('pinned');
      expect(archiveMode('standard', sha, url + '?x=1')).toBe('pinned');
    });
    it.each<[string, string, string | undefined, string | undefined, string]>([
      ['strict is never relaxed', 'strict', sha, url, 'strict'],
      ['another hash', 'standard', 'f'.repeat(64), url, 'standard'],
      ['no hash', 'standard', undefined, undefined, 'standard'],
      ['an uppercase hash', 'standard', sha.toUpperCase(), url, 'standard'],
      [
        'the pinned hash under another file name',
        'standard',
        sha,
        url.replace('18.6-5', '18.7-1'),
        'standard',
      ],
      ['an inherited property name as hash', 'standard', 'constructor', url, 'standard'],
      ['"pinned" asked for directly', 'pinned', sha, url, 'invalid'],
      ['an unknown mode', 'lenient', sha, url, 'invalid'],
    ])('%s', (_label, mode, h, u, expected) => {
      expect(archiveMode(mode, h, u)).toBe(expected);
    });
    it('pinned: unsigned executables and DLLs accepted', () => {
      const r =
        unsignedExes + '\nbin/stackbuilder.exe|Valid|' + EDB + '\nlib/plpgsql.dll|NotSigned|';
      expect(evaluateSignatures(r, 'pinned')).toMatch(
        /^SIG_OK exe=5 exe_unsigned=4 dll_signed=0 dll_unsigned=1\n {2}archive épinglée/,
      );
      expect(evaluateSignatures(r, 'standard')).toBe('SIG_BLOCKED:exe_not_signed:bin/postgres.exe');
    });
    it.each<[string, string, string]>([
      ['a hash mismatch', 'lib/x.dll|HashMismatch|', 'status_HashMismatch:lib/x.dll'],
      ['an untrusted chain', 'bin/x.exe|NotTrusted|CN=x', 'status_NotTrusted:bin/x.exe'],
      [
        'an executable signed by someone else',
        'bin/x.exe|Valid|CN=Other, O=Other',
        'exe_signer:bin/x.exe',
      ],
    ])('pinned still blocks %s', (_label, line, reason) => {
      expect(evaluateSignatures(unsignedExes + '\n' + line, 'pinned')).toBe(
        'SIG_BLOCKED:' + reason,
      );
    });
    it('pinned still requires the four server executables', () => {
      expect(evaluateSignatures('bin/postgres.exe|NotSigned|', 'pinned')).toBe(
        'SIG_BLOCKED:required_missing:bin/initdb.exe',
      );
    });
  });
});

describe('neon-version — picking the project by its endpoint host (made-up API answers)', () => {
  const host = 'ep-cool-thing-123456.eu-central-1.aws.neon.tech';
  const env = `X=1\nDIRECT_URL="postgresql://u:p@${host}/neondb?sslmode=require"\n`;

  it('reads only DIRECT_URL’s host, and refuses a non-Neon one', () => {
    expect(directHost(env)).toEqual({ ok: true, host });
    expect(directHost('DIRECT_URL=postgresql://u:p@127.0.0.1:5432/db')).toEqual({
      ok: false,
      reason: 'host_not_neon',
    });
    expect(directHost('X=1')).toEqual({ ok: false, reason: 'direct_url_absent' });
  });
  it('one matching project gives its version; none, two or an odd version give nothing', async () => {
    const eps: Record<string, { host: string }[]> = {
      a: [{ host: 'ep-other.x.neon.tech' }],
      b: [{ host }],
    };
    const of = async (id: string) => eps[id] ?? [];
    expect(
      await pickProject(
        [
          { id: 'a', name: 'A', pg_version: 16 },
          { id: 'b', name: 'B', pg_version: 17 },
        ],
        of,
        host,
      ),
    ).toEqual({
      ok: true,
      version: 17,
      name: 'B',
      projects: 2,
    });
    expect(await pickProject([{ id: 'a', name: 'A', pg_version: 16 }], of, host)).toEqual({
      ok: false,
      reason: 'matches_0',
    });
    expect(
      await pickProject(
        [
          { id: 'b', name: 'B', pg_version: 17 },
          { id: 'b', name: 'B2', pg_version: 18 },
        ],
        of,
        host,
      ),
    ).toEqual({ ok: false, reason: 'matches_2' });
    expect(await pickProject([{ id: 'b', name: 'B', pg_version: 13 }], of, host)).toEqual({
      ok: false,
      reason: 'unexpected_version_13',
    });
    expect(await pickProject([], of, host)).toEqual({ ok: false, reason: 'no_project_visible' });
  });
});
