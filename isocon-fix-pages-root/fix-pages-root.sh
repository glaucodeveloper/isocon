#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPOSITORY="${REPOSITORY:-glaucodeveloper/isocon}"
BRANCH="${BRANCH:-main}"

ROOT="$(cd "$ROOT" && pwd)"
cd "$ROOT"

if [[ ! -f website/index.html ]]; then
  echo "Erro: não encontrei:"
  echo "  $ROOT/website/index.html"
  exit 1
fi

mkdir -p .github/workflows
cp "$SCRIPT_DIR/.github/workflows/pages.yml" \
   .github/workflows/pages.yml

touch website/.nojekyll

python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
extensions = {".html", ".css", ".js", ".json", ".svg", ".md"}

for path in root.joinpath("website").rglob("*"):
    if not path.is_file() or path.suffix.lower() not in extensions:
        continue

    try:
        source = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue

    updated = source.replace(
        "https://glaucodeveloper.github.io/isocon/website/",
        "https://glaucodeveloper.github.io/isocon/",
    )
    updated = updated.replace("/isocon/website/", "/isocon/")

    if updated != source:
        path.write_text(updated, encoding="utf-8")
        print(f"Caminho corrigido: {path.relative_to(root)}")
PY

echo
echo "Configurando o Pages para usar GitHub Actions..."

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if gh api "repos/$REPOSITORY/pages" >/dev/null 2>&1; then
    gh api \
      --method PUT \
      -H "Accept: application/vnd.github+json" \
      "repos/$REPOSITORY/pages" \
      --input - <<'JSON'
{"build_type":"workflow"}
JSON
  else
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      "repos/$REPOSITORY/pages" \
      --input - <<'JSON'
{"build_type":"workflow"}
JSON
  fi

  echo "Fonte do Pages configurada como GitHub Actions."
else
  echo "Aviso: GitHub CLI ausente ou não autenticado."
  echo "No GitHub, selecione:"
  echo "  Settings → Pages → Source → GitHub Actions"
fi

git add -A

if git diff --cached --quiet; then
  echo "Nenhuma alteração para registrar."
else
  git commit -m "fix: publica website na raiz do GitHub Pages"
fi

git push origin "$BRANCH"

echo
echo "Correção enviada."
echo
echo "URL correta do projeto:"
echo "  https://glaucodeveloper.github.io/isocon/"
echo
echo "A URL abaixo não deve mais ser usada:"
echo "  https://glaucodeveloper.github.io/isocon/website/"
