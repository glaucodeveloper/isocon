import {
  state,
  githubConfig,
  route,
  esc,
  findItem,
  findLine,
  findSegment,
  addToQuote,
  removeFromQuote,
} from "./utils.js";

/*
 * Patch funcional ISOCON
 * - evita a requisição 404 do catálogo antes de confirmar o caminho no Git;
 * - mantém o checkbox da lista sincronizado;
 * - salva favoritos e ratings no localStorage;
 * - salva mensagens de contato no localStorage;
 * - adiciona dropdown de notificações no administrativo;
 * - implementa a aba Contatos, Favoritos e páginas dos módulos em preparação;
 * - torna o admin-menu-toggle funcional no desktop e no mobile.
 */

const STORAGE = Object.freeze({
  favorites: "isoconFavorites",
  ratings: "isoconFavoriteRatings",
  contacts: "isoconContactMessages",
  sidebar: "isoconAdminSidebarCollapsed",
});

const readJson = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

state.favorites = Array.isArray(readJson(STORAGE.favorites, []))
  ? readJson(STORAGE.favorites, [])
  : [];
state.favoriteRatings = readJson(STORAGE.ratings, {});
state.contactMessages = Array.isArray(readJson(STORAGE.contacts, []))
  ? readJson(STORAGE.contacts, [])
  : [];

/* -------------------------------------------------------------------------- */
/* GitHub: descobrir o caminho do catálogo sem disparar GET 404 em contents.  */
/* -------------------------------------------------------------------------- */

const nativeFetch = window.fetch.bind(window);
const repositoryApi = `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}`;
const catalogCandidates = [
  "website/data/catalog.json",
  "data/catalog.json",
];

let repositoryMetadata = null;
let resolvedCatalogPath = null;

const requestMethod = (input, init = {}) =>
  String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();

const requestHeaders = (input, init = {}) =>
  init.headers || (input instanceof Request ? input.headers : undefined);

const requestUrl = (input) => typeof input === "string" ? input : input.url;

const isRepositoryMetadataRequest = (url, method) =>
  method === "GET" && url.replace(/\/$/, "") === repositoryApi;

const isCatalogContentsRequest = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://api.github.com"
      && parsed.pathname.startsWith(`/repos/${githubConfig.owner}/${githubConfig.repo}/contents/`)
      && parsed.pathname.endsWith("/data/catalog.json");
  } catch {
    return false;
  }
};

const syntheticNotFound = () => new Response(
  JSON.stringify({ message: "Catálogo ainda não criado no repositório." }),
  {
    status: 404,
    headers: { "Content-Type": "application/json" },
  },
);

const rewriteContentsUrl = (url, repositoryPath) => {
  const parsed = new URL(url);
  parsed.pathname = `/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${repositoryPath}`;
  return parsed.toString();
};

