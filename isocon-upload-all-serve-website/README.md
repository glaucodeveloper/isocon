# Upload completo + Pages em `./website`

Este pacote faz duas operações diferentes:

1. O Git recebe **toda a pasta-raiz do projeto** por meio de `git add -A`.
2. O GitHub Pages publica **somente o conteúdo de `./website`**.

## Aplicação

Na raiz do projeto:

```bash
unzip -o isocon-upload-all-serve-website.zip \
  -d isocon-upload-all-serve-website

chmod +x isocon-upload-all-serve-website/install-and-push-all.sh

./isocon-upload-all-serve-website/install-and-push-all.sh "$PWD"
```

Para atualizações seguintes:

```bash
./scripts/push-all.sh "descrição da alteração"
```

O workflow fica em:

```text
.github/workflows/pages.yml
```

A origem do Pages deve estar definida como **GitHub Actions** nas configurações do repositório.
