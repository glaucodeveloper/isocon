#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(basename "$SCRIPT_DIR")" == "scripts" && "$(basename "$(dirname "$SCRIPT_DIR")")" == "website" ]]; then
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || cd "$SCRIPT_DIR/.." && pwd)"
fi

cd "$ROOT"
MESSAGE="${1:-chore: atualiza website ISOCON}"

python3 -m json.tool website/data/catalog.json >/dev/null
for file in website/assets/js/*.js; do node --check "$file"; done

git add website .github/workflows/pages.yml README.md
if git diff --cached --quiet; then
  echo "Nenhuma alteração para publicar."
  exit 0
fi

git commit -m "$MESSAGE"
git push origin main
echo "Push concluído. O workflow de GitHub Pages iniciará o deploy."
