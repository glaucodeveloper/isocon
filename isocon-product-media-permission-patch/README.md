# Patch de mídia de produtos e autorização

Este patch:

- remove o link `Área administrativa` da navbar pública;
- preserva imagens e documentos como `File/Blob` no IndexedDB;
- mantém as prévias ao avançar e voltar pelas etapas;
- restaura arquivos após uma atualização acidental da página;
- mantém os blobs até a confirmação do salvamento do catálogo;
- apresenta uma orientação clara quando a credencial não possui escrita.

## Aplicação

Na raiz do projeto:

```bash
unzip -o isocon-product-media-permission-patch.zip \
  -d isocon-product-media-permission-patch

chmod +x isocon-product-media-permission-patch/apply-patch.sh

./isocon-product-media-permission-patch/apply-patch.sh "$PWD"
```

A credencial fine-grained deve selecionar:

```text
Resource owner: glaucodeveloper
Repository access: Only select repositories → isocon
Repository permissions: Contents → Read and write
```
