#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOGO_NAME="${2:-logo 1.png}"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
LOGO_FILE="$WEBSITE/assets/images/$LOGO_NAME"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$WEBSITE/index.html" ]]; then
  echo "Erro: não encontrei:"
  echo "  $WEBSITE/index.html"
  echo
  echo "Use:"
  echo "  $0 "$HOME/dev/ISOCON/website-2" "logo 1.png""
  exit 1
fi

if [[ ! -f "$LOGO_FILE" ]]; then
  echo "Erro: não encontrei a imagem:"
  echo "  $LOGO_FILE"
  echo
  echo "Arquivos de logo disponíveis:"
  find "$WEBSITE/assets/images" -maxdepth 1 -type f \
    \( -iname '*logo*.png' -o -iname '*logo*.svg' -o -iname '*logo*.webp' \) \
    -printf '  %f\n' | sort || true
  exit 1
fi

mkdir -p "$WEBSITE/assets/css"

python3 - "$WEBSITE" "$LOGO_NAME" "$STAMP" <<'PY'
from pathlib import Path
from urllib.parse import quote
import re
import shutil
import sys

website = Path(sys.argv[1]).resolve()
logo_name = sys.argv[2]
stamp = sys.argv[3]

logo_url = "./assets/images/" + quote(logo_name)
replacement = (
    f'<img class="brand-symbol brand-logo-image" '
    f'src="{logo_url}" alt="ISOCON">'
)

pattern = re.compile(
    r"<span\s+class=([\"'])brand-symbol\1\s*>\s*IS\s*</span>",
    re.IGNORECASE,
)

extensions = {".html", ".js", ".mjs"}
changed = []
total = 0

for path in sorted(website.rglob("*")):
    if not path.is_file() or path.suffix.lower() not in extensions:
        continue

    source = path.read_text(encoding="utf-8")
    updated, count = pattern.subn(replacement, source)

    if not count:
        continue

    backup = path.with_name(path.name + f".bak.{stamp}")
    shutil.copy2(path, backup)
    path.write_text(updated, encoding="utf-8")

    changed.append((path.relative_to(website), count, backup.relative_to(website)))
    total += count

if not total:
    print("Aviso: nenhuma ocorrência exata foi encontrada.")
else:
    print(f"Substituições aplicadas: {total}")
    for path, count, backup in changed:
        print(f"  {path}: {count}")
        print(f"    backup: {backup}")
PY

cp "$PATCH_DIR/website/assets/css/brand-logo-patch.css" \
   "$WEBSITE/assets/css/brand-logo-patch.css"

python3 - "$WEBSITE/index.html" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8")

tag = '<link href="./assets/css/brand-logo-patch.css" rel="stylesheet">'

if tag not in html:
    anchors = [
        '<link href="./assets/css/institutional-admin-presence-patch.css" rel="stylesheet">',
        '<link href="./assets/css/chat-conversations-patch.css" rel="stylesheet">',
        '<link href="./assets/css/interaction-patch.css" rel="stylesheet">',
        '<link href="./assets/css/app.css" rel="stylesheet">',
    ]

    for anchor in anchors:
        if anchor in html:
            html = html.replace(anchor, anchor + tag, 1)
            break
    else:
        html = html.replace("</head>", f"  {tag}\n</head>", 1)

path.write_text(html, encoding="utf-8")
PY

echo
echo "Ocorrências restantes:"
grep -RIn \
  --include='*.html' \
  --include='*.js' \
  --include='*.mjs' \
  '<span class="brand-symbol">IS</span>' \
  "$WEBSITE" || true

echo
echo "Imagens inseridas:"
grep -RIn \
  --include='*.html' \
  --include='*.js' \
  --include='*.mjs' \
  'brand-logo-image' \
  "$WEBSITE" || true

echo
echo "Patch aplicado."
echo "Logo:"
echo "  $LOGO_FILE"
echo
echo "Publique com:"
echo "  cd "$ROOT""
echo "  git add -A"
echo '  git commit -m "style: substitui símbolo textual pela logo ISOCON"'
echo "  git push origin main"
