#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="${REMOTE:-https://github.com/glaucodeveloper/isocon.git}"
BRANCH="${BRANCH:-main}"
MESSAGE="${MESSAGE:-feat: publica projeto completo da ISOCON}"

ROOT="$(cd "$ROOT" && pwd)"
cd "$ROOT"

if [[ ! -f website/index.html ]]; then
  echo "Erro: não encontrei:"
  echo "  $ROOT/website/index.html"
  exit 1
fi

mkdir -p .github/workflows scripts website
cp "$SCRIPT_DIR/.github/workflows/pages.yml" .github/workflows/pages.yml
cp "$SCRIPT_DIR/scripts/push-all.sh" scripts/push-all.sh
chmod +x scripts/push-all.sh
touch website/.nojekyll

if [[ ! -d .git ]]; then
  git init -b "$BRANCH"
else
  git branch -M "$BRANCH"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE"
else
  git remote add origin "$REMOTE"
fi

echo
echo "Arquivos que serão considerados pelo Git:"
git status --short --untracked-files=all || true

# Envia toda a raiz do projeto, respeitando somente o .gitignore existente.
git add -A

if git diff --cached --quiet; then
  echo "Nenhuma alteração para registrar."
else
  git commit -m "$MESSAGE"
fi

if git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  git fetch origin "$BRANCH"

  if git merge-base HEAD "origin/$BRANCH" >/dev/null 2>&1; then
    git rebase "origin/$BRANCH"
  else
    echo
    echo "Erro: o histórico remoto é diferente do histórico local."
    echo "Nenhum push forçado foi executado."
    exit 1
  fi
fi

git push -u origin "$BRANCH"

echo
echo "Projeto completo enviado ao repositório."
echo "O GitHub Pages publicará somente:"
echo "  $ROOT/website"
