# Patch de logo ISOCON

Substitui todas as ocorrências exatas de:

```html
<span class="brand-symbol">IS</span>
```

por:

```html
<img
  class="brand-symbol brand-logo-image"
  src="./assets/images/logo%201.png"
  alt="ISOCON">
```

## Aplicação

Na raiz do repositório:

```bash
chmod +x apply-logo-patch.sh
./apply-logo-patch.sh "$PWD" "logo 1.png"
```

O arquivo esperado é:

```text
website/assets/images/logo 1.png
```

O script cria backups dos arquivos alterados e instala:

```text
website/assets/css/brand-logo-patch.css
```
