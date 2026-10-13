# Local PostgreSQL sandbox — launcher. Load it in an ordinary (non-admin)
# Git Bash, from anywhere:   source <repo>/frontend/scripts/pg-sandbox/rb-pgtest.sh
# then run the steps one by one:   rb_run P1   (see README.md).
#
# Each step runs in a child shell with an emptied environment (env -i + an
# allow-list without any secret), `set -Eeuo pipefail` and `inherit_errexit`.
# The launcher refuses a step that does not follow the previous one, locks
# preparation, migrations and tests after any failure, and asks for a typed
# authorization before the network (download), the install/server steps,
# the migrations and the tests. Cleanup (N1 → N2a → N2b) is never locked:
# a failed cleanup step is retried from N1.

RB_TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)" || return 1
RB_LAST_OK=""; RB_FAILED=""; RB_CLEANUP_STARTED=""
RB_ALLOW_DOWNLOAD=""; RB_ALLOW_INSTALL=""; RB_ALLOW_MIGRATION=""; RB_ALLOW_TESTS=""
RB_CONFIRM=""; RB_NEON_MAJOR="${RB_NEON_MAJOR:-}"; RB_SIGNATURE_POLICY="${RB_SIGNATURE_POLICY:-standard}"

rb_prev() {
  case "$1" in
    P1|N1) echo - ;; P2) echo P1 ;; P3) echo P2 ;; P4a) echo P3 ;; P4b) echo P4a ;; P5a) echo P4b ;; P5b) echo P5a ;;
    P6) echo P5b ;; P7) echo P6 ;; P8) echo P7 ;; P9) echo P8 ;; P10) echo P9 ;; P11) echo P10 ;;
    M1) echo P11 ;; M2) echo M1 ;; M3) echo M2 ;; M4) echo M3 ;; M5) echo M4 ;; T1) echo M5 ;;
    N2a) echo N1 ;; N2b) echo N2a ;;
    *) return 1 ;;
  esac
}

rb_run() {
  local step="${1:-}" prev rc
  prev=$(rb_prev "$step") || { echo "REFUS $step : étape inconnue" >&2; return 1; }
  case "$step" in
    N*) ;;
    *) if [ -n "$RB_CLEANUP_STARTED" ]; then echo "REFUS $step : nettoyage commencé, préparation, migration et tests fermés" >&2; return 1; fi
       if [ -n "$RB_FAILED" ]; then echo "REFUS $step : l'étape $RB_FAILED a échoué, protocole verrouillé" >&2; return 1; fi ;;
  esac
  case "$step" in
    P4a|P4b) if [ "$RB_ALLOW_DOWNLOAD" != oui ]; then echo "REFUS $step : RB_ALLOW_DOWNLOAD=oui requis (accès réseau à EDB)" >&2; return 1; fi ;;
    P5b|P6|P7|P8|P9|P10|P11) if [ "$RB_ALLOW_INSTALL" != oui ]; then echo "REFUS $step : RB_ALLOW_INSTALL=oui requis (extraction, exécution, serveur, base)" >&2; return 1; fi ;;
    M*) if [ "$RB_ALLOW_MIGRATION" != oui ]; then echo "REFUS $step : RB_ALLOW_MIGRATION=oui requis" >&2; return 1; fi ;;
    T*) if [ "$RB_ALLOW_TESTS" != oui ]; then echo "REFUS $step : RB_ALLOW_TESTS=oui requis" >&2; return 1; fi ;;
    N2b) if ! [[ "$RB_CONFIRM" =~ ^([0-9a-f]{64}|VIDE|ABSENT)$ ]]; then echo "REFUS $step : RB_CONFIRM doit reprendre l'empreinte affichée par N2a" >&2; return 1; fi ;;
  esac
  if [ "$prev" != "-" ] && [ "$RB_LAST_OK" != "$prev" ]; then
    case "$step" in N*) ;; *) RB_FAILED="$step(ordre)" ;; esac
    echo "REFUS $step : doit suivre immédiatement $prev (dernière réussie : ${RB_LAST_OK:-aucune})" >&2; return 1
  fi
  case "$step" in N*) RB_CLEANUP_STARTED=1 ;; esac
  rb_exec "$step"; rc=$?
  if [ "$step" = N2b ]; then RB_CONFIRM=""; fi
  if [ "$rc" -eq 0 ]; then RB_LAST_OK="$step"; echo "ÉTAPE $step : OK"
  else
    RB_LAST_OK=""
    case "$step" in
      N*) echo "ÉTAPE $step : ÉCHEC (rc=$rc) ; corriger la cause puis reprendre à N1" >&2 ;;
      *)  RB_FAILED="$step"; echo "ÉTAPE $step : ÉCHEC (rc=$rc) ; protocole verrouillé, nettoyage possible par N1" >&2 ;;
    esac
  fi
  return "$rc"
}

# The child sees no variable of this terminal but these — none of them a secret.
rb_exec() {
  env -i PATH="/usr/bin:/c/Windows/System32:/c/Windows/System32/WindowsPowerShell/v1.0:/c/Program Files/nodejs" \
      SYSTEMROOT="$SYSTEMROOT" SYSTEMDRIVE="$SYSTEMDRIVE" WINDIR="$WINDIR" TEMP="$TEMP" TMP="$TMP" \
      USERPROFILE="$USERPROFILE" LOCALAPPDATA="$LOCALAPPDATA" \
      RB_TOOLS="$RB_TOOLS" RB_CONFIRM="$RB_CONFIRM" RB_NEON_MAJOR="$RB_NEON_MAJOR" \
      RB_SIGNATURE_POLICY="$RB_SIGNATURE_POLICY" \
      /usr/bin/bash --noprofile --norc "$RB_TOOLS/step.sh" "$1" </dev/null
}

# Step V — the Neon project's Postgres major version, from Neon's console API
# (never the database). Asks for an API key without echoing it; the key only
# lives in this function's child process. Sets RB_NEON_MAJOR, or leaves it empty.
rb_neon_version() {
  local key out
  read -rs -p "Clé d'API Neon (saisie masquée) : " key; echo
  out=$(RB_NEON_KEY="$key" RB_NEON_ORG="${RB_NEON_ORG:-}" node "$RB_TOOLS/neon-version.mjs" "${RB_TOOLS%/scripts/pg-sandbox}/.env") || out=""
  key=""
  if [[ "$out" =~ ^1[4-8]$ ]]; then RB_NEON_MAJOR="$out"; echo "RB_NEON_MAJOR=$RB_NEON_MAJOR (lu dans l'API Neon)"
  else RB_NEON_MAJOR=""; echo "ÉCHEC : version non établie, rien n'est choisi" >&2; return 1; fi
}

rb_pgtest_unload() {
  unset -f rb_prev rb_run rb_exec rb_neon_version rb_pgtest_unload
  unset RB_TOOLS RB_LAST_OK RB_FAILED RB_CLEANUP_STARTED RB_ALLOW_DOWNLOAD RB_ALLOW_INSTALL \
        RB_ALLOW_MIGRATION RB_ALLOW_TESTS RB_CONFIRM RB_NEON_MAJOR RB_SIGNATURE_POLICY RB_NEON_ORG
}