async function resolveCatalogPath(headers) {
  if (resolvedCatalogPath) return resolvedCatalogPath;

  if (repositoryMetadata && (
    Number(repositoryMetadata.size || 0) === 0
    || !repositoryMetadata.pushed_at
  )) {
    return null;
  }

  const branch = repositoryMetadata?.default_branch || githubConfig.branch || "main";
  const treeResponse = await nativeFetch(
    `${repositoryApi}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: headers || {
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (treeResponse.status === 404 || treeResponse.status === 409) return null;
  if (!treeResponse.ok) return null;

  const treePayload = await treeResponse.json();
  const paths = new Set((treePayload.tree || []).map((entry) => entry.path));

  resolvedCatalogPath =
    catalogCandidates.find((candidate) => paths.has(candidate))
    || [...paths].find((path) => path.endsWith("/data/catalog.json"))
    || null;

  if (resolvedCatalogPath) {
    githubConfig.catalogPath = resolvedCatalogPath;
    githubConfig.uploadPath = resolvedCatalogPath.startsWith("website/")
      ? "website/assets/uploads"
      : "assets/uploads";
  }

  return resolvedCatalogPath;
}

window.fetch = async (input, init = {}) => {
  const url = requestUrl(input);
  const method = requestMethod(input, init);

  if (isRepositoryMetadataRequest(url, method)) {
    const response = await nativeFetch(input, init);
    if (response.ok) {
      repositoryMetadata = await response.clone().json();
    }
    return response;
  }

  if (isCatalogContentsRequest(url)) {
    if (method === "GET") {
      const path = await resolveCatalogPath(requestHeaders(input, init));
      if (!path) return syntheticNotFound();
      return nativeFetch(rewriteContentsUrl(url, path), init);
    }

    if (method === "PUT") {
      const path = resolvedCatalogPath || githubConfig.catalogPath || "website/data/catalog.json";
      return nativeFetch(rewriteContentsUrl(url, path), init);
    }
  }

  return nativeFetch(input, init);
};

/* Carrega os componentes antes de definir o elemento raiz. */
await import("./components.js");
await import("./admin.js");

/* -------------------------------------------------------------------------- */
/* Favoritos, rating local e lista de interesse.                              */
/* -------------------------------------------------------------------------- */

const quoteHas = (id) => state.quote.some((entry) => entry.id === id);
const favoriteHas = (id) => state.favorites.includes(id);

const ratingFor = (id) => {
  const item = findItem(id);
  const stored = Number(state.favoriteRatings[id]);
  if (Number.isFinite(stored)) return stored;
  return Number(item?.rating || 0);
};

function saveFavorites() {
  writeJson(STORAGE.favorites, state.favorites);
  writeJson(STORAGE.ratings, state.favoriteRatings);
  document.dispatchEvent(new CustomEvent("favoritechange"));
}

function toggleFavorite(id) {
  const item = findItem(id);
  if (!item) return;

  if (favoriteHas(id)) {
    state.favorites = state.favorites.filter((entry) => entry !== id);
    state.favoriteRatings[id] = Math.max(0, ratingFor(id) - 1);
  } else {
    state.favorites = [...state.favorites, id];
    state.favoriteRatings[id] = ratingFor(id) + 1;
  }

  saveFavorites();
}

function syncItemControls(root = document) {
  const cards = [];

  if (root instanceof Element && root.matches("item-card")) {
    cards.push(root);
  }

  root.querySelectorAll?.("item-card").forEach((card) => {
    cards.push(card);
  });

  cards.forEach((card) => {
    const checkbox = card.querySelector("[data-add-item]");
    const favorite = card.querySelector("button.favorite");
    const id = checkbox?.dataset.addItem;
    if (!id) return;

    const selected = quoteHas(id);
    checkbox.checked = selected;
    checkbox.setAttribute("aria-checked", String(selected));
    const label = checkbox.closest(".add-list-check");
    label?.classList.toggle("is-selected", selected);
    if (label) {
      const text = label.querySelector("[data-list-label]");
      const desiredLabel = selected
        ? "Item adicionado à lista"
        : "Adicionar à lista";

      if (text) {
        if (text.textContent !== desiredLabel) {
          text.textContent = desiredLabel;
        }
      } else {
        for (const node of [...label.childNodes]) {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
        }
        label.insertAdjacentHTML(
          "beforeend",
          `<span data-list-label>${selected ? "Item adicionado à lista" : "Adicionar à lista"}</span>`,
        );
      }
    }

    if (favorite) {
      favorite.dataset.favoriteItem = id;
      const active = favoriteHas(id);
      favorite.classList.toggle("is-favorite", active);
      favorite.setAttribute("aria-pressed", String(active));
      favorite.setAttribute(
        "aria-label",
        active ? "Remover item dos favoritos" : "Salvar item nos favoritos",
      );
      const desiredIconClass =
        `bi bi-${active ? "heart-fill" : "heart"}`;
      const currentIcon = favorite.querySelector("i");

      if (!currentIcon || currentIcon.className !== desiredIconClass) {
        const icon = document.createElement("i");
        icon.className = desiredIconClass;
        favorite.replaceChildren(icon);
      }

      favorite.title = `Favoritos: ${ratingFor(id)}`;
    }
  });
}

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest?.("[data-add-item]");
  if (!checkbox) return;

  /*
   * O ItemCard original sempre desmarcava o checkbox após adicionar.
   * A captura interrompe esse listener e aplica o estado persistente correto.
   */
  event.stopImmediatePropagation();
  const id = checkbox.dataset.addItem;
  if (checkbox.checked) {
    if (!quoteHas(id)) addToQuote(id);
  } else {
    removeFromQuote(id);
  }
  syncItemControls();
}, true);

document.addEventListener("click", (event) => {
  const favorite = event.target.closest?.("button.favorite");
  if (!favorite) return;
  event.preventDefault();
  event.stopPropagation();
  const id = favorite.dataset.favoriteItem
    || favorite.closest("item-card")?.querySelector("[data-add-item]")?.dataset.addItem;
  if (id) toggleFavorite(id);
}, true);

document.addEventListener("quotechange", () => syncItemControls());
document.addEventListener("favoritechange", () => {
  syncItemControls();
  refreshAdminNotifications();
});

let itemControlSyncScheduled = false;

function scheduleItemControlSync() {
  if (itemControlSyncScheduled) return;
  itemControlSyncScheduled = true;

  queueMicrotask(() => {
    itemControlSyncScheduled = false;
    syncItemControls();
  });
}

new MutationObserver((mutations) => {
  const containsNewItemCard = mutations.some((mutation) =>
    [...mutation.addedNodes].some((node) =>
      node instanceof Element
      && (
        node.matches("item-card")
        || Boolean(node.querySelector?.("item-card"))
      )
    )
  );

  if (containsNewItemCard) {
    scheduleItemControlSync();
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("DOMContentLoaded", scheduleItemControlSync);

/* -------------------------------------------------------------------------- */
/* Mensagens de contato.                                                       */
/* -------------------------------------------------------------------------- */

function persistContacts() {
  writeJson(STORAGE.contacts, state.contactMessages);
  document.dispatchEvent(new CustomEvent("contactchange"));
}

function storeContactMessage(form) {
  const data = new FormData(form);
  const message = {
    id: globalThis.crypto?.randomUUID?.() || `contact-${Date.now()}`,
    name: String(data.get("name") || "").trim(),
    company: String(data.get("company") || "").trim(),
    email: String(data.get("email") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    subject: String(data.get("subject") || "Contato pelo site").trim(),
    message: String(data.get("message") || "").trim(),
    createdAt: new Date().toISOString(),
    unread: true,
    status: "novo",
  };

  if (!message.name || !message.email || !message.message) return;
  state.contactMessages = [message, ...state.contactMessages].slice(0, 200);
  persistContacts();
}

document.addEventListener("submit", (event) => {
  if (event.target?.matches("#contactForm")) storeContactMessage(event.target);
}, true);

document.addEventListener("contactchange", () => refreshAdminNotifications());

/* -------------------------------------------------------------------------- */
/* Administração.                                                              */
/* -------------------------------------------------------------------------- */

const MODULES = {
  "/admin/pedidos": {
    title: "Pedidos e solicitações",
    subtitle: "Preparação do fluxo comercial",
    icon: "bi-file-earmark-text",
    description: "Receber listas de interesse, organizar a triagem e acompanhar a transformação de uma solicitação em negociação.",
    entities: ["Solicitação", "Empresa", "Responsável", "Itens", "Destino", "Prazo desejado", "Status comercial"],
    actions: ["Receber", "Qualificar", "Atribuir responsável", "Solicitar dados", "Converter em cotação"],
  },
  "/admin/clientes": {
    title: "Clientes",
    subtitle: "Cadastro e histórico B2B",
    icon: "bi-people",
    description: "Centralizar empresas, responsáveis, canais preferidos, localidades e histórico de solicitações.",
    entities: ["Empresa", "CNPJ", "Responsáveis", "Endereços", "Canais", "Histórico"],
    actions: ["Cadastrar", "Editar", "Consultar solicitações", "Relacionar contatos"],
  },
  "/admin/fornecedores": {
    title: "Fornecedores",
    subtitle: "Origem e capacidade de fornecimento",
    icon: "bi-person-badge",
    description: "Registrar fornecedores, linhas atendidas, documentos, condições e contatos comerciais.",
    entities: ["Fornecedor", "CNPJ", "Contato", "Linhas", "Documentos", "Cobertura"],
    actions: ["Cadastrar", "Validar", "Relacionar itens", "Registrar documentação"],
  },
  "/admin/cotacoes": {
    title: "Cotações",
    subtitle: "Composição da proposta comercial",
    icon: "bi-receipt",
    description: "Organizar itens, quantidades, condições, prazos e análise logística antes do fechamento.",
    entities: ["Cotação", "Solicitação", "Itens", "Condições", "Frete", "Validade"],
    actions: ["Criar", "Revisar", "Enviar", "Registrar retorno", "Converter"],
  },
  "/admin/financeiro": {
    title: "Financeiro",
    subtitle: "Estrutura prevista para integração",
    icon: "bi-cash-stack",
    description: "Área reservada para condições comerciais, títulos, conciliação e integração com operação financeira.",
    entities: ["Condição", "Título", "Vencimento", "Situação", "Documento"],
    actions: ["Importar", "Conciliar", "Consultar", "Exportar"],
  },
  "/admin/relatorios": {
    title: "Relatórios",
    subtitle: "Leitura operacional e comercial",
    icon: "bi-bar-chart",
    description: "Consolidar indicadores de catálogo, interesse, contatos, cotações e desempenho por segmento.",
    entities: ["Período", "Indicador", "Segmento", "Linha", "Item", "Canal"],
    actions: ["Filtrar", "Comparar", "Exportar", "Agendar"],
  },
  "/admin/categorias": {
    title: "Categorias",
    subtitle: "Classificação complementar dos itens",
    icon: "bi-tag",
    description: "Página preparada para normalizar categorias e subcategorias atualmente registradas diretamente nos itens.",
    entities: ["Categoria", "Subcategoria", "Linha", "Atributos", "Ordem"],
    actions: ["Cadastrar", "Relacionar", "Reordenar", "Arquivar"],
  },
  "/admin/marcas": {
    title: "Marcas",
    subtitle: "Informação secundária do catálogo",
    icon: "bi-award",
    description: "Cadastro opcional para identificação técnica, sem tornar marcas o eixo principal da navegação pública.",
    entities: ["Marca", "Nome", "Logotipo", "Itens", "Status"],
    actions: ["Cadastrar", "Relacionar itens", "Ocultar da navegação"],
  },
  "/admin/unidades": {
    title: "Unidades de medida",
    subtitle: "Padronização do fornecimento",
    icon: "bi-rulers",
    description: "Manter unidades como unidade, caixa, pacote, conjunto, metro, quilo e outras formas de fornecimento.",
    entities: ["Unidade", "Símbolo", "Descrição", "Conversão"],
    actions: ["Cadastrar", "Editar", "Desativar", "Relacionar itens"],
  },
  "/admin/atributos": {
    title: "Atributos",
    subtitle: "Especificações reutilizáveis",
    icon: "bi-sliders",
    description: "Definir propriedades técnicas por linha para reduzir inconsistências no cadastro de itens.",
    entities: ["Atributo", "Tipo", "Unidade", "Linha", "Obrigatoriedade", "Opções"],
    actions: ["Cadastrar", "Aplicar à linha", "Ordenar", "Validar"],
  },
  "/admin/usuarios": {
    title: "Usuários",
    subtitle: "Acesso administrativo",
    icon: "bi-person-gear",
    description: "Estrutura prevista para registrar administradores e relacionar identidades GitHub autorizadas.",
    entities: ["Usuário GitHub", "Nome", "Função", "Estado", "Último acesso"],
    actions: ["Autorizar", "Suspender", "Revisar acesso"],
  },
  "/admin/permissoes": {
    title: "Permissões",
    subtitle: "Controle por capacidade",
    icon: "bi-shield-lock",
    description: "Planejamento de permissões para criar, editar, revisar, publicar, ocultar e administrar configurações.",
    entities: ["Papel", "Capacidade", "Usuário", "Escopo"],
    actions: ["Criar papel", "Atribuir", "Auditar"],
  },
  "/admin/logs": {
    title: "Logs do sistema",
    subtitle: "Auditoria e versionamento",
    icon: "bi-journal-text",
    description: "Os commits do Git já formam o histórico primário. A página será preparada para apresentar ações em linguagem operacional.",
    entities: ["Commit", "Autor", "Data", "Arquivo", "Ação", "Resultado"],
    actions: ["Consultar", "Filtrar", "Abrir commit", "Exportar"],
  },
};

const AdminApp = customElements.get("admin-app");
const adminPrototype = AdminApp?.prototype;

const adminMenu = [
  {
    label: "MENU PRINCIPAL",
    entries: [
      ["/admin/dashboard", "bi-grid", "Dashboard"],
      ["/admin/pedidos", "bi-file-earmark-text", "Pedidos"],
      ["/admin/contatos", "bi-chat-left-text", "Contatos"],
      ["/admin/clientes", "bi-people", "Clientes"],
      ["/admin/fornecedores", "bi-person-badge", "Fornecedores"],
      ["/admin/cotacoes", "bi-receipt", "Cotações"],
      ["/admin/financeiro", "bi-cash-stack", "Financeiro"],
      ["/admin/relatorios", "bi-bar-chart", "Relatórios"],
    ],
  },
  {
    label: "CATÁLOGO",
    entries: [
      ["/admin/segmentos", "bi-diagram-3", "Segmentos"],
      ["/admin/categorias", "bi-tag", "Categorias"],
      ["/admin/linhas", "bi-collection", "Linhas de produtos"],
      ["/admin/itens", "bi-box", "Itens"],
      ["/admin/favoritos", "bi-heart", "Favoritos"],
      ["/admin/marcas", "bi-award", "Marcas"],
      ["/admin/unidades", "bi-rulers", "Unidades de medida"],
      ["/admin/atributos", "bi-sliders", "Atributos"],
    ],
  },
  {
    label: "CONFIGURAÇÕES",
    entries: [
      ["/admin/usuarios", "bi-person-gear", "Usuários"],
      ["/admin/permissoes", "bi-shield-lock", "Permissões"],
      ["/admin/configuracoes", "bi-gear", "Parâmetros"],
      ["/admin/logs", "bi-journal-text", "Logs do sistema"],
    ],
  },
];

const adminRoutePath = () => route().split("?")[0];

function preparationView(definition, current) {
  const examples = {
    "/admin/categorias": [...new Set(state.data.items.flatMap((item) => [item.category, item.subcategory]).filter(Boolean))],
    "/admin/marcas": [...new Set(state.data.items.map((item) => item.brand).filter(Boolean))],
    "/admin/unidades": [...new Set(state.data.items.map((item) => item.unit).filter(Boolean))],
    "/admin/atributos": [...new Set(state.data.items.flatMap((item) => Object.keys(item.attributes || {})))],
  }[current] || [];

  return `
    <section class="admin-panel preparation-page">
      <header class="preparation-hero">
        <div class="preparation-icon"><i class="bi ${definition.icon}"></i></div>
        <div>
          <span>IMPLEMENTAÇÃO PREPARADA</span>
          <h2>${esc(definition.title)}</h2>
          <p>${esc(definition.description)}</p>
        </div>
        <em>Em preparação</em>
      </header>
      <div class="preparation-grid">
        <article><h3>Entidades previstas</h3><ul>${definition.entities.map((entry) => `<li><i class="bi bi-check-circle"></i>${esc(entry)}</li>`).join("")}</ul></article>
        <article><h3>Capacidades previstas</h3><ul>${definition.actions.map((entry) => `<li><i class="bi bi-arrow-right-circle"></i>${esc(entry)}</li>`).join("")}</ul></article>
        <article><h3>Estado atual</h3><p>A rota, o item de menu e a estrutura visual já existem. A persistência específica deste módulo será conectada quando o fluxo operacional for validado.</p></article>
      </div>
      ${examples.length ? `<section class="preparation-existing"><h3>Valores encontrados no catálogo atual</h3><div>${examples.map((entry) => `<span>${esc(entry)}</span>`).join("")}</div></section>` : ""}
    </section>`;
}

function contactsView() {
  const selectedId = new URLSearchParams(location.hash.split("?")[1] || "").get("message");
  const selected = state.contactMessages.find((message) => message.id === selectedId)
    || state.contactMessages[0]
    || null;

  return `
    <section class="admin-contacts-grid">
      <article class="admin-panel contacts-list-panel">
        <div class="panel-heading">
          <div><h2>Mensagens recebidas</h2><p>Registros enviados pelo formulário público neste navegador.</p></div>
          <button class="btn btn-outline-primary btn-sm" data-mark-all-contacts>Marcar todas como lidas</button>
        </div>
        <div class="contact-admin-list">
          ${state.contactMessages.length ? state.contactMessages.map((message) => `
            <a class="${message.unread ? "unread" : ""} ${selected?.id === message.id ? "active" : ""}" href="#/admin/contatos?message=${encodeURIComponent(message.id)}">
              <span class="contact-avatar">${esc((message.name || "?").slice(0, 1).toUpperCase())}</span>
              <div><strong>${esc(message.name)}</strong><small>${esc(message.company || message.email)}</small><p>${esc(message.subject)}</p></div>
              <time>${new Date(message.createdAt).toLocaleDateString("pt-BR")}</time>
            </a>`).join("") : `<div class="admin-empty-state"><i class="bi bi-inbox"></i><strong>Nenhuma mensagem armazenada</strong><span>As mensagens do formulário de contato aparecerão aqui.</span></div>`}
        </div>
      </article>
      <article class="admin-panel contact-detail-panel">
        ${selected ? `
          <header><div><span>${selected.unread ? "NOVA MENSAGEM" : "MENSAGEM"}</span><h2>${esc(selected.subject)}</h2></div>
            <button class="btn btn-outline-danger btn-sm" data-delete-contact="${esc(selected.id)}"><i class="bi bi-trash"></i></button></header>
          <dl>
            <div><dt>Responsável</dt><dd>${esc(selected.name)}</dd></div>
            <div><dt>Empresa</dt><dd>${esc(selected.company || "Não informada")}</dd></div>
            <div><dt>E-mail</dt><dd><a href="mailto:${esc(selected.email)}">${esc(selected.email)}</a></dd></div>
            <div><dt>Telefone</dt><dd>${esc(selected.phone || "Não informado")}</dd></div>
            <div><dt>Recebida em</dt><dd>${new Date(selected.createdAt).toLocaleString("pt-BR")}</dd></div>
          </dl>
          <div class="contact-message-body">${esc(selected.message).replaceAll("\n", "<br>")}</div>
          <div class="contact-detail-actions">
            <a class="btn btn-primary" href="mailto:${esc(selected.email)}?subject=${encodeURIComponent(`Retorno ISOCON: ${selected.subject}`)}"><i class="bi bi-reply me-2"></i>Responder por e-mail</a>
            ${selected.phone ? `<a class="btn btn-outline-success" href="https://wa.me/55${selected.phone.replaceAll(/\D/g, "")}" target="_blank"><i class="bi bi-whatsapp me-2"></i>WhatsApp</a>` : ""}
          </div>` : `<div class="admin-empty-state"><i class="bi bi-envelope-open"></i><strong>Selecione uma mensagem</strong></div>`}
      </article>
    </section>`;
}

function favoritesView() {
  const items = state.favorites.map((id) => findItem(id)).filter(Boolean);
  return `
    <section class="admin-panel">
      <div class="panel-heading favorites-heading"><div><h2>Itens marcados como favoritos</h2><p>Preferências registradas no localStorage deste navegador.</p></div><strong>${items.length} itens</strong></div>
      <div class="admin-favorites-list">
        ${items.length ? items.map((item) => `
          <article>
            <img src="${esc(item.image)}" alt="">
            <div><strong>${esc(item.name)}</strong><span>${esc(item.code)} · ${esc(findLine(item.lineId)?.name || "")}</span></div>
            <em><i class="bi bi-heart-fill"></i> Rating ${ratingFor(item.id)}</em>
            <a class="btn btn-outline-primary btn-sm" href="#/admin/item/${item.id}">Abrir item</a>
          </article>`).join("") : `<div class="admin-empty-state"><i class="bi bi-heart"></i><strong>Nenhum favorito</strong><span>Os itens favoritados no catálogo público aparecerão aqui.</span></div>`}
      </div>
    </section>`;
}

function notificationModel() {
  const contacts = state.contactMessages
    .filter((message) => message.unread)
    .slice(0, 5);
  const favorites = state.favorites
    .map((id) => findItem(id))
    .filter(Boolean)
    .slice(0, 5);

  return {
    contacts,
    favorites,
    count: contacts.length + favorites.length,
  };
}

function notificationsHtml() {
  const model = notificationModel();
  return `
    <div class="notification-center">
      <button class="notification-button" data-notification-toggle aria-expanded="false" aria-label="Abrir notificações">
        <i class="bi bi-bell"></i>
        ${model.count ? `<span>${model.count > 99 ? "99+" : model.count}</span>` : ""}
      </button>
      <aside class="notification-dropdown" data-notification-dropdown hidden>
        <header><div><strong>Notificações</strong><span>${model.count} registros</span></div><a href="#/admin/contatos">Ver contatos</a></header>
        <section>
          <h3>Mensagens de contato</h3>
          ${model.contacts.length ? model.contacts.map((message) => `
            <a href="#/admin/contatos?message=${encodeURIComponent(message.id)}" data-notification-contact="${esc(message.id)}">
              <i class="bi bi-chat-left-text"></i><span><strong>${esc(message.name)}</strong><small>${esc(message.subject)}</small></span><em>Novo</em>
            </a>`).join("") : `<p>Nenhuma mensagem não lida.</p>`}
        </section>
        <section>
          <h3>Itens favoritos</h3>
          ${model.favorites.length ? model.favorites.map((item) => `
            <a href="#/admin/item/${item.id}">
              <i class="bi bi-heart-fill"></i><span><strong>${esc(item.name)}</strong><small>${esc(item.code)}</small></span><em>Rating ${ratingFor(item.id)}</em>
            </a>`).join("") : `<p>Nenhum item favoritado.</p>`}
        </section>
        <footer><a href="#/admin/favoritos">Abrir todos os favoritos</a></footer>
      </aside>
    </div>`;
}

function replaceAdminMenu(admin, current) {
  const nav = admin.querySelector("#adminSidebar nav");
  if (!nav) return;

  const active = (path) =>
    current === path
    || (path === "/admin/itens" && current.startsWith("/admin/item/"));

  nav.innerHTML = adminMenu.map((group) => `
    <span class="admin-nav-label">${group.label}</span>
    ${group.entries.map(([path, icon, label]) => `
      <a class="${active(path) ? "active" : ""}" href="#${path}">
        <i class="bi ${icon}"></i><span>${label}</span>
      </a>`).join("")}
  `).join("");
}

function bindContactAdmin(admin) {
  const selectedId = new URLSearchParams(location.hash.split("?")[1] || "").get("message");
  if (selectedId) {
    const selected = state.contactMessages.find((message) => message.id === selectedId);
    if (selected?.unread) {
      selected.unread = false;
      persistContacts();
    }
  }

  admin.querySelector("[data-mark-all-contacts]")?.addEventListener("click", () => {
    state.contactMessages.forEach((message) => { message.unread = false; });
    persistContacts();
    admin.renderRoute();
  });

  admin.querySelector("[data-delete-contact]")?.addEventListener("click", (event) => {
    if (!confirm("Excluir esta mensagem armazenada localmente?")) return;
    const id = event.currentTarget.dataset.deleteContact;
    state.contactMessages = state.contactMessages.filter((message) => message.id !== id);
    persistContacts();
    location.hash = "/admin/contatos";
  });
}

function bindNotifications(admin) {
  const center = admin.querySelector(".notification-center");
  const button = center?.querySelector("[data-notification-toggle]");
  const dropdown = center?.querySelector("[data-notification-dropdown]");
  if (!button || !dropdown) return;

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = dropdown.hidden;
    dropdown.hidden = !opening;
    button.setAttribute("aria-expanded", String(opening));
  });

  dropdown.addEventListener("click", (event) => {
    const contact = event.target.closest("[data-notification-contact]");
    if (contact) {
      const message = state.contactMessages.find((entry) => entry.id === contact.dataset.notificationContact);
      if (message) {
        message.unread = false;
        persistContacts();
      }
    }
  });
}

function bindSidebarToggle(admin) {
  const button = admin.querySelector("[data-sidebar-toggle]");
  const sidebar = admin.querySelector("#adminSidebar");
  const shell = admin.querySelector(".admin-shell");
  if (!button || !sidebar || !shell) return;

  const collapsed = localStorage.getItem(STORAGE.sidebar) === "1";
  shell.classList.toggle("sidebar-collapsed", collapsed);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (matchMedia("(max-width: 991.98px)").matches) {
      sidebar.classList.toggle("open");
      document.body.classList.toggle("admin-sidebar-open", sidebar.classList.contains("open"));
      return;
    }

    const next = !shell.classList.contains("sidebar-collapsed");
    shell.classList.toggle("sidebar-collapsed", next);
    localStorage.setItem(STORAGE.sidebar, next ? "1" : "0");
  }, true);

  sidebar.addEventListener("click", (event) => {
    if (
      matchMedia("(max-width: 991.98px)").matches
      && event.target.closest("a")
    ) {
      sidebar.classList.remove("open");
      document.body.classList.remove("admin-sidebar-open");
    }
  });
}

function decorateAdminShell(admin, current) {
  replaceAdminMenu(admin, current);
  bindSidebarToggle(admin);

  const topActions = admin.querySelector(".admin-top-actions");
  if (topActions) {
    topActions.querySelector(".notification-center, .notification-button")?.remove();
    topActions.insertAdjacentHTML("afterbegin", notificationsHtml());
  }

  bindNotifications(admin);
  if (current === "/admin/contatos") bindContactAdmin(admin);
}

function refreshAdminNotifications() {
  const admin = document.querySelector("admin-app");
  if (!admin?.querySelector(".admin-shell")) return;
  const topActions = admin.querySelector(".admin-top-actions");
  if (!topActions) return;
  topActions.querySelector(".notification-center, .notification-button")?.remove();
  topActions.insertAdjacentHTML("afterbegin", notificationsHtml());
  bindNotifications(admin);
}

if (adminPrototype && !adminPrototype.__isoconFunctionalPatch) {
  adminPrototype.__isoconFunctionalPatch = true;

  const originalShellTitle = adminPrototype.shellTitle;
  const originalRouteContent = adminPrototype.routeContent;
  const originalRenderShell = adminPrototype.renderShell;

  adminPrototype.shellTitle = function patchedShellTitle(current) {
    if (current === "/admin/contatos") return ["Contatos", "Mensagens recebidas pelo website"];
    if (current === "/admin/favoritos") return ["Favoritos", "Itens salvos pelos visitantes"];
    if (MODULES[current]) return [MODULES[current].title, MODULES[current].subtitle];
    return originalShellTitle.call(this, current);
  };

  adminPrototype.routeContent = function patchedRouteContent(current) {
    if (current === "/admin/contatos") return contactsView();
    if (current === "/admin/favoritos") return favoritesView();
    if (MODULES[current]) return preparationView(MODULES[current], current);
    return originalRouteContent.call(this, current);
  };

  adminPrototype.renderShell = function patchedRenderShell(current) {
    originalRenderShell.call(this, current);
    decorateAdminShell(this, current);
  };
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".notification-center")) {
    document.querySelectorAll("[data-notification-dropdown]").forEach((dropdown) => {
      dropdown.hidden = true;
    });
    document.querySelectorAll("[data-notification-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  if (
    document.body.classList.contains("admin-sidebar-open")
    && !event.target.closest("#adminSidebar")
    && !event.target.closest("[data-sidebar-toggle]")
  ) {
    document.querySelector("#adminSidebar")?.classList.remove("open");
    document.body.classList.remove("admin-sidebar-open");
  }
});

/*
 * O elemento raiz é importado por último. Assim o interceptor de fetch e os
 * métodos administrativos já estão instalados antes do primeiro render.
 */
await import("./chat-conversations-patch.js");
await import("./institutional-admin-presence-patch.js");
await import("./product-media-repo-patch.js");
await import("./asset-url-fallback-patch.js");
await import("./sidebar-implementation-section-patch.js");
await import("./app.js");

syncItemControls();
