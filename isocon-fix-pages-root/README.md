# Corrigir raiz do GitHub Pages

O repositório completo continua no branch `main`, mas o workflow empacota somente
o conteúdo de `./website`.

O resultado publicado fica em:

```text
https://glaucodeveloper.github.io/isocon/
```

e não em:

```text
https://glaucodeveloper.github.io/isocon/website/
```

## Aplicação

```bash
chmod +x fix-pages-root.sh
./fix-pages-root.sh "$PWD"
```

O script também tenta alterar a fonte do Pages para **GitHub Actions** usando
GitHub CLI. Quando `gh` não estiver autenticado, faça a alteração manualmente em:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```
