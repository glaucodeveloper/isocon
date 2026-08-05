# ISOCON — website B2B detalhado

Implementação estática em **Bootstrap 5 + Web Components nativos**, organizada para o repositório `glaucodeveloper/isocon`.

## Estrutura

```text
.
├── .github/workflows/pages.yml
├── scripts/
├── website/
│   ├── index.html
│   ├── assets/
│   │   ├── css/app.css
│   │   ├── images/
│   │   ├── js/
│   │   │   ├── app.js
│   │   │   ├── admin.js
│   │   │   ├── components.js
│   │   │   ├── pages.js
│   │   │   └── utils.js
│   │   └── uploads/
│   ├── data/catalog.json
│   └── scripts/
└── README.md
```

## Páginas públicas

- início;
- segmentos;
- linhas de produtos;
- página de segmento;
- listagem filtrável de itens por linha;
- detalhes do item;
- logística nacional por parceiros;
- equipe e representantes;
- sobre;
- contato;
- busca;
- lista de interesse e entrada de atendimento;
- janela flutuante e WhatsApp.

A interface **não executa checkout**. A lista reúne itens, quantidades estimadas e observações para abrir o atendimento de fechamento do negócio.

## Administração

Abra:

```text
#/admin
```

O GitHub PAT funciona como credencial. O painel valida o token na API do GitHub e exige permissão de escrita no repositório.

Crie um **fine-grained PAT** limitado a `glaucodeveloper/isocon`:

- Repository access: Only selected repositories;
- Contents: Read and write;
- Metadata: Read.

O token permanece em `sessionStorage` e não é gravado no catálogo ou no repositório.

### Funções administrativas

- dashboard;
- listagem e filtros de itens;
- cadastro em cinco etapas;
- edição de atributos, aplicações e benefícios;
- fornecimento e disponibilidade;
- narrativa logística sem alegar frota própria;
- upload de imagem, galeria e documentos pela API do GitHub;
- gerenciamento básico de segmentos e linhas;
- configurações institucionais;
- commit de `website/data/catalog.json`;
- deploy automático pelo GitHub Actions.

## Dados a revisar antes da publicação

Os nomes, fotos, telefones e e-mails dos representantes são demonstrativos. O endereço comercial também está marcado como pendente de confirmação.

## Teste local

Não abra `index.html` diretamente com `file://`, pois os módulos e o JSON dependem de HTTP.

```bash
./scripts/dev.sh

# ou:
cd website
python3 -m http.server 8080
```

Abra:

```text
http://localhost:8080/
http://localhost:8080/#/admin
```

## Instalação e deploy

Na raiz do repositório:

```bash
chmod +x scripts/setup.sh scripts/deploy.sh
./scripts/setup.sh
```

Atualizações:

```bash
./scripts/deploy.sh "feat: atualiza catálogo e páginas"
```

No GitHub, configure **Settings → Pages → Source: GitHub Actions**.
