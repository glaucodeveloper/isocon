#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Erro: execute dentro do repositório Git."
  exit 1
}

MESSAGE="${1:-chore: atualiza projeto ISOCON}"

cd "$ROOT"

test -f website/index.html || {
  echo "Erro: website/index.html não foi encontrado."
  exit 1
}

if test -f website/data/catalog.json; then
  python3 -m json.tool website/data/catalog.json >/dev/null
fi

# Inclui toda a pasta-raiz: .github, scripts, README, website e demais arquivos.
# Somente padrões do .gitignore são excluídos.
git add -A

if git diff --cached --quiet; then
  echo "Nenhuma alteração para enviar."
  exit 0
fi

git commit -m "$MESSAGE"
git push origin main

echo "Toda a raiz do projeto foi enviada."
echo "O Pages continuará servindo apenas ./website."
