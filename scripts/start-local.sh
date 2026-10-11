#!/usr/bin/env bash
# Start the local Wagr stack as systemd user units: relayer (:8787, attester 1 +
# auto-resolver), attester 2 (:8788) and the Vite dev server (:5173).
set -euo pipefail
cd "$(dirname "$0")/.."
NODE_BIN=/home/jayne/.nvm/versions/node/v22.23.2/bin
set -a; source .env; set +a
ENVARGS=$(grep -oE '^[A-Z_][A-Z0-9_]*=' .env | tr -d = | sed 's/^/--setenv=/' | tr '\n' ' ')
systemctl --user stop wagr-relayer wagr-attester2 wagr-web 2>/dev/null || true
systemctl --user reset-failed wagr-relayer wagr-attester2 wagr-web 2>/dev/null || true
npm run build -w @wagr/shared >/dev/null && npm run build -w @wagr/relayer >/dev/null
# shellcheck disable=SC2086
systemd-run --user --unit=wagr-attester2 -p Restart=always -p RestartSec=3 --working-directory="$PWD" $ENVARGS \
  --setenv=RELAYER_PORT=8788 --setenv=WAGR_ATTESTER_PRIVATE_KEY="$WAGR_ATTESTER_2_PRIVATE_KEY" --setenv=WAGR_AUTO_RESOLVE=false \
  --setenv=RELAYER_DATA_FILE=.wagr-attester2-data.json "$NODE_BIN/node" relayer/dist/index.js
# shellcheck disable=SC2086
systemd-run --user --unit=wagr-relayer -p Restart=always -p RestartSec=3 --working-directory="$PWD" $ENVARGS \
  --setenv=RELAYER_PORT=8787 --setenv=WAGR_ATTESTER_PRIVATE_KEY="$WAGR_ATTESTER_1_PRIVATE_KEY" \
  --setenv=WAGR_ATTESTER_ENDPOINTS=http://localhost:8788 --setenv=WAGR_AUTO_RESOLVE_INTERVAL_MS=15000 "$NODE_BIN/node" relayer/dist/index.js
systemd-run --user --unit=wagr-web -p Restart=always -p RestartSec=2 --working-directory="$PWD/frontend" \
  --setenv=PATH="$NODE_BIN:/usr/bin:/bin" "$NODE_BIN/npx" vite --host 127.0.0.1 --port 5173
echo "Wagr up: http://localhost:5173 (relayer :8787)"
