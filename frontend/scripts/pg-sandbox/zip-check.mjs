// Validates the PostgreSQL ZIP archive BEFORE anything is extracted from it
// (local PostgreSQL sandbox, step P5a). Reads the central directory and every
// local header itself — no extraction tool is trusted to refuse bad entries.
//
// Refused: names with a backslash, an absolute path, a drive letter, a colon
// (NTFS stream), a "..", "." or empty segment, a control or reserved
// character, a Windows reserved name, a trailing dot or space, or outside
// pgsql/; duplicates, case or Unicode-normalisation collisions, a file and a
// directory of the same name; symlinks and other special entries, reparse
// attributes, encrypted entries, methods other than stored/deflate, the
// Info-ZIP "Unicode Path" field (it would replace the name for some
// extractors), a local name differing from the central one, overlapping
// entries, data after the end record, multi-volume archives.
//
// CLI: node zip-check.mjs <archive.zip> <sandbox root>
// Prints "ZIP_OK <entries> <kept>" then one line per entry to extract
// ("F <size> <crc32> <name>" or "D 0 00000000 <name>"), or "ZIP_REFUSED:<reason>".
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const BACKSLASH = String.fromCharCode(92);
export const SANDBOX_ROOT_RE = /^[A-Za-z]:\/rb-pgtest$/;

export function defaultOptions(base) {
  return {
    root: 'pgsql',
    base,
    extract: ['pgsql/bin/', 'pgsql/lib/', 'pgsql/share/'],
    maxEntries: 200000,
    maxBytes: 4294967296,
  };
}

class ZipRefused extends Error {
  constructor(reason) {
    super(reason);
    this.zipReason = reason;
  }
}
const no = (reason) => {
  throw new ZipRefused(reason);
};

function readExtras(buf, onField) {
  let q = 0;
  while (q < buf.length) {
    if (q + 4 > buf.length) no('extra_malformed');
    const id = buf.readUInt16LE(q);
    const len = buf.readUInt16LE(q + 2);
    if (q + 4 + len > buf.length) no('extra_malformed');
    if (id === 0x7075) no('unicode_path_extra');
    onField(id, buf.subarray(q + 4, q + 4 + len));
    q += 4 + len;
  }
}

