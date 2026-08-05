#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ROOT="$(cd "$ROOT" && pwd)"
TARGET="$ROOT/website/assets/js/utils.js"

if [[ ! -f "$TARGET" ]]; then
  echo "Erro: não encontrei:"
  echo "  $TARGET"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
cp "$TARGET" "$TARGET.bak.$STAMP"
cp "$PATCH_DIR/website/assets/js/utils.js" "$TARGET"

TMP_MODULE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP_MODULE"' EXIT
cp "$TARGET" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Correção aplicada:"
echo "  $TARGET"
echo
echo "Agora o salvamento:"
echo "  1. localiza website/data/catalog.json na árvore do branch main"
echo "  2. obtém o SHA atual do blob"
echo "  3. envia o SHA no PUT"
echo "  4. repete uma vez quando houver conflito ou SHA desatualizado"
echo
echo "Publique:"
echo "  git add website/assets/js/utils.js"
echo '  git commit -m "fix: resolve sha atual antes de salvar catálogo"'
echo "  git push origin main"
