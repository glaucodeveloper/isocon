# Correção de carregamento de mídia

O catálogo mantém caminhos portáveis:

```text
./assets/uploads/items/...
```

O navegador não deve resolver esses caminhos a partir de uma URL antiga como
`/isocon/website/`. Este patch calcula a raiz da aplicação a partir do endereço
do próprio módulo JavaScript.

Ordem de carregamento:

1. arquivo do GitHub Pages na raiz efetiva da aplicação;
2. arquivo bruto do branch `main`, quando o deploy ainda não terminou.

## Aplicação

```bash
chmod +x isocon-asset-url-fallback-patch/apply-patch.sh
./isocon-asset-url-fallback-patch/apply-patch.sh "$PWD"
```
