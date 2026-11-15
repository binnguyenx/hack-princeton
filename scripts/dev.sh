#!/usr/bin/env bash
# Start FastAPI + Vite for local development.
# Usage (from repo root): ./scripts/dev.sh
# Or: cd app && npm run dev:stack
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STORAGE_ROOT="${HACK_STORAGE_ROOT:-$ROOT/data/storage}"
API_HOST="${HACK_API_HOST:-127.0.0.1}"
API_PORT="${HACK_API_PORT:-8000}"
PYTHON="${ROOT}/.venv/bin/python"
API_PID=""
VITE_PID=""

die() {
  echo "error: $*" >&2
  exit 1
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "killing listeners on :$port -> $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.4
  fi
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit "$code"
}

trap cleanup EXIT INT TERM

[[ -x "$PYTHON" ]] || die "missing $PYTHON — run: /opt/homebrew/bin/python3 -m venv .venv && .venv/bin/python -m pip install -e 'backend/ai[test]'"
[[ -d "$STORAGE_ROOT" ]] || die "storage root missing: $STORAGE_ROOT"
py_ok="$("$PYTHON" -c 'import sys; print(int(sys.version_info >= (3, 11)))' 2>/dev/null || echo 0)"
[[ "$py_ok" == "1" ]] || die ".venv Python must be >=3.11 (got $($PYTHON -V 2>&1)). Recreate with: rm -rf .venv && /opt/homebrew/bin/python3 -m venv .venv && .venv/bin/python -m pip install -e 'backend/ai[test]'"
"$PYTHON" -c "import fastapi" 2>/dev/null || die "FastAPI not installed in .venv — run: .venv/bin/python -m pip install -e 'backend/ai[test]'"

free_port "$API_PORT"
free_port 5173
free_port 5174
free_port 5175

export PYTHONPATH="${ROOT}/backend/ai/src${PYTHONPATH:+:$PYTHONPATH}"

echo "starting FastAPI on http://${API_HOST}:${API_PORT} (storage: $STORAGE_ROOT)"
"$PYTHON" -B -m skullfix_ai.api \
  --storage-root "$STORAGE_ROOT" \
  --host "$API_HOST" \
  --port "$API_PORT" &
API_PID=$!

ready=0
for _ in $(seq 1 40); do
  if curl -sf "http://${API_HOST}:${API_PORT}/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    die "FastAPI exited before becoming healthy"
  fi
  sleep 0.25
done
[[ "$ready" -eq 1 ]] || die "FastAPI did not become healthy on :${API_PORT}"

echo "starting Vite (proxies /api -> http://${API_HOST}:${API_PORT})"
(
  cd "$ROOT/app"
  export HACK_API_ORIGIN="http://${API_HOST}:${API_PORT}"
  npm run dev
) &
VITE_PID=$!

wait "$VITE_PID"
