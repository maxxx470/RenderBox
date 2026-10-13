# Local PostgreSQL sandbox — helpers and steps. Sourced by step.sh only, in a
# child shell started by rb_run (rb-pgtest.sh) with an emptied environment
# (env -i + allow-list), `set -Eeuo pipefail` and `inherit_errexit`: any
# failure, in a pipeline, a function or a command substitution, ends the
# step, and the launcher then locks the protocol.
#
# Nothing here reads a file of the sandbox to decide how to clean it up: the
# cleanup steps (N1, N2a, N2b) only use this file and the repository's
# scripts, so a sandbox left half-built by a failed P2 can still be checked
# and removed.
#
# Paths: the repository's from RB_TOOLS (this folder, set by rb-pgtest.sh),
# the sandbox's from the system drive — <drive>:/rb-pgtest, nothing else.

rb_die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

[[ "${RB_TOOLS:-}" =~ ^[A-Za-z]:/.+/scripts/pg-sandbox$ ]] || rb_die "RB_TOOLS absent ou inattendu"
[[ "${SYSTEMDRIVE:-}" =~ ^[A-Za-z]:$ ]] || rb_die "SYSTEMDRIVE absent ou inattendu"
SYSROOT=$(cygpath -m "${SYSTEMROOT:-}") && [[ "$SYSROOT" =~ ^[A-Za-z]:/ ]] || rb_die "SYSTEMROOT absent ou inattendu"
RB="$SYSTEMDRIVE/rb-pgtest"
FE="${RB_TOOLS%/scripts/pg-sandbox}"
[ -f "$FE/package.json" ] && [ -f "$FE/prisma/schema.prisma" ] || rb_die "dépôt introuvable depuis $RB_TOOLS"
PGBIN="$RB/pgsql/bin"
PGD="$RB/data"
M9_SHA=08434ab34cb71a3823a5163bbab86b792bcaf51af3790132523106edf7796388
MIGRATIONS=13
PRISMA_VERSION=5.22.0
CONNTEST="host=127.0.0.1 hostaddr=127.0.0.1 port=55432 dbname=rb_materials_test user=rb_test sslmode=disable connect_timeout=5"
CONNADMIN="host=127.0.0.1 hostaddr=127.0.0.1 port=55432 dbname=postgres user=rb_admin sslmode=disable connect_timeout=5"

# ── Shared checks ──────────────────────────────────────────────────────────

# 0 = something listens on TCP port $1 (IPv4 or IPv6), 1 = free; netstat failing STOPS the step.
rb_port_listening() {
  local ns ns6
  ns=$(netstat -ano -p TCP) || rb_die "netstat a échoué"
  ns6=$(netstat -ano -p TCPv6) || rb_die "netstat (IPv6) a échoué"
  grep -Eq "^[[:space:]]*TCP[[:space:]]+[^[:space:]]+:$1[[:space:]]+[^[:space:]]+[[:space:]]+LISTENING" <<<"$ns$ns6"
}

# Number of postgres.exe processes started from the sandbox — other PostgreSQL
# servers on the machine are never counted, never touched.
rb_sandbox_processes() {
  local n
  n=$(powershell.exe -NoProfile -NonInteractive -Command "\$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter \"Name='postgres.exe'\" | Where-Object { \$_.ExecutablePath -and \$_.ExecutablePath.Replace([char]92, [char]47).ToLower().StartsWith('${RB,,}/') }).Count") \
    || rb_die "requête des processus en échec"
  n=${n//$'\r'/}
  [[ "$n" =~ ^[0-9]+$ ]] || rb_die "réponse illisible : $n"
  echo "$n"
}

# Windows reparse points (junctions, symlinks, cloud files…) under $1, itself included.
rb_reparse_count() {
  local out
  out=$(powershell.exe -NoProfile -NonInteractive -Command "\$ErrorActionPreference='Stop'; \$n = @(Get-ChildItem -LiteralPath '$1' -Recurse -Force -Attributes ReparsePoint).Count; if ((Get-Item -LiteralPath '$1' -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { \$n++ }; 'REPARSE=' + \$n") \
    || rb_die "contrôle des points d'analyse en échec ($1)"
  out=${out//$'\r'/}
  [[ "$out" =~ ^REPARSE=([0-9]+)$ ]] || rb_die "réponse illisible : $out"
  echo "${BASH_REMATCH[1]}"
}

# The marker's nonce; the marker must name this very sandbox.
rb_marker_nonce() {
  node -e '
const m = /^nonce=([0-9a-f]{32})\npath=([A-Za-z]:\/rb-pgtest)\n$/.exec(require("fs").readFileSync(process.argv[1] + "/.rb-pgtest-marker", "utf8"));
if (!m || m[2] !== process.argv[1]) process.exit(1);
process.stdout.write(m[1]);' "$RB" || rb_die "marqueur absent ou invalide"
}

rb_choice() {
  [ -f "$RB/choice.txt" ] || rb_die "choice.txt absent : P3 non faite"
  PG_MAJOR=$(sed -n 's/^PG_MAJOR=\(1[4-8]\)$/\1/p' "$RB/choice.txt")
  PG_URL=$(sed -n 's#^PG_URL=\(https://sbp\.enterprisedb\.com/getfile\.jsp?fileid=[0-9][0-9]*\)$#\1#p' "$RB/choice.txt")
  [ -n "$PG_MAJOR" ] && [ -n "$PG_URL" ] || rb_die "choice.txt invalide"
}

# EDB's download id per major version, read on enterprisedb.com/download-postgresql-binaries
# on 2026-10-12 (18.6, 17.11, 16.15, 15.19, 14.24). P4a refuses any file whose name
# is not postgresql-<major>.*-windows-x64-binaries.zip, so a stale id fails closed.
rb_edb_fileid() {
  case "$1" in
    14) echo 1260637 ;; 15) echo 1260630 ;; 16) echo 1260623 ;; 17) echo 1260616 ;; 18) echo 1260609 ;;
    *) return 1 ;;
  esac
}