function checkName(name, isDir, opts) {
  if (name.length === 0) no('name_empty');
  // eslint-disable-next-line no-control-regex -- matching control characters is the point: a ZIP entry name must not contain any
  if (/[\x00-\x1f\x7f]/.test(name)) no('control_char:' + JSON.stringify(name));
  if (name.includes(BACKSLASH)) no('backslash:' + name);
  if (name.startsWith('/')) no('absolute:' + name);
  if (/^[A-Za-z]:/.test(name)) no('drive_letter:' + name);
  if (name.includes(':')) no('colon:' + name);
  if (/[<>"|?*]/.test(name)) no('reserved_char:' + name);
  const segs = (isDir ? name.slice(0, -1) : name).split('/');
  for (const s of segs) {
    if (s === '') no('empty_segment:' + name);
    if (s === '.' || s === '..') no('dot_segment:' + name);
    if (/[ .]$/.test(s)) no('trailing_dot_or_space:' + name);
    if (
      /^(CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[0-9\xb9\xb2\xb3]|LPT[0-9\xb9\xb2\xb3])(\.|$)/i.test(s)
    ) {
      no('reserved_name:' + name);
    }
  }
  if (segs[0] !== opts.root) no('outside_root:' + name);
}

/**
 * Every entry of the archive, or a ZipRefused. `read(offset, length)` returns
 * exactly that many bytes (or throws), `size` is the archive's length.
 */
export function validateZip(read, size, opts) {
  if (size < 22) no('too_small');
  const tailLen = Math.min(size, 65557);
  const tailOff = size - tailLen;
  const tail = read(tailOff, tailLen);
  let eo = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eo = i;
      break;
    }
  }
  if (eo < 0) no('eocd_missing');
  const eocdOff = tailOff + eo;
  if (eocdOff + 22 + tail.readUInt16LE(eo + 20) !== size) no('trailing_data');
  let disk = tail.readUInt16LE(eo + 4);
  let cdDisk = tail.readUInt16LE(eo + 6);
  let nThis = tail.readUInt16LE(eo + 8);
  let nTotal = tail.readUInt16LE(eo + 10);
  let cdSize = tail.readUInt32LE(eo + 12);
  let cdOff = tail.readUInt32LE(eo + 16);
  let cdEnd = eocdOff;
  if (nThis === 0xffff || nTotal === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    if (eocdOff < 20) no('zip64_locator_missing');
    const loc = read(eocdOff - 20, 20);
    if (loc.readUInt32LE(0) !== 0x07064b50) no('zip64_locator_missing');
    if (loc.readUInt32LE(4) !== 0 || loc.readUInt32LE(16) !== 1) no('multi_disk');
    const zOff = Number(loc.readBigUInt64LE(8));
    const z = read(zOff, 56);
    if (z.readUInt32LE(0) !== 0x06064b50) no('zip64_eocd_missing');
    if (zOff + 12 + Number(z.readBigUInt64LE(4)) !== eocdOff - 20) no('zip64_eocd_bounds');
    disk = z.readUInt32LE(16);
    cdDisk = z.readUInt32LE(20);
    nThis = Number(z.readBigUInt64LE(24));
    nTotal = Number(z.readBigUInt64LE(32));
    cdSize = Number(z.readBigUInt64LE(40));
    cdOff = Number(z.readBigUInt64LE(48));
    cdEnd = zOff;
  }
  if (disk !== 0 || cdDisk !== 0 || nThis !== nTotal) no('multi_disk');
  if (nTotal === 0) no('empty_archive');
  if (nTotal > opts.maxEntries) no('too_many_entries');
  if (cdOff + cdSize !== cdEnd) no('cd_bounds');

  const cd = read(cdOff, cdSize);
  const entries = [];
  let p = 0;
  let total = 0;
  for (let k = 0; k < nTotal; k++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) no('cd_entry');
    const madeBy = cd.readUInt16LE(p + 4);
    const flags = cd.readUInt16LE(p + 8);
    const method = cd.readUInt16LE(p + 10);
    const crc = cd.readUInt32LE(p + 16);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28);
    const xl = cd.readUInt16LE(p + 30);
    const ml = cd.readUInt16LE(p + 32);
    const dStart = cd.readUInt16LE(p + 34);
    const ext = cd.readUInt32LE(p + 38);
    let lho = cd.readUInt32LE(p + 42);
    if (p + 46 + nl + xl + ml > cd.length) no('cd_entry');
    const nameBytes = cd.subarray(p + 46, p + 46 + nl);
    readExtras(cd.subarray(p + 46 + nl, p + 46 + nl + xl), (id, f) => {
      if (id !== 0x0001) return;
      let r = 0;
      const take = () => {
        if (r + 8 > f.length) no('zip64_extra');
        const v = Number(f.readBigUInt64LE(r));
        r += 8;
        return v;
      };
      if (usize === 0xffffffff) usize = take();
      if (csize === 0xffffffff) csize = take();
      if (lho === 0xffffffff) lho = take();
    });
    p += 46 + nl + xl + ml;
    if (dStart !== 0) no('multi_disk');
    if (flags & 0x0041) no('encrypted');
    if (method !== 0 && method !== 8) no('method_' + method);
    let name;
    if (flags & 0x0800) {
      try {
        name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
      } catch {
        no('name_not_utf8');
      }
    } else {
      if (nameBytes.some((b) => b > 0x7e)) no('name_non_ascii');
      name = nameBytes.toString('latin1');
    }
    const isDir = name.endsWith('/');
    checkName(name, isDir, opts);
    const unixType = madeBy >> 8 === 3 ? (ext >>> 16) & 0xf000 : 0;
    if (unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000) no('special_entry:' + name);
    if (unixType !== 0 && (unixType === 0x4000) !== isDir) no('type_mismatch:' + name);
    if (ext & 0x400) no('reparse_attribute:' + name);
    if ((ext & 0x10) !== 0 && !isDir) no('type_mismatch:' + name);
    if (isDir && (usize !== 0 || csize !== 0)) no('directory_with_data:' + name);
    total += usize;
    entries.push({ name, isDir, method, crc, csize, usize, lho, nameBytes });
  }
  if (p !== cd.length) no('cd_trailing');
  if (total > opts.maxBytes) no('too_large');

  const exact = new Set();
  const folded = new Set();
  const foldedFiles = new Set();
  for (const e of entries) {
    const key = e.isDir ? e.name.slice(0, -1) : e.name;
    const f = key.normalize('NFC').toUpperCase();
    if (exact.has(key)) no('duplicate:' + e.name);
    if (folded.has(f)) no('case_collision:' + e.name);
    exact.add(key);
    folded.add(f);
    if (!e.isDir) foldedFiles.add(f);
  }
  for (const e of entries) {
    const segs = (e.isDir ? e.name.slice(0, -1) : e.name).normalize('NFC').toUpperCase().split('/');
    for (let i = 1; i < segs.length; i++) {
      if (foldedFiles.has(segs.slice(0, i).join('/'))) no('file_directory_conflict:' + e.name);
    }
  }

  const byOffset = [...entries].sort((a, b) => a.lho - b.lho);
  for (let i = 0; i < byOffset.length; i++) {
    const e = byOffset[i];
    const h = read(e.lho, 30);
    if (h.readUInt32LE(0) !== 0x04034b50) no('local_header:' + e.name);
    const lnl = h.readUInt16LE(26);
    const lxl = h.readUInt16LE(28);
    if (!read(e.lho + 30, lnl).equals(e.nameBytes)) no('local_name_mismatch:' + e.name);
    if (h.readUInt16LE(8) !== e.method || h.readUInt16LE(6) & 0x0041) no('local_header:' + e.name);
    readExtras(read(e.lho + 30 + lnl, lxl), () => {});
    const end = e.lho + 30 + lnl + lxl + e.csize;
    const next = i + 1 < byOffset.length ? byOffset[i + 1].lho : cdOff;
    if (end > next) no('overlapping_entries:' + e.name);
  }
  return entries;
}

