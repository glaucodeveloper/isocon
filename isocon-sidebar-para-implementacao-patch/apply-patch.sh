#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
INTERACTION="$WEBSITE/assets/js/interaction-patch.js"
INDEX="$WEBSITE/index.html"

for file in "$INTERACTION" "$INDEX"; do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    exit 1
  }
done

mkdir -p "$WEBSITE/assets/js" "$WEBSITE/assets/css"

cp "$PATCH_DIR/website/assets/js/sidebar-implementation-section-patch.js" \
   "$WEBSITE/assets/js/sidebar-implementation-section-patch.js"

cp "$PATCH_DIR/website/assets/css/sidebar-implementation-section-patch.css" \
   "$WEBSITE/assets/css/sidebar-implementation-section-patch.css"

python3 - "$INTERACTION" "$INDEX" <<'PY'
from pathlib import Path
import sys

interaction = Path(sys.argv[1])
index = Path(sys.argv[2])

source = interaction.read_text(encoding="utf-8")
import_line = 'await import("./sidebar-implementation-section-patch.js");'
app_line = 'await import("./app.js");'

if import_line not in source:
    if app_line not in source:
        raise SystemExit(
            'Não encontrei await import("./app.js") em interaction-patch.js.'
        )

    source = source.replace(
        app_line,
        import_line + "\n" + app_line,
        1,
    )

interaction.write_text(source, encoding="utf-8")

html = index.read_text(encoding="utf-8")
css_tag = (
    '<link href="./assets/css/sidebar-implementation-section-patch.css" '
    'rel="stylesheet">'
)

if css_tag not in html:
    anchors = [
        '<link href="./assets/css/asset-url-fallback-patch.css" rel="stylesheet">',
        '<link href="./assets/css/product-media-repo-patch.css" rel="stylesheet">',
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

cp "$WEBSITE/assets/js/sidebar-implementation-section-patch.js" \
   "$TMP_MODULE"

node --check "$TMP_MODULE"

echo
echo "Seção criada na sidebar:"
echo "  PARA IMPLEMENTAÇÃO"
echo
echo "Foram agrupadas automaticamente todas as opções cujo texto contém:"
echo "  em preparação"
echo
echo "Publique:"
echo "  git add -A"
echo '  git commit -m "style: agrupa módulos pendentes para implementação"'
echo "  git push origin main"
