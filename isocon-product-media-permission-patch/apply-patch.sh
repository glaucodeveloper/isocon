#!/usr/bin/env bash
set -euo pipefail

PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"

for file in \
  "$WEBSITE/index.html" \
  "$WEBSITE/assets/js/components.js" \
  "$WEBSITE/assets/js/interaction-patch.js"
do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    exit 1
  }
done

mkdir -p "$WEBSITE/assets/js" "$WEBSITE/assets/css"

cp "$PATCH_DIR/website/assets/js/product-media-repo-patch.js" \
   "$WEBSITE/assets/js/product-media-repo-patch.js"

cp "$PATCH_DIR/website/assets/css/product-media-repo-patch.css" \
   "$WEBSITE/assets/css/product-media-repo-patch.css"

python3 - "$WEBSITE" <<'PY'
from pathlib import Path
import re
import sys

website = Path(sys.argv[1])
components = website / "assets/js/components.js"
interaction = website / "assets/js/interaction-patch.js"
index = website / "index.html"

# Remove o link público da área administrativa.
source = components.read_text(encoding="utf-8")
source, count = re.subn(
    r'\s*<a\s+href="#/admin"[^>]*>.*?Área administrativa\s*</a>',
    "",
    source,
    flags=re.I | re.S,
)
components.write_text(source, encoding="utf-8")
print(f"Links administrativos removidos da navbar: {count}")

# Carrega o patch depois das classes administrativas e antes do app raiz.
source = interaction.read_text(encoding="utf-8")
import_line = 'await import("./product-media-repo-patch.js");'
app_line = 'await import("./app.js");'

if import_line not in source:
    if app_line not in source:
        raise SystemExit('Não encontrei await import("./app.js") em interaction-patch.js.')
    source = source.replace(app_line, import_line + "\n" + app_line, 1)

interaction.write_text(source, encoding="utf-8")

# CSS complementar.
html = index.read_text(encoding="utf-8")
css_tag = '<link href="./assets/css/product-media-repo-patch.css" rel="stylesheet">'

if css_tag not in html:
    anchors = [
        '<link href="./assets/css/brand-logo-patch.css" rel="stylesheet">',
        '<link href="./assets/css/institutional-admin-presence-patch.css" rel="stylesheet">',
        '<link href="./assets/css/interaction-patch.css" rel="stylesheet">',
        '<link href="./assets/css/app.css" rel="stylesheet">',
    ]

    for anchor in anchors:
        if anchor in html:
            html = html.replace(anchor, anchor + css_tag, 1)
            break
    else:
        html = html.replace("</head>", f"  {css_tag}\n</head>", 1)

index.write_text(html, encoding="utf-8")
PY

TMP_MODULE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP_MODULE"' EXIT
cp "$WEBSITE/assets/js/product-media-repo-patch.js" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Patch aplicado em:"
echo "  $WEBSITE"
echo
echo "Corrigido:"
echo "  - link administrativo removido da navbar pública"
echo "  - arquivos mantidos como File/Blob em IndexedDB"
echo "  - pré-visualização preservada entre etapas e renderizações"
echo "  - arquivos enviados ao repositório no salvamento final"
echo "  - erro 403 convertido em orientação de permissão"
echo
echo "Publique:"
echo "  git add -A"
echo '  git commit -m "fix: preserva mídia do produto e remove acesso administrativo público"'
echo "  git push origin main"
