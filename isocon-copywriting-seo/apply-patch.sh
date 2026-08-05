#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
INTERACTION="$WEBSITE/assets/js/interaction-patch.js"
INDEX="$WEBSITE/index.html"
CATALOG="$WEBSITE/data/catalog.json"
WORKFLOW="$ROOT/.github/workflows/pages.yml"

for file in "$INTERACTION" "$INDEX" "$CATALOG" "$WORKFLOW"; do
  [[ -f "$file" ]] || {
    echo "Erro: arquivo não encontrado: $file"
    exit 1
  }
done

mkdir -p "$WEBSITE/assets/js" "$WEBSITE/assets/css" "$ROOT/scripts"

cp "$PATCH_DIR/website/assets/js/copywriting-seo-patch.js" \
   "$WEBSITE/assets/js/copywriting-seo-patch.js"

cp "$PATCH_DIR/website/assets/css/copywriting-seo-patch.css" \
   "$WEBSITE/assets/css/copywriting-seo-patch.css"

cp "$PATCH_DIR/scripts/build-seo.py" \
   "$ROOT/scripts/build-seo.py"

chmod +x "$ROOT/scripts/build-seo.py"

python3 - "$ROOT" <<'PY'
from pathlib import Path
import hashlib
import json
import re
import sys
import unicodedata

root = Path(sys.argv[1])
website = root / "website"
catalog_path = website / "data" / "catalog.json"
interaction_path = website / "assets" / "js" / "interaction-patch.js"
index_path = website / "index.html"
workflow_path = root / ".github" / "workflows" / "pages.yml"

def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()

def fnv1a(value: str) -> str:
    hash_value = 0x811C9DC5
    for byte in normalize(value).encode("utf-8"):
        hash_value ^= byte
        hash_value = (hash_value * 0x01000193) & 0xFFFFFFFF
    return f"{hash_value:08x}"

def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFD", normalize(value))
    normalized = "".join(
        character for character in normalized
        if unicodedata.category(character) != "Mn"
    ).lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")[:52]
    return f"{normalized or 'texto'}-{fnv1a(value)}"

def probable_visible_text(value: str) -> bool:
    value = normalize(value)

    if len(value) < 3 or len(value) > 280:
        return False

    excluded = (
        "${", "bi-", "./", "#/", "data-", "class=", "href=", "name=",
        "application/", "github", "contents api", "sessionstorage",
    )
    if any(token in value.lower() for token in excluded):
        return False

    if re.fullmatch(r"[\w.-]+", value) and " " not in value:
        return False

    return bool(re.search(r"[A-Za-zÀ-ÿ]", value))

texts = set()

for filename in ("pages.js", "components.js"):
    source = (website / "assets" / "js" / filename).read_text(encoding="utf-8")

    # Texto entre tags em templates HTML.
    for match in re.finditer(r">([^<>]+)<", source):
        candidate = re.sub(r"\$\{.*?\}", "", match.group(1), flags=re.S)
        if probable_visible_text(candidate):
            texts.add(normalize(candidate))

    # Literais usados em títulos, descrições, benefícios e botões.
    for match in re.finditer(
        r'(?:"([^"\n]{3,280})"|\'([^\'\n]{3,280})\')',
        source,
    ):
        candidate = match.group(1) or match.group(2) or ""
        if probable_visible_text(candidate):
            texts.add(normalize(candidate))

catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
copywriting = catalog.setdefault("copywriting", {})
copywriting.setdefault("seo", {
    "title": "ISOCON | Soluções empresariais e logística nacional",
    "description": (
        "Catálogo B2B de produtos, equipamentos e suprimentos para empresas, "
        "com atendimento comercial e logística em todo o Brasil."
    ),
    "canonical": "https://isoconvca.com.br/",
    "socialTitle": "ISOCON | Soluções empresariais e logística nacional",
    "socialDescription": (
        "Soluções empresariais, atendimento comercial e logística nacional."
    ),
    "socialImage": "https://isoconvca.com.br/assets/images/hero-home.png",
})
labels = copywriting.setdefault("labels", {})
values = copywriting.setdefault("texts", {})

for text in sorted(texts):
    key = slug(text)
    labels.setdefault(key, text)
    values.setdefault(key, text)

catalog_path.write_text(
    json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

# Importa o patch depois dos demais patches administrativos e antes do app.
interaction = interaction_path.read_text(encoding="utf-8")
import_line = 'await import("./copywriting-seo-patch.js");'
app_line = 'await import("./app.js");'

if import_line not in interaction:
    if app_line not in interaction:
        raise SystemExit(
            'Não encontrei await import("./app.js") em interaction-patch.js.'
        )
    interaction = interaction.replace(
        app_line,
        import_line + "\n" + app_line,
        1,
    )

interaction_path.write_text(interaction, encoding="utf-8")

# CSS do editor.
html = index_path.read_text(encoding="utf-8")
css_tag = '<link href="./assets/css/copywriting-seo-patch.css" rel="stylesheet">'

if css_tag not in html:
    anchors = [
        '<link href="./assets/css/sidebar-implementation-section-patch.css" rel="stylesheet">',
        '<link href="./assets/css/asset-url-fallback-patch.css" rel="stylesheet">',
        '<link href="./assets/css/app.css" rel="stylesheet">',
    ]

    for anchor in anchors:
        if anchor in html:
            html = html.replace(anchor, anchor + css_tag, 1)
            break
    else:
        html = html.replace("</head>", f"  {css_tag}\n</head>", 1)

index_path.write_text(html, encoding="utf-8")

# Geração estática de SEO antes de empacotar o Pages.
workflow = workflow_path.read_text(encoding="utf-8")
seo_step = """      - name: Gerar SEO estático
        run: python3 scripts/build-seo.py

"""

if "python3 scripts/build-seo.py" not in workflow:
    marker = "      - name: Configurar GitHub Pages\n"
    if marker not in workflow:
        raise SystemExit(
            "Não encontrei o passo Configurar GitHub Pages no workflow."
        )
    workflow = workflow.replace(marker, seo_step + marker, 1)

workflow_path.write_text(workflow, encoding="utf-8")

print(f"Textos estruturais registrados: {len(labels)}")
PY

python3 "$ROOT/scripts/build-seo.py"
python3 -m json.tool "$CATALOG" >/dev/null
python3 -m py_compile "$ROOT/scripts/build-seo.py"

TMP_MODULE="$(mktemp --suffix=.mjs)"
trap 'rm -f "$TMP_MODULE"' EXIT
cp "$WEBSITE/assets/js/copywriting-seo-patch.js" "$TMP_MODULE"
node --check "$TMP_MODULE"

echo
echo "Copywriting e SEO instalados."
echo
echo "Nova área:"
echo "  #/admin/copywriting"
echo
echo "A publicação agora gera:"
echo "  - metadados Open Graph"
echo "  - Twitter Card"
echo "  - canonical"
echo "  - JSON-LD"
echo "  - robots.txt"
echo "  - sitemap.xml"
