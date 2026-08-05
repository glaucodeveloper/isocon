#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
INTERACTION="$WEBSITE/assets/js/interaction-patch.js"

for file in "$WEBSITE/index.html" "$INTERACTION"; do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    exit 1
  }
done

mkdir -p "$WEBSITE/assets/js" "$WEBSITE/assets/css"

cp "$PATCH_DIR/website/assets/js/asset-url-fallback-patch.js" \
   "$WEBSITE/assets/js/asset-url-fallback-patch.js"

cp "$PATCH_DIR/website/assets/css/asset-url-fallback-patch.css" \
   "$WEBSITE/assets/css/asset-url-fallback-patch.css"

python3 - "$WEBSITE/index.html" "$INTERACTION" <<'PY'
from pathlib import Path
import sys

index_path = Path(sys.argv[1])
interaction_path = Path(sys.argv[2])

source = interaction_path.read_text(encoding="utf-8")
import_line = 'await import("./asset-url-fallback-patch.js");'
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

interaction_path.write_text(source, encoding="utf-8")

html = index_path.read_text(encoding="utf-8")
css_tag = (
    '<link href="./assets/css/asset-url-fallback-patch.css" '
    'rel="stylesheet">'
)

if css_tag not in html:
    anchors = [
        '<link href="./assets/css/product-media-repo-patch.css" rel="stylesheet">',
        '<link href="./assets/css/brand-logo-patch.css" rel="stylesheet">',
        '<link href="./assets/css/institutional-admin-presence-patch.css" rel="stylesheet">',
        '<link href="./assets/css/app.css" rel="stylesheet">',
    ]

    for anchor in anchors:
        if anchor in html:
            html = html.replace(anchor, anchor + css_tag, 1)
            break
    else:
        html = html.replace("</head>", f"  {css_tag}\n</head>", 1)

index_path.write_text(html, encoding="utf-8")
PY

TMP_MODULE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP_MODULE"' EXIT

cp "$WEBSITE/assets/js/asset-url-fallback-patch.js" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Correção instalada em:"
echo "  $WEBSITE"
echo
echo "A imagem será tentada nesta ordem:"
echo "  1. raiz real da aplicação, calculada por import.meta.url"
echo "  2. arquivo bruto do branch main"
echo
echo "Publique:"
echo "  git add -A"
echo '  git commit -m "fix: resolve caminhos de mídia e adiciona fallback bruto"'
echo "  git push origin main"
