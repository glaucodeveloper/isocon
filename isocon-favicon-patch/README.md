# Favicon ISOCON

Usa `website/assets/images/logo 1.png` como base para gerar:

- `favicon.ico`
- `favicon-32x32.png`
- `favicon-192x192.png`
- `apple-touch-icon.png`

## Aplicação

```bash
chmod +x apply-favicon.sh
./apply-favicon.sh "$PWD" "logo 1.png"
```

O script adiciona as declarações correspondentes ao `<head>` de
`website/index.html`.

Quando o ImageMagick não estiver instalado, o script usa o PNG original como
fallback.
