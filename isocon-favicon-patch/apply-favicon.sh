#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOGO_NAME="${2:-logo 1.png}"

ROOT="$(cd "$ROOT" && pwd)"
WEBSITE="$ROOT/website"
IMAGES="$WEBSITE/assets/images"
INDEX="$WEBSITE/index.html"
LOGO="$IMAGES/$LOGO_NAME"

if [[ ! -f "$INDEX" ]]; then
  echo "Erro: não encontrei $INDEX"
  exit 1
fi

if [[ ! -f "$LOGO" ]]; then
  echo "Erro: não encontrei $LOGO"
  exit 1
fi

mkdir -p "$IMAGES"

make_icon_imagemagick() {
  local command="$1"

  "$command" "$LOGO" \
    -background none \
    -gravity center \
    -resize 28x28 \
    -extent 32x32 \
    "$IMAGES/favicon-32x32.png"

  "$command" "$LOGO" \
    -background none \
    -gravity center \
    -resize 168x168 \
    -extent 180x180 \
    "$IMAGES/apple-touch-icon.png"

  "$command" "$LOGO" \
    -background none \
    -gravity center \
    -resize 180x180 \
    -extent 192x192 \
    "$IMAGES/favicon-192x192.png"

  "$command" "$LOGO" \
    -background none \
    -gravity center \
    \( -clone 0 -resize 16x16 -extent 16x16 \) \
    \( -clone 0 -resize 32x32 -extent 32x32 \) \
    \( -clone 0 -resize 48x48 -extent 48x48 \) \
    -delete 0 \
    "$IMAGES/favicon.ico"
}

if command -v magick >/dev/null 2>&1; then
  make_icon_imagemagick magick
elif command -v convert >/dev/null 2>&1; then
  make_icon_imagemagick convert
else
  echo "Aviso: ImageMagick não está instalado."
  echo "Será usado o PNG original como favicon, sem gerar tamanhos adicionais."
  cp "$LOGO" "$IMAGES/favicon.png"
fi

python3 - "$INDEX" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
html = path.read_text(encoding="utf-8")

# Remove declarações antigas de favicon para evitar duplicação.
patterns = [
    r'\s*<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]*>\s*',
    r'\s*<link[^>]+rel=["\']apple-touch-icon["\'][^>]*>\s*',
]
for pattern in patterns:
    html = re.sub(pattern, "\n", html, flags=re.I)

icons = """
  <link rel="icon" href="./assets/images/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="./assets/images/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="./assets/images/favicon-192x192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="./assets/images/apple-touch-icon.png">
"""

fallback_icons = """
  <link rel="icon" type="image/png" href="./assets/images/favicon.png">
  <link rel="apple-touch-icon" href="./assets/images/favicon.png">
"""

images_dir = path.parent / "assets" / "images"
selected = icons if (images_dir / "favicon.ico").exists() else fallback_icons

if "</head>" not in html:
    raise SystemExit("Erro: não encontrei </head> em website/index.html.")

html = html.replace("</head>", selected + "\n</head>", 1)
path.write_text(html, encoding="utf-8")
PY

echo
echo "Favicon configurado em:"
echo "  $INDEX"
echo
echo "Arquivos:"
find "$IMAGES" -maxdepth 1 -type f \
  \( -name 'favicon*' -o -name 'apple-touch-icon.png' \) \
  -printf '  %f\n' | sort

echo
echo "Publique:"
echo "  git add website/index.html website/assets/images/favicon* website/assets/images/apple-touch-icon.png"
echo '  git commit -m "style: usa logo ISOCON como favicon"'
echo "  git pull --rebase origin main"
echo "  git push origin main"
