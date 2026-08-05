# Correção do SHA do catálogo

O erro:

```text
Invalid request. "sha" wasn't supplied.
```

ocorria quando `website/data/catalog.json` já existia, mas a interface mantinha
`remote.sha = null`. A API interpretava o `PUT` como criação de um arquivo que
já existia.

A correção localiza o catálogo pela árvore Git, lê o SHA atual do blob e o envia
antes de atualizar. Em conflito, o SHA é consultado novamente e o envio é
repetido uma vez.

## Aplicação

```bash
chmod +x isocon-catalog-sha-fix/apply-fix.sh
./isocon-catalog-sha-fix/apply-fix.sh "$PWD"
```
