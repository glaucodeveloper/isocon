# Correção da seção “Em preparação”

O patch anterior dependia de encontrar literalmente o texto `em preparação` no
item da sidebar. Depois que os botões foram convertidos em links, esse texto não
estava mais presente, então Clientes, Fornecedores e outros continuavam em
`MENU PRINCIPAL` ou `CATÁLOGO`.

Este corretivo extrai as rotas registradas no objeto `MODULES` de
`interaction-patch.js` e move todas para uma seção única:

```text
EM PREPARAÇÃO
```

A seção fica antes de `CONFIGURAÇÕES`.

## Aplicação

```bash
chmod +x isocon-sidebar-em-preparacao-fix/apply-fix.sh
./isocon-sidebar-em-preparacao-fix/apply-fix.sh "$PWD"
```