/** The entries to extract and the "pg.list" lines describing them. */
export function extractionList(entries, opts) {
  const keep = entries.filter(
    (e) => e.name === opts.root + '/' || opts.extract.some((x) => e.name.startsWith(x)),
  );
  for (const x of opts.extract) {
    if (!keep.some((e) => e.name.startsWith(x))) no('missing_prefix:' + x);
  }
  for (const e of keep) {
    if ((opts.base + '/' + e.name).length > 259) no('path_too_long:' + e.name);
  }
  return keep.map(
    (e) =>
      (e.isDir ? 'D' : 'F') +
      ' ' +
      e.usize +
      ' ' +
      (e.crc >>> 0).toString(16).padStart(8, '0') +
      ' ' +
      e.name,
  );
}

/** The whole check over a `read`/`size` pair: the CLI's output. */
export function checkZip(read, size, opts) {
  try {
    const entries = validateZip(read, size, opts);
    const lines = extractionList(entries, opts);
    return 'ZIP_OK ' + entries.length + ' ' + lines.length + '\n' + lines.join('\n') + '\n';
  } catch (e) {
    return 'ZIP_REFUSED:' + (e instanceof ZipRefused ? e.zipReason : 'exception:' + e.message);
  }
}

export function fileReader(fsLike, file) {
  const fd = fsLike.openSync(file, 'r');
  const size = fsLike.fstatSync(fd).size;
  const read = (off, len) => {
    const b = Buffer.alloc(len);
    let got = 0;
    while (got < len) {
      const n = fsLike.readSync(fd, b, got, len - got, off + got);
      if (n === 0) no('short_read');
      got += n;
    }
    return b;
  };
  return { read, size, close: () => fsLike.closeSync(fd) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, root] = process.argv.slice(2);
  if (!file || !root || !SANDBOX_ROOT_RE.test(root)) {
    process.stdout.write('ZIP_REFUSED:usage');
    process.exit(2);
  }
  let out;
  try {
    const r = fileReader(fs, file);
    try {
      out = checkZip(r.read, r.size, defaultOptions(root));
    } finally {
      r.close();
    }
  } catch (e) {
    out = 'ZIP_REFUSED:' + (e instanceof ZipRefused ? e.zipReason : 'exception:' + e.message);
  }
  process.stdout.write(out);
}
