# Copywriting e SEO — ISOCON

Adiciona a rota:

```text
#/admin/copywriting
```

A área permite editar:

- SEO e prévia compartilhada no WhatsApp;
- dados institucionais;
- textos da página inicial;
- logística;
- representantes;
- conteúdo “Sobre”;
- títulos, botões, chamadas e instruções fixas da interface.

O catálogo armazena os textos em:

```text
copywriting.seo
copywriting.labels
copywriting.texts
```

O workflow executa `scripts/build-seo.py` antes do deploy, criando metadados
estáticos no `index.html`, `robots.txt` e `sitemap.xml`.

## Aplicação

```bash
chmod +x apply-patch.sh
./apply-patch.sh "$PWD"
```

## Publicação

```bash
git add -A
git commit -m "feat: adiciona administração de copywriting e SEO"
git pull --rebase origin main
git push origin main
```

Como o site utiliza rotas com fragmento (`#/...`), o SEO estático principal é
o da página raiz. Segmentos e itens continuam navegáveis na aplicação, mas SEO
individual para cada rota exigiria páginas reais ou pré-renderizadas.
