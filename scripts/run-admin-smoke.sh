#!/usr/bin/env bash
set -euo pipefail

WORKDIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3111}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="/tmp/prodes-admin-smoke-${PORT}.log"

cd "$WORKDIR"

if [ ! -f ".next/BUILD_ID" ]; then
  echo "[INFO] Build manquant, lancement de npm run build..."
  npm run build -- --webpack
fi

echo "[INFO] Start app on ${BASE_URL}"
node ./node_modules/next/dist/bin/next start -p "$PORT" >"$LOG_FILE" 2>&1 &
APP_PID=$!

cleanup() {
  kill "$APP_PID" >/dev/null 2>&1 || true
  wait "$APP_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

sleep 4
echo "[INFO] Run backoffice smoke on ${BASE_URL}"
BASE_URL="$BASE_URL" "$WORKDIR/scripts/smoke-admin-backoffice.sh"
echo "[INFO] Done. Server log: $LOG_FILE"