# Empties every name defined in frontend/.env and .env.local (names only, values never
# read), then sets the sandbox's values. Prisma's dotenv never overrides a variable
# already present, even empty.
rb_env() {
  local f k keys="" pw
  for f in "$FE/.env" "$FE/.env.local"; do
    [ -f "$f" ] || continue
    keys+=$(sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$f")$'\n'
  done
  for k in $keys; do
    case "$k" in PATH|SYSTEMROOT|SYSTEMDRIVE|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|RB_*) continue ;; esac
    export "$k="
  done
  pw=$(cat "$RB/pw.txt") || rb_die "pw.txt illisible"
  [[ "$pw" =~ ^[A-Za-z0-9_-]{24}$ ]] || rb_die "pw.txt invalide"
  export DATABASE_URL="postgresql://rb_test:${pw}@127.0.0.1:55432/rb_materials_test?schema=public"
  export DIRECT_URL="$DATABASE_URL"
  export PGPASSFILE="$RB/pgpass.conf" AUTH_DISABLED=true CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
  export RB_PGTEST_ROOT="$RB"
}

# One line: RB_GUARD_OK or RB_GUARD_REFUSED:<reason>. The URL half is decided by
# guard.mjs before any connection; the server half asks the server that answers
# on 127.0.0.1:55432 to prove it holds the sandbox (marker nonce in the database comment).
rb_guard() {
  local verdict nonce out
  verdict=$(node "$RB_TOOLS/guard.mjs" "$RB") || { echo "RB_GUARD_REFUSED:node_error"; return 1; }
  [ "$verdict" = SHELL_OK ] || { echo "RB_GUARD_REFUSED:${verdict#REFUSED:}"; return 1; }
  nonce=$(rb_marker_nonce 2>/dev/null) || { echo "RB_GUARD_REFUSED:marker"; return 1; }
  [ -x "$PGBIN/psql.exe" ] || { echo "RB_GUARD_REFUSED:psql_missing"; return 1; }
  out=$("$PGBIN/psql.exe" -X -q -t -A -w -v ON_ERROR_STOP=1 "$CONNTEST" \
      -c "select case when current_database() = 'rb_materials_test' and session_user = 'rb_test' and current_user = 'rb_test' and inet_server_addr() = inet '127.0.0.1' and inet_server_port() = 55432 and current_setting('port') = '55432' and current_setting('listen_addresses') = '127.0.0.1' and current_schema() = 'public' and shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') = 'rb-pgtest-$nonce' then 'RB_TEST_OK' else 'RB_TEST_MISMATCH' end") \
    || { echo "RB_GUARD_REFUSED:server_error"; return 1; }
  out=${out//$'\r'/}
  [ "$out" = RB_TEST_OK ] || { echo "RB_GUARD_REFUSED:server_identity"; return 1; }
  echo RB_GUARD_OK
}
rb_require_guard() { local out; out=$(rb_guard) && [ "$out" = RB_GUARD_OK ] || rb_die "garde : ${out:-aucune sortie}"; echo "  garde : OK"; }

# Succeeds ONLY if the guard refuses for exactly the expected reason.
rb_expect_refusal() {   # $1 reason, $2 DATABASE_URL, $3 DIRECT_URL, $4 optional VAR=value
  local out rc
  out=$( export DATABASE_URL="$2" DIRECT_URL="$3"; if [ -n "${4:-}" ]; then export "$4"; fi; rb_guard ) && rc=0 || rc=$?
  if [ "$rc" -eq 0 ]; then rb_die "CRITIQUE : la garde a ACCEPTÉ ($1) — sortie=$out"; fi
  [ "$out" = "RB_GUARD_REFUSED:$1" ] || rb_die "ERREUR DE TEST : attendu RB_GUARD_REFUSED:$1, obtenu '$out' (rc=$rc)"
  echo "  refus attendu : $1"
}

rb_admin_psql() { PGPASSFILE="$RB/pgpass.conf" "$PGBIN/psql.exe" -X -q -t -A -w -v ON_ERROR_STOP=1 "$CONNADMIN" "$@"; }
rb_test_psql()  { PGPASSFILE="$RB/pgpass.conf" "$PGBIN/psql.exe" -X -q -t -A -w -v ON_ERROR_STOP=1 "$CONNTEST" "$@"; }
rb_admin_identity() {
  local v
  v=$(rb_admin_psql -c "select case when inet_server_addr() = inet '127.0.0.1' and inet_server_port() = 55432 and lower(replace(current_setting('data_directory'), '\', '/')) = lower('$PGD') then 'ADMIN_OK' else 'ADMIN_MISMATCH' end")
  v=${v//$'\r'/}
  [ "$v" = ADMIN_OK ] || rb_die "le serveur joint n'est pas la grappe de test ($v)"
}

rb_prisma_engines() {   # prints "<schema engine>|<query engine>"
  node -e '
const path = require("path"), fe = process.argv[1];
const prismaDir = path.dirname(require.resolve("prisma/package.json", { paths: [fe] }));
const engines = path.dirname(require.resolve("@prisma/engines/package.json", { paths: [prismaDir] }));
const client = path.dirname(require.resolve("@prisma/client/package.json", { paths: [fe] }));
const slash = (p) => p.split(path.sep).join("/");
process.stdout.write(slash(path.join(engines, "schema-engine-windows.exe")) + "|" + slash(path.join(client, "..", "..", ".prisma", "client", "query_engine-windows.dll.node")));' "$FE"
}

# Prisma starts only if ALL of this holds, checked right before, in the same step.
rb_prisma_preflight() {
  local d k n v h eng
  rb_require_guard
  [ "${CHECKPOINT_DISABLE:-}" = 1 ] || rb_die "CHECKPOINT_DISABLE absent"
  for k in $(compgen -e); do case "$k" in PRISMA_HIDE_UPDATE_MESSAGE) ;; PRISMA_*) rb_die "variable $k présente" ;; esac; done
  eng=$(rb_prisma_engines)
  [ -f "${eng%%|*}" ] || rb_die "moteur de schéma absent : Prisma tenterait un téléchargement"
  [ -f "$RB/work/prisma/schema.prisma" ] && [ -d "$RB/work/prisma/migrations" ] || rb_die "copie isolée incomplète"
  [ "$(ls -A "$RB/work")" = prisma ] || rb_die "work/ doit contenir uniquement prisma/"
  for d in "$RB/work" "$RB/work/prisma" "$RB" "$SYSTEMDRIVE"; do [ ! -e "$d/.env" ] || rb_die ".env présent dans $d"; done
  for d in "$RB/work" "$RB" "$SYSTEMDRIVE"; do [ ! -e "$d/package.json" ] || rb_die "package.json présent dans $d"; done
  cmp -s "$RB/work/prisma/schema.prisma" "$FE/prisma/schema.prisma" || rb_die "schéma copié différent du dépôt"
  diff -rq "$RB/work/prisma/migrations" "$FE/prisma/migrations" >/dev/null || rb_die "migrations copiées différentes du dépôt"
  h=$(sha256sum "$RB/work/prisma/migrations/9_phase7_materials_per_node/migration.sql" | cut -c1-64)
  [ "$h" = "$M9_SHA" ] || rb_die "migration 9 ≠ version auditée"
  n=$(find "$RB/work/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l)
  [ "$n" -eq "$MIGRATIONS" ] || rb_die "$MIGRATIONS migrations attendues, $n"
  grep -qx '  url       = env("DATABASE_URL")' "$RB/work/prisma/schema.prisma" || rb_die "datasource url inattendue"
  grep -qx '  directUrl = env("DIRECT_URL")' "$RB/work/prisma/schema.prisma" || rb_die "directUrl inattendue"
  if grep -Eq 'postgres(ql)?://' "$RB/work/prisma/schema.prisma"; then rb_die "URL écrite en dur dans le schéma"; fi
  v=$(node -p 'require(process.argv[1]).version' "$FE/node_modules/prisma/package.json")
  [ "$v" = "$PRISMA_VERSION" ] || rb_die "Prisma $v ≠ $PRISMA_VERSION"
}
rb_prisma_exec() { ( cd "$RB/work" && node "$FE/node_modules/prisma/build/index.js" "$@" ); }

# ── Cleanup checks (never read a file of the sandbox to decide anything but the inventory) ──

rb_server_down() {
  local n
  n=$(rb_sandbox_processes)
  [ "$n" = 0 ] || rb_die "$n processus postgres.exe du bac à sable encore actifs"
  if rb_port_listening 55432; then rb_die "port 55432 en écoute"; fi
}

# stdout: ABSENT, VIDE or the inventory token; details on stderr; any refusal STOPS.
rb_assess() {
  local inv first n
  inv=$(node "$RB_TOOLS/inventory.mjs" "$RB" "$FE/prisma") || rb_die "inventaire : erreur d'exécution"
  first=${inv%%$'\n'*}
  case "$first" in
    "INV_OK ABSENT") echo ABSENT; return 0 ;;
    "INV_OK "*) ;;
    *) rb_die "inventaire refusé : $first" ;;
  esac
  n=$(rb_reparse_count "$RB")
  [ "$n" = 0 ] || rb_die "$n point(s) d'analyse Windows sous $RB"
  rb_server_down
  printf '%s\n' "$inv" >&2
  echo "${first#INV_OK }"
}

