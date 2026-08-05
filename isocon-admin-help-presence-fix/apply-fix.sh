#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [[ $# -ge 1 && -n "${1:-}" ]]; then
  WEBSITE="$1"
elif [[ -n "${WEBSITE:-}" ]]; then
  WEBSITE="$WEBSITE"
elif [[ -f "$PWD/website/index.html" ]]; then
  WEBSITE="$PWD/website"
elif [[ -f "$ROOT/website/index.html" ]]; then
  WEBSITE="$ROOT/website"
else
  echo "Erro: não encontrei website/index.html."
  echo "Use: $0 \"$PWD/website\""
  exit 1
fi

WEBSITE="$(cd "$WEBSITE" && pwd)"

for file in \
  "$WEBSITE/index.html" \
  "$WEBSITE/assets/js/institutional-admin-presence-patch.js" \
  "$WEBSITE/assets/css/institutional-admin-presence-patch.css"
do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    echo "Este corretivo deve ser aplicado depois do patch institucional."
    exit 1
  }
done

STAMP="$(date +%Y%m%d-%H%M%S)"

cp "$WEBSITE/assets/js/institutional-admin-presence-patch.js" \
   "$WEBSITE/assets/js/institutional-admin-presence-patch.js.bak.$STAMP"

cp "$WEBSITE/assets/css/institutional-admin-presence-patch.css" \
   "$WEBSITE/assets/css/institutional-admin-presence-patch.css.bak.$STAMP"

cp "$PATCH_DIR/website/assets/js/institutional-admin-presence-patch.js" \
   "$WEBSITE/assets/js/institutional-admin-presence-patch.js"

cp "$PATCH_DIR/website/assets/css/institutional-admin-presence-patch.css" \
   "$WEBSITE/assets/css/institutional-admin-presence-patch.css"

TMP_MODULE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP_MODULE"' EXIT
cp "$WEBSITE/assets/js/institutional-admin-presence-patch.js" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Correção aplicada em:"
echo "  $WEBSITE"
echo
echo "Corrigido:"
echo "  - chat online imediatamente entre abas do mesmo navegador"
echo "  - polling remoto a cada 5 segundos"
echo "  - publicação do status no branch presence"
echo "  - endpoint correto para consultar referência Git"
echo "  - admin-help abre central de orientação"
echo
echo "Recarregue as abas com Ctrl+Shift+R."
