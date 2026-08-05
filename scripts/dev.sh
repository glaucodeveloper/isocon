#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$(dirname "$SCRIPT_DIR")")" == "website" ]]; then
  SITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
else
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/.." && pwd)"
  SITE_DIR="$ROOT/website"
fi
PORT="${PORT:-8080}"
echo "ISOCON: http://127.0.0.1:$PORT/"
echo "Admin:  http://127.0.0.1:$PORT/#/admin"
cd "$SITE_DIR"
python3 -m http.server "$PORT"
