#!/usr/bin/env bash
# Start the Next.js standalone server with production environment variables.

set -euo pipefail

ROOT="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

if [[ -f ".env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.production"
  set +a
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

exec node "$ROOT/.next/standalone/server.js"
