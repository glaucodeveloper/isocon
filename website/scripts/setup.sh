#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "scripts" && "$(basename "$(dirname "$SCRIPT_DIR")")" == "website" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/.." && pwd)"
fi

cd "$ROOT"
REPO="${REPO:-https://github.com/glaucodeveloper/isocon.git}"
BRANCH="${BRANCH:-main}"

python3 -m json.tool website/data/catalog.json >/dev/null
for file in website/assets/js/*.js; do node --check "$file"; done

if [[ ! -d .git ]]; then
  git init
  git branch -M "$BRANCH"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REPO"
fi

git add website .github/workflows/pages.yml README.md
if ! git diff --cached --quiet; then
  git commit -m "feat: implementa website detalhado da ISOCON"
fi

git push -u origin "$BRANCH"

cat <<'EOF'
Publicação enviada.
No GitHub, abra Settings → Pages e selecione “GitHub Actions” como origem.
A rota administrativa será: #/admin
EOF
