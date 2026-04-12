#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(dirname -- "$SCRIPT_DIR")

export APP_BASE_URL="${APP_BASE_URL:-/}"

cd "$REPO_ROOT"
exec npm run dev
