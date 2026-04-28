#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_SERVER_PORT="${SERVER_PORT:-}"
ENV_PORT="${PORT:-}"
ENV_VITE_PORT="${VITE_PORT:-}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -n "$ENV_SERVER_PORT" ]]; then
  SERVER_PORT="$ENV_SERVER_PORT"
elif [[ -n "${SERVER_PORT:-}" ]]; then
  SERVER_PORT="$SERVER_PORT"
elif [[ -n "$ENV_PORT" ]]; then
  SERVER_PORT="$ENV_PORT"
elif [[ -n "${PORT:-}" ]]; then
  SERVER_PORT="$PORT"
else
  SERVER_PORT="3001"
fi

if [[ -n "$ENV_VITE_PORT" ]]; then
  VITE_PORT="$ENV_VITE_PORT"
elif [[ -n "${VITE_PORT:-}" ]]; then
  VITE_PORT="$VITE_PORT"
else
  VITE_PORT="5173"
fi

export SERVER_PORT
export VITE_PORT

LOG_DIR="${DEV_LOG_DIR:-$ROOT_DIR/logs}"
RUN_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${DEV_LOG_FILE:-$LOG_DIR/dev-restart-$RUN_TIMESTAMP.log}"
LATEST_LOG="$LOG_DIR/dev-restart-latest.log"

mkdir -p "$LOG_DIR"
: > "$LOG_FILE"
rm -f "$LATEST_LOG"
: > "$LATEST_LOG"
if [[ "$LOG_FILE" == "$LATEST_LOG" ]]; then
  exec > >(tee -a "$LOG_FILE") 2>&1
else
  exec > >(tee -a "$LOG_FILE" "$LATEST_LOG") 2>&1
fi

echo "[dev-restart] Logging to $LOG_FILE"
echo "[dev-restart] Latest log file: $LATEST_LOG"

is_valid_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] && ((port > 0 && port < 65536))
}

kill_port() {
  local port="$1"
  local label="$2"

  if ! is_valid_port "$port"; then
    echo "[dev-restart] Skip invalid $label port: $port"
    return
  fi

  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    echo "[dev-restart] No process listening on $label port $port"
    return
  fi

  echo "[dev-restart] Stopping process(es) on $label port $port: $pids"
  kill $pids 2>/dev/null || true

  local remaining=""
  for _ in {1..20}; do
    remaining=""
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        remaining="$remaining $pid"
      fi
    done

    if [[ -z "$remaining" ]]; then
      echo "[dev-restart] Port $port is clear"
      return
    fi

    sleep 0.2
  done

  echo "[dev-restart] Force stopping process(es) on $label port $port:$remaining"
  kill -9 $remaining 2>/dev/null || true
}

kill_port "$SERVER_PORT" "server"
kill_port "$VITE_PORT" "vite"

for port in ${KILL_PORTS:-}; do
  kill_port "$port" "extra"
done

echo "[dev-restart] Starting dev server with SERVER_PORT=$SERVER_PORT VITE_PORT=$VITE_PORT"
exec npm run dev
