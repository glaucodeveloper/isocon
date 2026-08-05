#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
INTERACTION="$WEBSITE/assets/js/interaction-patch.js"
INDEX="$WEBSITE/index.html"
TARGET_JS="$WEBSITE/assets/js/sidebar-implementation-section-patch.js"
TARGET_CSS="$WEBSITE/assets/css/sidebar-implementation-section-patch.css"

for file in "$INTERACTION" "$INDEX"; do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    exit 1
  }
done

mkdir -p "$WEBSITE/assets/js" "$WEBSITE/assets/css"

python3 - \
  "$INTERACTION" \
  "$PATCH_DIR/templates/sidebar-preparation-section.js.in" \
  "$TARGET_JS" <<'PY'
from pathlib import Path
import json
import re
import sys

interaction_path = Path(sys.argv[1])
template_path = Path(sys.argv[2])
target_path = Path(sys.argv[3])

source = interaction_path.read_text(encoding="utf-8")

# As páginas de implementação são registradas como chaves do objeto MODULES.
routes = re.findall(
    r'^\s*"(/admin/[^"]+)"\s*:\s*\{',
    source,
    flags=re.MULTILINE,
)

# Remove duplicações preservando a ordem.
routes = list(dict.fromkeys(routes))

fallback = [
    "/admin/pedidos",
    "/admin/clientes",
    "/admin/fornecedores",
    "/admin/cotacoes",
    "/admin/financeiro",
    "/admin/relatorios",
    "/admin/categorias",
    "/admin/marcas",
    "/admin/unidades",
    "/admin/atributos",
    "/admin/logs",
]

if not routes:
    routes = fallback

template = template_path.read_text(encoding="utf-8")
generated = template.replace(
    "__PREPARATION_ROUTES__",
    json.dumps(routes, ensure_ascii=False, indent=2),
)

target_path.write_text(generated, encoding="utf-8")

print("Rotas agrupadas em EM PREPARAÇÃO:")
for route in routes:
    print(f"  {route}")
PY

cp "$PATCH_DIR/website/assets/css/sidebar-preparation-section.css" \
   "$TARGET_CSS"

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

cp "$TARGET_JS" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Correção aplicada."
echo
echo "A sidebar agora mantém:"
echo "  MENU PRINCIPAL  → módulos funcionais"
echo "  CATÁLOGO        → módulos funcionais"
echo "  EM PREPARAÇÃO   → páginas planejadas"
echo "  CONFIGURAÇÕES   → configuração administrativa"
echo
echo "Recarregue com Ctrl+Shift+R."
