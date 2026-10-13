// Authenticode policy for the extracted PostgreSQL binaries (step P6), applied
// BEFORE any of them is executed. Input: one line per .exe/.dll found under
// pgsql/bin and pgsql/lib, "<relative path>|<status>|<signer subject>", as
// PowerShell's Get-AuthenticodeSignature reports them.
//
// The ZIP itself carries no signature and EDB publishes no checksum, so the
// executables' signatures are what authenticates the archive:
//   - any status other than Valid / NotSigned (HashMismatch, NotTrusted,
//     UnknownError…) blocks;
//   - every .exe must be Valid and signed by EnterpriseDB — otherwise blocked;
//   - a .dll Valid under any trusted publisher is accepted (OpenSSL, ICU,
//     the Visual C++ runtime are not EDB's);
//   - a NotSigned .dll is accepted in "standard" mode only, and only once
//     every .exe passed: it then comes from the same archive, its CRC already
//     checked against the archive in P5b. "strict" mode blocks it.
//
// Found on 2026-10-12 with 18.6-5: EDB signs none of the server's executables
// in the ZIP (stackbuilder.exe only), so the rule above can never pass. Hence
// "pinned" mode: the archive's SHA-256 must equal one published by a source
// independent of the download (PINNED_ARCHIVES), for that exact file name.
// An unsigned .exe is then accepted, as the hash authenticates every byte;
// any other status still blocks, and a signed .exe must still be EDB's.
//
// CLI: node policy.mjs <standard|strict> [<archive sha256> <final url>]
// (report on stdin; with a pinned archive the mode becomes "pinned")
// Prints "SIG_OK exe=… dll_signed=… dll_unsigned=…" (then the unsigned files)
// or "SIG_BLOCKED:<reason>:<path>".
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const EDB_SIGNER = /(^|[,\s])O=("?)EnterpriseDB/i;

/**
 * SHA-256 → file name, each checked against a second source. 18.6-5: the
 * Scoop "main" bucket's postgresql.json (github.com/ScoopInstaller/Main),
 * read on 2026-10-12, same hash as the file downloaded that day.
 */
export const PINNED_ARCHIVES = {
  e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2:
    'postgresql-18.6-5-windows-x64-binaries.zip',
};

/**
 * The mode P6 applies. "pinned" only replaces "standard", and only for this
 * exact pinned archive; "strict" is never relaxed; nothing else is accepted
 * as a request (asking for "pinned" directly gives "invalid").
 */
export function archiveMode(mode, sha, finalUrl) {
  if (mode !== 'standard' && mode !== 'strict') return 'invalid';
  const name = Object.hasOwn(PINNED_ARCHIVES, sha || '') ? PINNED_ARCHIVES[sha] : '';
  if (mode === 'strict' || !/^[0-9a-f]{64}$/.test(sha || '') || !name) return mode;
  const file = String(finalUrl || '')
    .replace(/[?#].*$/, '')
    .split('/')
    .pop();
  return file === name ? 'pinned' : mode;
}

export function evaluateSignatures(report, mode) {
  if (mode !== 'standard' && mode !== 'strict' && mode !== 'pinned')
    return 'SIG_BLOCKED:mode:' + mode;
  const rows = [];
  for (const raw of report.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const parts = raw.split('|');
    if (parts.length !== 3) return 'SIG_BLOCKED:report_malformed:' + raw.slice(0, 80);
    const [path, status, signer] = parts;
    if (!/^(bin|lib)\/[^|]+\.(exe|dll)$/i.test(path)) return 'SIG_BLOCKED:path:' + path;
    rows.push({ path, status, signer, exe: /\.exe$/i.test(path) });
  }
  const exes = rows.filter((r) => r.exe);
  const dlls = rows.filter((r) => !r.exe);
  if (exes.length === 0) return 'SIG_BLOCKED:no_executable:-';
  for (const r of ['bin/postgres.exe', 'bin/initdb.exe', 'bin/pg_ctl.exe', 'bin/psql.exe']) {
    if (!exes.some((e) => e.path.toLowerCase() === r)) return 'SIG_BLOCKED:required_missing:' + r;
  }
  for (const r of rows) {
    if (r.status !== 'Valid' && r.status !== 'NotSigned')
      return 'SIG_BLOCKED:status_' + r.status + ':' + r.path;
  }
  for (const e of exes) {
    if (e.status !== 'Valid' && mode !== 'pinned') return 'SIG_BLOCKED:exe_not_signed:' + e.path;
    if (e.status === 'Valid' && !EDB_SIGNER.test(e.signer))
      return 'SIG_BLOCKED:exe_signer:' + e.path;
  }
  const unsigned = dlls.filter((d) => d.status === 'NotSigned');
  if (unsigned.length > 0 && mode === 'strict')
    return 'SIG_BLOCKED:dll_not_signed:' + unsigned[0].path;
  const unsignedExes = exes.filter((e) => e.status === 'NotSigned');
  if (mode === 'pinned')
    return (
      'SIG_OK exe=' +
      exes.length +
      ' exe_unsigned=' +
      unsignedExes.length +
      ' dll_signed=' +
      (dlls.length - unsigned.length) +
      ' dll_unsigned=' +
      unsigned.length +
      '\n  archive épinglée : SHA-256 identique à celle publiée par une source indépendante'
    );
  return (
    'SIG_OK exe=' +
    exes.length +
    ' dll_signed=' +
    (dlls.length - unsigned.length) +
    ' dll_unsigned=' +
    unsigned.length +
    (unsigned.length
      ? '\n' + unsigned.map((d) => '  non signée (acceptée, même archive) : ' + d.path).join('\n')
      : '')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = archiveMode(process.argv[2] || '', process.argv[3], process.argv[4]);
  process.stdout.write(evaluateSignatures(fs.readFileSync(0, 'utf8'), mode));
}
