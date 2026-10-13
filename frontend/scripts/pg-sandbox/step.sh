# Runs ONE step of the local PostgreSQL sandbox, in the clean child shell
# rb_run starts: `bash --noprofile --norc step.sh <STEP>` under env -i.
set -Eeuo pipefail
shopt -s inherit_errexit
[[ "${RB_TOOLS:-}" =~ ^[A-Za-z]:/ ]] || { echo "STOP: RB_TOOLS absent" >&2; exit 1; }
# shellcheck source=lib.sh
source "$RB_TOOLS/lib.sh"
case "${1:-}" in
  P1|P2|P3|P4a|P4b|P5a|P5b|P6|P7|P8|P9|P10|P11|M1|M2|M3|M4|M5|T1|N1|N2a|N2b) "step_$1" ;;
  *) rb_die "étape inconnue : ${1:-}" ;;
esac