# ── Preparation ───────────────────────────────────────────────────────────

step_P1() {
  local drv free n v f eng
  if net session >/dev/null 2>&1; then rb_die "terminal administrateur : ouvrir un Git Bash normal"; fi
  [ ! -e "$RB" ] || rb_die "$RB existe déjà"
  [ ! -e "$SYSTEMDRIVE/.env" ] || rb_die "$SYSTEMDRIVE/.env présent"
  [ ! -e "$SYSTEMDRIVE/package.json" ] || rb_die "$SYSTEMDRIVE/package.json présent"
  if rb_port_listening 55432; then rb_die "port 55432 déjà utilisé"; fi
  drv=${SYSTEMDRIVE%:}
  free=$(df -Pm "/${drv,,}" | awk 'NR==2 {print $4}')
  [[ "$free" =~ ^[0-9]+$ ]] && [ "$free" -gt 2048 ] || rb_die "espace libre insuffisant ou illisible ($free Mo)"
  [ -f "$FE/prisma/migrations/9_phase7_materials_per_node/migration.sql" ] || rb_die "migration 9 introuvable"
  [ "$(sha256sum "$FE/prisma/migrations/9_phase7_materials_per_node/migration.sql" | cut -c1-64)" = "$M9_SHA" ] || rb_die "migration 9 différente de la version auditée"
  n=$(find "$FE/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l)
  [ "$n" -eq "$MIGRATIONS" ] || rb_die "$MIGRATIONS migrations attendues, $n trouvées"
  v=$(node -p 'require(process.argv[1]).version' "$FE/node_modules/prisma/package.json")
  [ "$v" = "$PRISMA_VERSION" ] || rb_die "Prisma $PRISMA_VERSION attendu, $v trouvé"
  eng=$(rb_prisma_engines)
  [ -f "${eng%%|*}" ] && [ -f "${eng##*|}" ] || rb_die "moteurs Prisma absents"
  [ "$(node -p 'typeof require("zlib").crc32')" = function ] || rb_die "Node sans zlib.crc32 (≥ 22.2 requis)"
  for f in vcruntime140.dll vcruntime140_1.dll msvcp140.dll tar.exe curl.exe; do
    [ -f "$SYSROOT/System32/$f" ] || rb_die "$f absent de System32"
  done
  echo "  P1 : $RB libre, port 55432 libre, ${free} Mo libres, $n migrations, Prisma $v, Node $(node -v)"
}

step_P2() {
  [ ! -e "$RB" ] || rb_die "$RB existe déjà"
  mkdir "$RB"
  # The marker comes first: from here on, N1/N2a/N2b can check and remove the sandbox.
  node -e 'require("fs").writeFileSync(process.argv[1] + "/.rb-pgtest-marker", "nonce=" + require("crypto").randomBytes(16).toString("hex") + "\npath=" + process.argv[1] + "\n", { flag: "wx" })' "$RB"
  rb_marker_nonce >/dev/null
  mkdir "$RB/dl" "$RB/work"
  echo "  $RB créé, marqueur posé"
}

step_P3() {
  local id
  [[ "${RB_NEON_MAJOR:-}" =~ ^1[4-8]$ ]] || rb_die "RB_NEON_MAJOR absent : lancer d'abord rb_neon_version (ou le saisir depuis la console Neon)"
  id=$(rb_edb_fileid "$RB_NEON_MAJOR") || rb_die "version $RB_NEON_MAJOR sans archive connue"
  [ ! -e "$RB/choice.txt" ] || rb_die "choice.txt existe déjà"
  printf 'PG_MAJOR=%s\nPG_URL=https://sbp.enterprisedb.com/getfile.jsp?fileid=%s\n' "$RB_NEON_MAJOR" "$id" > "$RB/choice.txt"
  rb_choice
  echo "  version locale = version Neon : $PG_MAJOR"
}

step_P4a() {
  local meta final code
  rb_choice
  meta=$(curl.exe -sS -I -L --proto =https --proto-redir =https --max-redirs 5 -o NUL -w '%{url_effective}|%{http_code}' "$PG_URL")
  final=${meta%|*}; code=${meta##*|}
  [ "$code" = 200 ] || rb_die "HEAD : code HTTP $code"
  [[ "$final" =~ ^https://([a-z0-9-]+\.)*enterprisedb\.com/[^?#]*/postgresql-${PG_MAJOR}\.[0-9]+-[0-9]+-windows-x64-binaries\.zip(\?[^#]*)?$ ]] || rb_die "adresse finale inattendue : $final"
  printf '%s\n' "$final" > "$RB/dl/final-url.txt"
  echo "  adresse finale : $final"
}

step_P4b() {
  local final size sha
  final=$(cat "$RB/dl/final-url.txt")
  [ ! -e "$RB/dl/pg.zip" ] || rb_die "pg.zip existe déjà"
  curl.exe -fsS --proto =https --max-redirs 0 -o "$RB/dl/pg.zip" "$final"
  size=$(stat -c %s "$RB/dl/pg.zip")
  [ "$size" -gt 100000000 ] && [ "$size" -lt 1500000000 ] || rb_die "taille anormale : $size octets"
  sha=$(sha256sum "$RB/dl/pg.zip" | cut -c1-64)
  printf '%s\n' "$sha" > "$RB/dl/pg.zip.sha256"
  echo "  $size octets ; SHA-256 $sha (consignée : EDB ne publie aucune somme à comparer)"
}

step_P5a() {
  local zv head f
  [ -f "$RB/dl/pg.zip" ] || rb_die "pg.zip absent"
  [ ! -e "$RB/dl/pg.list" ] || rb_die "pg.list existe déjà"
  [ ! -e "$RB/pgsql" ] || rb_die "pgsql/ existe déjà"
  zv=$(node "$RB_TOOLS/zip-check.mjs" "$RB/dl/pg.zip" "$RB")
  head=${zv%%$'\n'*}
  [[ "$head" =~ ^ZIP_OK\ [0-9]+\ [0-9]+$ ]] || rb_die "archive refusée : $head"
  ( set -C; printf '%s\n' "${zv#*$'\n'}" > "$RB/dl/pg.list" )
  for f in pgsql/bin/initdb.exe pgsql/bin/pg_ctl.exe pgsql/bin/postgres.exe pgsql/bin/psql.exe pgsql/share/postgres.bki; do
    awk -v f="$f" '$1 == "F" && $4 == f { ok = 1 } END { exit !ok }' "$RB/dl/pg.list" || rb_die "$f absent de l'archive"
  done
  echo "  archive validée ($head : entrées, entrées à extraire)"
}

step_P5b() {
  local xv n
  [ -f "$RB/dl/pg.list" ] || rb_die "pg.list absent : P5a non faite"
  [ ! -e "$RB/pgsql" ] || rb_die "pgsql/ existe déjà"
  "$SYSROOT/System32/tar.exe" -x -k -f "$RB/dl/pg.zip" -C "$RB" pgsql/bin pgsql/lib pgsql/share
  xv=$(node "$RB_TOOLS/extract-check.mjs" "$RB")
  [[ "$xv" =~ ^EXTRACT_OK\ [0-9]+$ ]] || rb_die "extraction refusée : $xv"
  n=$(rb_reparse_count "$RB/pgsql")
  [ "$n" = 0 ] || rb_die "$n point(s) d'analyse Windows dans pgsql/"
  echo "  extraction vérifiée : $xv (aucun binaire exécuté)"
}

step_P6() {
  local rep verdict b out sha
  # The archive's hash, recomputed now (not trusted from P4b's file), for the
  # pinned-archive check in policy.mjs.
  sha=$(sha256sum "$RB/dl/pg.zip" | cut -c1-64)
  [ "$sha" = "$(cat "$RB/dl/pg.zip.sha256")" ] || rb_die "pg.zip a changé depuis P4b"
  rep=$(powershell.exe -NoProfile -NonInteractive -Command "\$ErrorActionPreference='Stop'; \$base = (Resolve-Path -LiteralPath '$RB/pgsql').Path; Get-ChildItem -LiteralPath (Join-Path \$base 'bin'), (Join-Path \$base 'lib') -Recurse -Force -File | Where-Object { \$_.Extension -in '.exe', '.dll' } | ForEach-Object { \$s = Get-AuthenticodeSignature -LiteralPath \$_.FullName; '{0}|{1}|{2}' -f \$_.FullName.Substring(\$base.Length + 1).Replace([char]92, [char]47), \$s.Status, (\$s.SignerCertificate.Subject -replace '\|', '/') }")
  rep=${rep//$'\r'/}
  verdict=$(node "$RB_TOOLS/policy.mjs" "${RB_SIGNATURE_POLICY:-standard}" "$sha" "$(cat "$RB/dl/final-url.txt")" <<<"$rep")
  printf '%s\n' "$verdict"
  [[ "$verdict" == SIG_OK* ]] || rb_die "signatures refusées"
  # First execution of any extracted binary — only now that it is authenticated.
  rb_choice
  for b in postgres initdb pg_ctl psql; do
    out=$("$PGBIN/$b.exe" -V); out=${out//$'\r'/}
    [[ "$out" =~ \(PostgreSQL\)\ ${PG_MAJOR}\. ]] || rb_die "$b : version inattendue ou DLL manquante ($out)"
  done
  echo "  binaires authentifiés, version $PG_MAJOR confirmée"
}

step_P7() {
  rb_choice
  [ ! -e "$PGD" ] || rb_die "dossier de données déjà présent"
  node -e '
const fs = require("fs"), c = require("crypto"), root = process.argv[1];
const admin = c.randomBytes(18).toString("base64url"), test = c.randomBytes(18).toString("base64url");
fs.writeFileSync(root + "/pw_admin.txt", admin, { flag: "wx" });
fs.writeFileSync(root + "/pw.txt", test, { flag: "wx" });
fs.writeFileSync(root + "/pgpass.conf", "127.0.0.1:55432:postgres:rb_admin:" + admin + "\n127.0.0.1:55432:rb_materials_test:rb_test:" + test + "\n", { flag: "wx" });' "$RB"
  "$PGBIN/initdb.exe" -D "$PGD" -U rb_admin --pwfile="$RB/pw_admin.txt" --auth=scram-sha-256 -E UTF8 --locale=C
  [ "$(tr -d '\r\n' < "$PGD/PG_VERSION")" = "$PG_MAJOR" ] || rb_die "PG_VERSION inattendu"
}

step_P8() {
  local ns l ns6
  if rb_port_listening 55432; then rb_die "port 55432 déjà en écoute"; fi
  [ ! -e "$PGD/postmaster.pid" ] || rb_die "postmaster.pid déjà présent"
  "$PGBIN/pg_ctl.exe" -D "$PGD" -l "$RB/pg.log" -o "-p 55432 -c listen_addresses=127.0.0.1" -w -t 60 start
  ns=$(netstat -ano -p TCP)
  l=$(grep -E ':55432[[:space:]].*LISTENING' <<<"$ns") || rb_die "55432 n'est pas en écoute"
  if grep -Evq '^[[:space:]]*TCP[[:space:]]+127\.0\.0\.1:55432[[:space:]]' <<<"$l"; then rb_die "écoute ailleurs que sur 127.0.0.1"; fi
  ns6=$(netstat -ano -p TCPv6)
  if grep -Eq ':55432[[:space:]]' <<<"$ns6"; then rb_die "écoute IPv6 inattendue"; fi
  [ "$(rb_sandbox_processes)" -ge 1 ] || rb_die "aucun postgres.exe du bac à sable"
  rb_admin_identity
  echo "  serveur du bac à sable identifié (127.0.0.1:55432, $PGD)"
}

step_P9() {
  local v nonce
  rb_admin_identity
  # 9a — the role; its password through a pipe, never an argument; nothing in pg.log if it fails
  node -e '
const pw = require("fs").readFileSync(process.argv[1] + "/pw.txt", "utf8");
if (!/^[A-Za-z0-9_-]{24}$/.test(pw)) process.exit(1);
process.stdout.write("SET log_min_error_statement = panic;\nCREATE ROLE rb_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD \x27" + pw + "\x27;\n");' "$RB" | rb_admin_psql
  v=$(rb_admin_psql -c "select count(*) from pg_roles where rolname = 'rb_test' and rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole")
  [ "${v//$'\r'/}" = 1 ] || rb_die "9a : rôle absent ou mal configuré"
  # 9b — the database, only once 9a is confirmed
  rb_admin_psql -c "CREATE DATABASE rb_materials_test OWNER rb_test"
  v=$(rb_admin_psql -c "select count(*) from pg_database d join pg_roles r on r.oid = d.datdba where d.datname = 'rb_materials_test' and r.rolname = 'rb_test'")
  [ "${v//$'\r'/}" = 1 ] || rb_die "9b : base absente ou propriétaire inattendu"
  # 9c — the marker comment, only once 9b is confirmed
  nonce=$(rb_marker_nonce)
  rb_admin_psql -c "COMMENT ON DATABASE rb_materials_test IS 'rb-pgtest-$nonce'"
  v=$(rb_admin_psql -c "select shobj_description(oid, 'pg_database') from pg_database where datname = 'rb_materials_test'")
  [ "${v//$'\r'/}" = "rb-pgtest-$nonce" ] || rb_die "9c : commentaire-marqueur absent"
  echo "  rôle, base et commentaire-marqueur confirmés"
}

step_P10() {
  local G U
  rb_env
  rb_require_guard
  G="postgresql://rb_test:AAAAAAAAAAAAAAAAAAAAAAAA@127.0.0.1"; U="/rb_materials_test?schema=public"
  rb_expect_refusal port        "$G:55433$U" "$G:55433$U"
  rb_expect_refusal host        "postgresql://rb_test:x@ep-abc.eu-central-1.aws.neon.tech:55432$U" "postgresql://rb_test:x@ep-abc.eu-central-1.aws.neon.tech:55432$U"
  rb_expect_refusal host        "postgresql://rb_test:x@10.0.0.5:55432$U" "postgresql://rb_test:x@10.0.0.5:55432$U"
  rb_expect_refusal host        "postgresql://rb_test:x@127.0.0.1:55432@evil.example:55432$U" "postgresql://rb_test:x@127.0.0.1:55432@evil.example:55432$U"
  rb_expect_refusal url_differ  "$G:55432$U" "postgresql://rb_test:x@ep-abc.neon.tech/neondb"
  rb_expect_refusal params      "$G:55432$U&host=remote.example" "$G:55432$U&host=remote.example"
  rb_expect_refusal database    "$G:55432/neondb?schema=public" "$G:55432/neondb?schema=public"
  rb_expect_refusal user        "postgresql://postgres:AAAAAAAAAAAAAAAAAAAAAAAA@127.0.0.1:55432$U" "postgresql://postgres:AAAAAAAAAAAAAAAAAAAAAAAA@127.0.0.1:55432$U"
  rb_expect_refusal protocol    "mysql://rb_test:x@127.0.0.1:55432$U" "mysql://rb_test:x@127.0.0.1:55432$U"
  rb_expect_refusal env_PGHOSTADDR "$DATABASE_URL" "$DATABASE_URL" PGHOSTADDR=10.0.0.5
  rb_expect_refusal env_PGSERVICE  "$DATABASE_URL" "$DATABASE_URL" PGSERVICE=prod
  rb_expect_refusal password    "$G:55432$U" "$G:55432$U"
  rb_expect_refusal url_missing "" ""
}

step_P11() {
  rb_env
  [ -z "$(ls -A "$RB/work")" ] || rb_die "work/ non vide"
  cp -r "$FE/prisma" "$RB/work/"
  rb_prisma_preflight
  echo "  copie isolée de prisma/ conforme"
}

# ── Migrations (separate authorization) ────────────────────────────────────

step_M1() {
  local out rc m
  rb_env; rb_prisma_preflight
  out=$(rb_prisma_exec migrate status --schema prisma/schema.prisma 2>&1) && rc=0 || rc=$?
  printf '%s\n' "$out"
  [ "$rc" -eq 1 ] || rb_die "status : code $rc, 1 attendu (migrations en attente)"
  grep -q "have not yet been applied" <<<"$out" || rb_die "message attendu absent"
  for m in $(find "$RB/work/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n'); do
    grep -Fq "$m" <<<"$out" || rb_die "$m non listée"
  done
}
step_M2() { rb_env; rb_prisma_preflight; rb_prisma_exec migrate deploy --schema prisma/schema.prisma; }
step_M3() {
  local out
  rb_env; rb_prisma_preflight
  out=$(rb_prisma_exec migrate status --schema prisma/schema.prisma 2>&1) || rb_die "status en échec après deploy : $out"
  grep -q "Database schema is up to date" <<<"$out" || rb_die "schéma non à jour : $out"
}
step_M4() {
  local v
  rb_env; rb_require_guard
  rb_test_psql -c "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by started_at"
  v=$(rb_test_psql -c "select count(*) from _prisma_migrations where finished_at is not null and rolled_back_at is null")
  [ "${v//$'\r'/}" = "$MIGRATIONS" ] || rb_die "$MIGRATIONS migrations appliquées attendues"
  v=$(rb_test_psql -c "select count(*) from pg_constraint where conname in ('MaterialCorrection_face_canonical_check','MaterialCorrection_origin_check','MaterialDetectionRun_status_check','MaterialDetection_confidence_check','MaterialDetection_face_canonical_check','Material_attachedNodeId_fkey','MaterialDetectionRun_nodeId_fkey','MaterialDetection_nodeId_fkey','MaterialCorrection_nodeId_fkey','MaterialCorrection_legacyMaterialId_fkey')")
  [ "${v//$'\r'/}" = 10 ] || rb_die "contraintes de la migration 9 manquantes"
  v=$(rb_test_psql -c "select count(*) from pg_indexes where indexname in ('MaterialDetectionRun_status_updatedAt_idx','MaterialDetection_nodeId_face_key','MaterialCorrection_legacyMaterialId_key','MaterialCorrection_nodeId_face_key','Material_attachedNodeId_idx')")
  [ "${v//$'\r'/}" = 5 ] || rb_die "index de la migration 9 manquants"
}
step_M5() {
  rb_env; rb_prisma_preflight
  rb_prisma_exec migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
}

# ── Tests (separate authorization) ─────────────────────────────────────────

step_T1() {
  local eng vrc=0 left
  rb_env; rb_require_guard
  eng=$(rb_prisma_engines)
  [ -f "${eng##*|}" ] || rb_die "moteur de requêtes Prisma absent"
  ( cd "$FE" && RB_PG_TEST=1 timeout -k 30 900 node node_modules/vitest/vitest.mjs run materials-per-image.pg --maxWorkers=1 --no-file-parallelism ) || vrc=$?
  # Counted even when Vitest failed: the suite cleans up after itself, this proves it.
  left=$(rb_test_psql -c "select (select count(*) from \"User\" where id like 'rbpg%' or id = 'auth-disabled-demo-user') + (select count(*) from \"Project\" where id like 'rbpg%') + (select count(*) from \"RenderNode\" where id like 'rbpg%') + (select count(*) from \"Material\" where id like 'rbpg%') + (select count(*) from \"MaterialCorrection\" where \"nodeId\" like 'rbpg%')")
  left=${left//$'\r'/}
  [ "$left" = 0 ] || rb_die "données de test restantes : $left ligne(s) (Vitest rc=$vrc)"
  [ "$vrc" -eq 0 ] || rb_die "Vitest a échoué (rc=$vrc) ; base nettoyée"
  echo "  tests réussis ; aucune donnée de test restante"
}

# ── Cleanup (always available, retried from N1) ────────────────────────────

step_N1() {
  local st n
  if [ ! -e "$RB" ]; then echo "  $RB absent : rien à arrêter"; return 0; fi
  node -e 'const s = require("fs").lstatSync(process.argv[1]); process.exit(s.isDirectory() && !s.isSymbolicLink() ? 0 : 1)' "$RB" \
    || rb_die "$RB n'est pas un dossier ordinaire : examen manuel, rien n'est touché"
  if [ ! -f "$RB/.rb-pgtest-marker" ]; then
    [ -z "$(ls -A "$RB")" ] || rb_die "contenu sans marqueur : examen manuel, rien n'est touché"
    echo "  dossier vide : aucun serveur possible"
    return 0
  fi
  rb_marker_nonce >/dev/null
  n=$(rb_sandbox_processes)
  if [ -x "$PGBIN/pg_ctl.exe" ] && [ -d "$PGD" ] && [ "$n" != 0 ]; then
    st=0; "$PGBIN/pg_ctl.exe" -D "$PGD" status >/dev/null || st=$?
    case "$st" in
      0) "$PGBIN/pg_ctl.exe" -D "$PGD" -m fast -w -t 60 stop ;;
      3|4) echo "  pg_ctl : aucun serveur en marche" ;;
      *) echo "  pg_ctl status : code $st ; contrôle par les processus et le port" ;;
    esac
  fi
  rb_server_down
  if [ -e "$PGD/postmaster.pid" ]; then echo "  postmaster.pid périmé (ni processus ni port) : accepté"; fi
  echo "  aucun serveur du bac à sable actif"
}

step_N2a() {
  local tok
  tok=$(rb_assess)
  echo "  inventaire conforme. Pour supprimer : taper  RB_CONFIRM=$tok  puis  rb_run N2b"
}

step_N2b() {
  local tok rest
  tok=$(rb_assess 2>/dev/null)
  [ "$tok" = "${RB_CONFIRM:-}" ] || rb_die "le contenu a changé depuis N2a, ou RB_CONFIRM ne correspond pas : reprendre à N1"
  if [ "$tok" = ABSENT ]; then echo "  $RB déjà absent"; return 0; fi
  [[ "$RB" =~ ^[A-Za-z]:/rb-pgtest$ ]] || rb_die "racine inattendue : $RB"
  # Fixed names under the sandbox only; the justifying lists go last, the marker after everything.
  rm -rf -- "$RB/data"
  rm -rf -- "$RB/pgsql"
  rm -rf -- "$RB/work"
  rm -f -- "$RB/pw_admin.txt" "$RB/pw.txt" "$RB/pgpass.conf" "$RB/pg.log" "$RB/choice.txt" "$RB/lib.sh"
  rm -rf -- "$RB/dl"
  rest=$(ls -A "$RB")
  if [ "$tok" = VIDE ]; then
    [ -z "$rest" ] || rb_die "reste inattendu : $rest"
  else
    [ "$rest" = .rb-pgtest-marker ] || rb_die "reste inattendu : $rest"
    rm -f -- "$RB/.rb-pgtest-marker"
  fi
  rmdir -- "$RB"
  [ ! -e "$RB" ] || rb_die "$RB encore présent"
  echo "  $RB supprimé"
}
