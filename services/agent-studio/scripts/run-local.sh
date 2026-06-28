#!/usr/bin/env zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
APP_DIR="${AGENT_STUDIO_APP_DIR:-${SCRIPT_DIR:h}}"
NODE_HOME="/Users/leoyuan/.nvm/versions/node/v24.15.0"
PNPM_BIN="$NODE_HOME/bin/pnpm"

cd "$APP_DIR"

export PATH="$NODE_HOME/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export BFF_HOST="${BFF_HOST:-127.0.0.1}"
export HOST="$BFF_HOST"
export PORT="${PORT:-48787}"
export FRONTEND_PORT="${FRONTEND_PORT:-45173}"
export FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-http://127.0.0.1:${FRONTEND_PORT}}"
export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://127.0.0.1:${PORT}}"
export STATIC_ROOT="${STATIC_ROOT:-dist}"
export SERVE_STATIC="${SERVE_STATIC:-true}"

if [[ "${AGENT_STUDIO_SKIP_BUILD:-0}" != "1" ]]; then
  "$PNPM_BIN" run build
fi

exec "$PNPM_BIN" run local:start
