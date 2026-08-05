# Seção “Para implementação”

Agrupa automaticamente na sidebar administrativa todas as opções que contêm
o texto `em preparação`.

A nova ordem mantém as áreas implementadas nos grupos operacionais e posiciona
os módulos pendentes em:

```text
PARA IMPLEMENTAÇÃO
```

A seção é inserida imediatamente antes de `CONFIGURAÇÕES`.

## Aplicação

```bash
chmod +x isocon-sidebar-para-implementacao-patch/apply-patch.sh
./isocon-sidebar-para-implementacao-patch/apply-patch.sh "$PWD"
```
