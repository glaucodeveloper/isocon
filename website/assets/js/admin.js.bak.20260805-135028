
import {
  state, esc, slugify, route, findLine, findSegment,
  validatePat, githubReadCatalog, githubWriteCatalog, githubUploadFile
} from "./utils.js";

const template = String.raw;
const ADMIN_DRAFT_KEY = "isoconAdminDraft";

const emptyItem = () => ({
  id: "", code: "", ean: "", ncm: "", name: "", segmentId: "", lineId: "",
  category: "", subcategory: "", brand: "", shortDescription: "", description: "",
  status: "sob_consulta", publicationStatus: "rascunho", supplyCondition: "Sob consulta",
  unit: "unidade", minimumQuantity: 1, type: "produto", image: "", gallery: [],
  documents: [], attributes: {}, applications: [], benefits: [],
  logistics: {
    coverage: "Nacional",
    origin: "Conforme disponibilidade",
    modes: ["Rodoviário"],
    packaging: "Embalagem adequada ao tipo de produto",
    restrictions: "Prazo e modalidade definidos durante a cotação",
  },
  featured: false,
});

const statusLabel = {
  disponivel: "Disponível",
  sob_consulta: "Sob consulta",
  por_encomenda: "Por encomenda",
  indisponivel: "Temporariamente indisponível",
};
const publicationLabel = {
  rascunho: "Rascunho",
  revisao: "Em revisão",
  publicado: "Publicado",
  oculto: "Oculto",
  descontinuado: "Descontinuado",
};

function objectLines(object = {}) {
  return Object.entries(object).map(([key, value]) => `${key}: ${value}`).join("\n");
}
function parseObjectLines(text = "") {
  const result = {};
  text.split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const separator = line.indexOf(":");
    if (separator > 0) result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  });
  return result;
}
function listLines(text = "") {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}
function flash(message, tone = "success") {
  document.dispatchEvent(new CustomEvent("adminflash", { detail: { message, tone } }));
}

export class AdminApp extends HTMLElement {
  constructor() {
    super();
    this.profile = null;
    this.remote = null;
    this.step = 1;
    this.editing = null;
    this.search = "";
    this.filterStatus = "";
    this.filterLine = "";
    this.pendingFiles = { main: null, gallery: [], documents: [] };
    this._onHashChange = () => this.renderRoute();
    this._onFlash = (event) => this.showFlash(event.detail);
  }

  async connectedCallback() {
    window.addEventListener("hashchange", this._onHashChange);
    document.addEventListener("adminflash", this._onFlash);
    if (!state.token) return this.renderLogin();
    await this.openSession();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHashChange);
    document.removeEventListener("adminflash", this._onFlash);
  }

  renderLogin(message = "") {
    this.innerHTML = template`
      <main class="admin-login">
        <section class="admin-login-visual">
          <div class="admin-login-brand"><span class="brand-symbol">IS</span><span>ISOCON<small>GESTÃO DO CATÁLOGO B2B</small></span></div>
          <div><span class="red-line"></span><h1>Catálogo organizado.<br>Publicação controlada.</h1>
            <p>Cadastre segmentos, linhas e itens, revise a apresentação pública e publique as alterações diretamente no repositório oficial.</p></div>
          <ul><li><i class="bi bi-github"></i>Autorização validada pelo GitHub</li>
            <li><i class="bi bi-file-earmark-code"></i>Dados versionados em JSON</li>
            <li><i class="bi bi-cloud-arrow-up"></i>Publicação automática pelo GitHub Actions</li></ul>
        </section>
        <section class="admin-login-form">
          <form id="patLogin">
            <a href="#/" class="back-site"><i class="bi bi-arrow-left"></i>Voltar ao site</a>
            <div class="admin-login-lock"><i class="bi bi-shield-lock"></i></div>
            <h2>Área administrativa</h2>
            <p>Use um GitHub Personal Access Token com acesso ao repositório <code>glaucodeveloper/isocon</code>.</p>
            <label>GitHub PAT
              <div class="password-field"><input class="form-control form-control-lg" required type="password" autocomplete="current-password" name="token" placeholder="github_pat_...">
                <button type="button" data-show-password aria-label="Exibir token"><i class="bi bi-eye"></i></button></div>
            </label>
            <div class="pat-help"><i class="bi bi-info-circle"></i><span>Permissão necessária: <strong>Contents — Read and write</strong>. O token permanece somente nesta sessão do navegador.</span></div>
            <button class="btn btn-primary btn-lg w-100" type="submit"><i class="bi bi-github me-2"></i>Validar e entrar</button>
            <div class="admin-login-message ${message ? "show" : ""}" id="loginMessage">${esc(message)}</div>
          </form>
        </section>
      </main>`;
    this.querySelector("[data-show-password]")?.addEventListener("click", (event) => {
      const input = this.querySelector('input[name="token"]');
      input.type = input.type === "password" ? "text" : "password";
      event.currentTarget.innerHTML = `<i class="bi bi-${input.type === "password" ? "eye" : "eye-slash"}"></i>`;
    });
    this.querySelector("#patLogin")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const token = new FormData(event.currentTarget).get("token").trim();
      const messageBox = this.querySelector("#loginMessage");
      messageBox.className = "admin-login-message show loading";
      messageBox.textContent = "Validando o token e as permissões...";
      try {
        const result = await validatePat(token);
        state.token = token;
        sessionStorage.setItem("isoconPat", token);
        this.profile = result.profile;
        await this.openSession();
      } catch (error) {
        messageBox.className = "admin-login-message show error";
        messageBox.textContent = error.message;
      }
    });
  }

  async openSession() {
    try {
      if (!this.profile) this.profile = (await validatePat(state.token)).profile;
      this.remote = await githubReadCatalog(state.token);
      state.data = this.remote.data;
      this.renderRoute();
    } catch (error) {
      state.token = "";
      sessionStorage.removeItem("isoconPat");
      this.renderLogin(error.message);
    }
  }

  currentAdminRoute() {
    const value = route().split("?")[0];
    if (value === "/admin") return "/admin/dashboard";
    return value;
  }

  renderRoute() {
    if (!state.token || !state.data) return;
    const current = this.currentAdminRoute();
    if (current === "/admin/item/novo") {
      const draft = sessionStorage.getItem(ADMIN_DRAFT_KEY);
      this.editing = draft ? { ...emptyItem(), ...JSON.parse(draft) } : emptyItem();
      this.pendingFiles = { main: null, gallery: [], documents: [] };
      this.step = 1;
    } else if (current.startsWith("/admin/item/")) {
      const id = current.split("/").pop();
      this.editing = structuredClone(state.data.items.find((item) => item.id === id) || emptyItem());
      this.pendingFiles = { main: null, gallery: [], documents: [] };
      this.step = 1;
    } else {
      this.editing = null;
    }
    this.renderShell(current);
  }

  shellTitle(current) {
    if (current === "/admin/dashboard") return ["Dashboard", "Visão geral do catálogo"];
    if (current === "/admin/itens") return ["Itens", "Gerenciamento do catálogo"];
    if (current === "/admin/item/novo") return ["Adicionar novo item", "Cadastro e publicação"];
    if (current.startsWith("/admin/item/")) return ["Editar item", this.editing?.name || "Cadastro"];
    if (current === "/admin/segmentos") return ["Segmentos", "Áreas de fornecimento"];
    if (current === "/admin/linhas") return ["Linhas de produtos", "Famílias comerciais"];
    if (current === "/admin/configuracoes") return ["Configurações", "Integração e conteúdo"];
    return ["Administração", "ISOCON"];
  }

  renderShell(current) {
    const [title, subtitle] = this.shellTitle(current);
    const active = (path) => current === path || (path === "/admin/itens" && current.startsWith("/admin/item/"));
    this.innerHTML = template`
      <div class="admin-shell">
        <aside class="admin-sidebar" id="adminSidebar">
          <a class="admin-brand" href="#/admin/dashboard"><span class="brand-symbol">IS</span><span>ISOCON<small>ADMINISTRAÇÃO</small></span></a>
          <nav>
            <span class="admin-nav-label">MENU PRINCIPAL</span>
            <a class="${active("/admin/dashboard") ? "active" : ""}" href="#/admin/dashboard"><i class="bi bi-grid"></i>Dashboard</a>
            <button class="disabled-module"><i class="bi bi-file-earmark-text"></i>Solicitações<small>em preparação</small></button>
            <button class="disabled-module"><i class="bi bi-people"></i>Clientes<small>em preparação</small></button>
            <button class="disabled-module"><i class="bi bi-person-badge"></i>Fornecedores<small>em preparação</small></button>
            <span class="admin-nav-label">CATÁLOGO</span>
            <a class="${active("/admin/segmentos") ? "active" : ""}" href="#/admin/segmentos"><i class="bi bi-diagram-3"></i>Segmentos</a>
            <a class="${active("/admin/linhas") ? "active" : ""}" href="#/admin/linhas"><i class="bi bi-collection"></i>Linhas de produtos</a>
            <a class="${active("/admin/itens") ? "active" : ""}" href="#/admin/itens"><i class="bi bi-box"></i>Itens</a>
            <button class="disabled-module"><i class="bi bi-rulers"></i>Unidades de medida<small>embutidas nos itens</small></button>
            <button class="disabled-module"><i class="bi bi-sliders"></i>Atributos<small>configuração por item</small></button>
            <span class="admin-nav-label">CONFIGURAÇÕES</span>
            <a class="${active("/admin/configuracoes") ? "active" : ""}" href="#/admin/configuracoes"><i class="bi bi-gear"></i>Configurações</a>
            <button class="disabled-module"><i class="bi bi-journal-text"></i>Logs<small>histórico no Git</small></button>
          </nav>
          <aside class="admin-help"><i class="bi bi-headset"></i><div><strong>Precisa de ajuda?</strong><span>Consulte o guia técnico.</span></div></aside>
        </aside>

        <div class="admin-workspace">
          <header class="admin-topbar">
            <button class="admin-menu-toggle" data-sidebar-toggle><i class="bi bi-list"></i></button>
            <nav class="admin-breadcrumb"><span>Área Administrativa</span><i class="bi bi-chevron-right"></i><strong>${esc(title)}</strong></nav>
            <div class="admin-top-actions">
              <button class="notification-button"><i class="bi bi-bell"></i><span>1</span></button>
              <div class="admin-profile"><img src="${esc(this.profile?.avatar_url || "")}" alt=""><div><strong>${esc(this.profile?.name || this.profile?.login || "Administrador")}</strong><span>${esc(this.profile?.login || "")}@github</span></div><i class="bi bi-chevron-down"></i></div>
            </div>
          </header>
          <main class="admin-main">
            <div class="admin-page-title"><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>
              ${current === "/admin/itens" ? `<a class="btn btn-primary" href="#/admin/item/novo"><i class="bi bi-plus-lg me-2"></i>Adicionar novo</a>` : ""}
              ${current.startsWith("/admin/item/") ? `<a class="btn btn-outline-primary" href="#/admin/itens"><i class="bi bi-arrow-left me-2"></i>Voltar para lista</a>` : ""}
            </div>
            <div id="adminFlash" class="admin-flash"></div>
            ${this.routeContent(current)}
          </main>
        </div>
      </div>`;

    this.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => this.querySelector("#adminSidebar")?.classList.toggle("open"));
    if (current === "/admin/dashboard") this.bindDashboard();
    if (current === "/admin/itens") this.bindItemsList();
    if (current.startsWith("/admin/item/")) this.bindItemForm();
    if (current === "/admin/segmentos") this.bindEntityManager("segments");
    if (current === "/admin/linhas") this.bindEntityManager("lines");
    if (current === "/admin/configuracoes") this.bindSettings();
  }

  routeContent(current) {
    if (current === "/admin/dashboard") return this.dashboardView();
    if (current === "/admin/itens") return this.itemsView();
    if (current.startsWith("/admin/item/")) return this.itemFormView();
    if (current === "/admin/segmentos") return this.entityView("segments");
    if (current === "/admin/linhas") return this.entityView("lines");
    if (current === "/admin/configuracoes") return this.settingsView();
    return this.dashboardView();
  }

  dashboardView() {
    const counts = {
      items: state.data.items.length,
      published: state.data.items.filter((item) => item.publicationStatus === "publicado").length,
      drafts: state.data.items.filter((item) => item.publicationStatus === "rascunho").length,
      segments: state.data.segments.length,
      lines: state.data.lines.length,
    };
    const recent = state.data.items.slice(-5).reverse();
    return template`
      <section class="admin-stat-grid">
        <article><i class="bi bi-box"></i><span>Itens cadastrados</span><strong>${counts.items}</strong><small>Todos os estados</small></article>
        <article><i class="bi bi-eye"></i><span>Itens publicados</span><strong>${counts.published}</strong><small>Visíveis no catálogo</small></article>
        <article><i class="bi bi-pencil-square"></i><span>Rascunhos</span><strong>${counts.drafts}</strong><small>Aguardando conclusão</small></article>
        <article><i class="bi bi-diagram-3"></i><span>Estrutura</span><strong>${counts.segments} / ${counts.lines}</strong><small>Segmentos / linhas</small></article>
      </section>
      <section class="admin-dashboard-grid">
        <article class="admin-panel">
          <div class="panel-heading"><div><h2>Itens recentes</h2><p>Últimos registros do catálogo.</p></div><a href="#/admin/itens">Ver todos</a></div>
          <div class="recent-admin-list">${recent.map((item) => `<a href="#/admin/item/${item.id}">
            <img src="${esc(item.image)}" alt=""><div><strong>${esc(item.name)}</strong><span>${esc(item.code)} · ${esc(findLine(item.lineId)?.name || "")}</span></div>
            <em class="publication publication-${item.publicationStatus}">${esc(publicationLabel[item.publicationStatus] || item.publicationStatus)}</em><i class="bi bi-chevron-right"></i>
          </a>`).join("")}</div>
        </article>
        <aside class="admin-panel admin-publication-panel"><div class="panel-heading"><div><h2>Publicação</h2><p>Repositório e estado da integração.</p></div></div>
          <div class="github-status"><i class="bi bi-github"></i><div><strong>glaucodeveloper/isocon</strong><span>Branch main</span></div><b>Conectado</b></div>
          <dl><div><dt>Arquivo</dt><dd>website/data/catalog.json</dd></div><div><dt>Modo</dt><dd>Commit pela Contents API</dd></div><div><dt>Deploy</dt><dd>GitHub Pages Actions</dd></div></dl>
          <a class="btn btn-outline-primary w-100" href="#/admin/configuracoes">Ver configurações</a>
        </aside>
      </section>
      <section class="admin-panel admin-quick-actions"><div class="panel-heading"><div><h2>Ações rápidas</h2><p>Continue o gerenciamento do catálogo.</p></div></div>
        <div><a href="#/admin/item/novo"><i class="bi bi-plus-square"></i><span><strong>Novo item</strong><small>Cadastrar e publicar.</small></span></a>
          <a href="#/admin/segmentos"><i class="bi bi-diagram-3"></i><span><strong>Segmentos</strong><small>Revisar áreas de fornecimento.</small></span></a>
          <a href="#/admin/linhas"><i class="bi bi-collection"></i><span><strong>Linhas</strong><small>Organizar famílias de itens.</small></span></a>
          <a href="#/"><i class="bi bi-window"></i><span><strong>Visualizar site</strong><small>Abrir a interface pública.</small></span></a></div>
      </section>`;
  }

  bindDashboard() {}

  itemsView() {
    let entries = state.data.items;
    if (this.search) {
      const needle = this.search.toLowerCase();
      entries = entries.filter((item) => `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(needle));
    }
    if (this.filterStatus) entries = entries.filter((item) => item.publicationStatus === this.filterStatus);
    if (this.filterLine) entries = entries.filter((item) => item.lineId === this.filterLine);
    return template`
      <section class="admin-panel">
        <form class="admin-list-filters" id="adminItemFilters">
          <div class="admin-search"><i class="bi bi-search"></i><input class="form-control" name="search" value="${esc(this.search)}" placeholder="Buscar por nome, código ou categoria..."></div>
          <select class="form-select" name="status"><option value="">Todos os estados</option>${Object.entries(publicationLabel).map(([value, label]) => `<option value="${value}" ${this.filterStatus === value ? "selected" : ""}>${label}</option>`).join("")}</select>
          <select class="form-select" name="line"><option value="">Todas as linhas</option>${state.data.lines.map((line) => `<option value="${line.id}" ${this.filterLine === line.id ? "selected" : ""}>${esc(line.name)}</option>`).join("")}</select>
          <button class="btn btn-primary">Filtrar</button><button class="btn btn-outline-secondary" type="button" data-clear-filters>Limpar</button>
        </form>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Item</th><th>Classificação</th><th>Fornecimento</th><th>Publicação</th><th>Atualização</th><th></th></tr></thead>
          <tbody>${entries.map((item) => `<tr><td><div class="admin-item-cell"><img src="${esc(item.image)}" alt=""><div><strong>${esc(item.name)}</strong><span>${esc(item.code)}</span></div></div></td>
            <td><strong>${esc(findLine(item.lineId)?.name || "")}</strong><span>${esc(item.category || "")}</span></td>
            <td><span class="availability availability-${item.status}">${esc(statusLabel[item.status] || item.status)}</span><small>${esc(item.supplyCondition)}</small></td>
            <td><span class="publication publication-${item.publicationStatus}">${esc(publicationLabel[item.publicationStatus] || item.publicationStatus)}</span></td>
            <td><span>Versionado no Git</span><small>${item.featured ? "Item em destaque" : "Item regular"}</small></td>
            <td><div class="table-actions"><a href="#/item/${item.id}" target="_blank" title="Visualizar"><i class="bi bi-eye"></i></a><a href="#/admin/item/${item.id}" title="Editar"><i class="bi bi-pencil"></i></a><button data-item-menu="${item.id}"><i class="bi bi-three-dots-vertical"></i></button></div></td></tr>`).join("") || `<tr><td colspan="6" class="empty-table">Nenhum item corresponde aos filtros.</td></tr>`}</tbody>
        </table></div>
        <footer class="admin-table-footer"><span>${entries.length} de ${state.data.items.length} itens</span><div><button disabled><i class="bi bi-chevron-left"></i></button><button class="active">1</button><button disabled><i class="bi bi-chevron-right"></i></button></div></footer>
      </section>`;
  }

  bindItemsList() {
    this.querySelector("#adminItemFilters")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      this.search = form.get("search").trim();
      this.filterStatus = form.get("status");
      this.filterLine = form.get("line");
      this.renderShell("/admin/itens");
    });
    this.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
      this.search = ""; this.filterStatus = ""; this.filterLine = ""; this.renderShell("/admin/itens");
    });
    this.querySelectorAll("[data-item-menu]").forEach((button) => button.addEventListener("click", () => {
      const item = state.data.items.find((entry) => entry.id === button.dataset.itemMenu);
      if (!item) return;
      const action = item.publicationStatus === "oculto" ? "publicado" : "oculto";
      if (confirm(`Alterar o estado de “${item.name}” para ${publicationLabel[action]}?`)) {
        item.publicationStatus = action;
        this.persistCatalog(`Altera publicação do item ${item.name}`).then(() => this.renderShell("/admin/itens"));
      }
    }));
  }

  itemFormView() {
    const item = this.editing || emptyItem();
    const steps = [
      ["Informações básicas", "Identificação e classificação"],
      ["Detalhes e atributos", "Aplicações e especificações"],
      ["Fornecimento e disponibilidade", "Condições e logística"],
      ["Imagens e documentos", "Mídia do catálogo"],
      ["Revisão", "Confirme e publique"],
    ];
    return template`
      <section class="admin-panel admin-form-panel">
        <nav class="form-stepper">${steps.map(([title, text], index) => {
          const number = index + 1;
          return `<button class="${this.step === number ? "active" : ""} ${this.step > number ? "done" : ""}" type="button" data-step="${number}">
            <span>${this.step > number ? '<i class="bi bi-check-lg"></i>' : number}</span><div><strong>${title}</strong><small>${text}</small></div></button>`;
        }).join("")}</nav>
        <form id="adminItemForm" novalidate>
          ${this.formStepOne(item)}
          ${this.formStepTwo(item)}
          ${this.formStepThree(item)}
          ${this.formStepFour(item)}
          ${this.formStepFive(item)}
          <footer class="admin-form-footer">
            <div class="form-tip"><i class="bi bi-lightbulb"></i><div><strong>Dicas importantes</strong><span>Campos com * são obrigatórios. Revise as descrições e a classificação antes de publicar.</span></div></div>
            <div class="admin-form-actions">
              <a class="btn btn-outline-secondary" href="#/admin/itens">Cancelar</a>
              <button class="btn btn-outline-primary" type="button" data-save-later>Salvar e continuar depois</button>
              ${this.step > 1 ? `<button class="btn btn-outline-primary" type="button" data-previous><i class="bi bi-arrow-left me-2"></i>Anterior</button>` : ""}
              ${this.step < 5 ? `<button class="btn btn-primary" type="button" data-next>Próximo passo <i class="bi bi-arrow-right ms-2"></i></button>` :
                `<button class="btn btn-primary" type="submit"><i class="bi bi-github me-2"></i>Salvar e publicar</button>`}
            </div>
          </footer>
        </form>
      </section>`;
  }

  formStepOne(item) {
    const lines = item.segmentId ? state.data.lines.filter((line) => line.segmentId === item.segmentId) : state.data.lines;
    return template`<section class="form-step ${this.step === 1 ? "active" : ""}" data-form-step="1"><div class="form-section-title"><h2>Informações básicas</h2><p>Dados principais usados no catálogo e na administração.</p></div>
      <div class="form-layout"><div class="form-main-fields">
        <div class="row g-3">
          <div class="col-12"><label>Código do item *<input class="form-control" required name="code" value="${esc(item.code)}" placeholder="Ex.: ISO-TI-000123"><small>Código único de identificação.</small></label></div>
          <div class="col-12"><label>Nome do item *<input class="form-control" required name="name" value="${esc(item.name)}" placeholder="Nome completo e descritivo"><small>Será usado como título público.</small></label></div>
          <div class="col-md-6"><label>Segmento *<select class="form-select" required name="segmentId"><option value="">Selecione</option>${state.data.segments.map((segment) => `<option value="${segment.id}" ${segment.id === item.segmentId ? "selected" : ""}>${esc(segment.name)}</option>`).join("")}</select></label></div>
          <div class="col-md-6"><label>Linha de produto *<select class="form-select" required name="lineId"><option value="">Selecione</option>${lines.map((line) => `<option value="${line.id}" ${line.id === item.lineId ? "selected" : ""}>${esc(line.name)}</option>`).join("")}</select></label></div>
          <div class="col-md-6"><label>Categoria *<input class="form-control" required name="category" value="${esc(item.category)}" placeholder="Ex.: Computadores e Notebooks"></label></div>
          <div class="col-md-6"><label>Subcategoria<input class="form-control" name="subcategory" value="${esc(item.subcategory)}" placeholder="Ex.: Notebooks corporativos"></label></div>
          <div class="col-md-6"><label>Marca <span class="optional">(opcional e secundária)</span><input class="form-control" name="brand" value="${esc(item.brand)}"></label></div>
          <div class="col-md-6"><label>Condição comercial *<input class="form-control" required name="supplyCondition" value="${esc(item.supplyCondition)}" placeholder="Sob consulta / fornecimento em volume"></label></div>
          <div class="col-12"><label>Descrição curta *<textarea class="form-control" required maxlength="180" rows="2" name="shortDescription" placeholder="Resumo exibido nos cartões">${esc(item.shortDescription)}</textarea><small><span data-short-count>${item.shortDescription.length}</span>/180 caracteres</small></label></div>
          <div class="col-12"><label>Descrição completa *<textarea class="form-control" required maxlength="2200" rows="5" name="description" placeholder="Aplicações, capacidades e contexto de fornecimento">${esc(item.description)}</textarea><small><span data-description-count>${item.description.length}</span>/2200 caracteres</small></label></div>
        </div>
      </div><aside class="form-side-fields">
        <label>Código de barras (EAN)<input class="form-control" name="ean" value="${esc(item.ean)}" placeholder="7891234567890"><small>Opcional.</small></label>
        <label>NCM<input class="form-control" name="ncm" value="${esc(item.ncm)}" placeholder="84713019"><small>Classificação fiscal.</small></label>
        <label>Unidade de fornecimento *<select class="form-select" name="unit">${["unidade","caixa","pacote","conjunto","metro","quilo","litro"].map((unit) => `<option ${unit === item.unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
        <fieldset><legend>Tipo de item *</legend><label class="radio-card"><input type="radio" name="type" value="produto" ${item.type !== "servico" ? "checked" : ""}><span><strong>Produto</strong><small>Item físico para fornecimento.</small></span></label><label class="radio-card"><input type="radio" name="type" value="servico" ${item.type === "servico" ? "checked" : ""}><span><strong>Serviço</strong><small>Serviço relacionado à solução.</small></span></label></fieldset>
        <label>Estado de publicação *<select class="form-select" name="publicationStatus">${Object.entries(publicationLabel).map(([value,label]) => `<option value="${value}" ${value === item.publicationStatus ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="switch-field"><input type="checkbox" name="featured" ${item.featured ? "checked" : ""}><span></span><div><strong>Item em destaque</strong><small>Aparece em seleções prioritárias.</small></div></label>
      </aside></div>
    </section>`;
  }

  formStepTwo(item) {
    return template`<section class="form-step ${this.step === 2 ? "active" : ""}" data-form-step="2"><div class="form-section-title"><h2>Detalhes e atributos</h2><p>Propriedades que ajudam o cliente e o consultor a compreender o item.</p></div>
      <div class="detail-form-grid">
        <div><label>Aplicações <span class="optional">(uma por linha)</span><textarea class="form-control" rows="8" name="applications" placeholder="Escritórios&#10;Equipes administrativas&#10;Trabalho híbrido">${esc((item.applications || []).join("\n"))}</textarea></label>
          <div class="field-guidance"><i class="bi bi-lightbulb"></i><span>Descreva onde o item pode ser aplicado, sem transformar aplicações em palavras-chave genéricas.</span></div></div>
        <div><label>Benefícios <span class="optional">(um por linha)</span><textarea class="form-control" rows="8" name="benefits" placeholder="Configuração corporativa&#10;Fornecimento nacional&#10;Suporte consultivo">${esc((item.benefits || []).join("\n"))}</textarea></label>
          <div class="field-guidance"><i class="bi bi-lightbulb"></i><span>Use benefícios objetivos relacionados à capacidade do item e ao fornecimento.</span></div></div>
        <div class="attributes-editor"><label>Atributos técnicos <span class="optional">(Nome: valor)</span><textarea class="form-control code-textarea" rows="12" name="attributes" placeholder="Processador: Intel Core i5&#10;Memória: 8 GB RAM&#10;Armazenamento: SSD 256 GB">${esc(objectLines(item.attributes))}</textarea></label>
          <div class="attribute-preview"><h3>Prévia da tabela</h3><div data-attribute-preview>${Object.entries(item.attributes || {}).map(([key,value]) => `<div><strong>${esc(key)}</strong><span>${esc(value)}</span></div>`).join("") || "<p>Adicione atributos para visualizar.</p>"}</div></div></div>
      </div>
    </section>`;
  }

  formStepThree(item) {
    const modes = ["Rodoviário","Aéreo","Carga fracionada","Carga dedicada","Cross docking","Retirada"];
    return template`<section class="form-step ${this.step === 3 ? "active" : ""}" data-form-step="3"><div class="form-section-title"><h2>Fornecimento e disponibilidade</h2><p>Informações comerciais e logísticas sem formar checkout ou promessa automática.</p></div>
      <div class="supply-grid">
        <div class="admin-field-card"><h3>Disponibilidade</h3>
          <label>Status de fornecimento<select class="form-select" name="status">${Object.entries(statusLabel).map(([value,label]) => `<option value="${value}" ${value === item.status ? "selected" : ""}>${label}</option>`).join("")}</select></label>
          <label>Quantidade inicial / mínima<input class="form-control" type="number" min="1" name="minimumQuantity" value="${item.minimumQuantity || 1}"><small>Orientação comercial; não bloqueia uma solicitação.</small></label>
          <div class="availability-explanation"><i class="bi bi-info-circle"></i><span>Disponibilidade pública e quantidade estimada não representam reserva de estoque.</span></div>
        </div>
        <div class="admin-field-card"><h3>Cobertura</h3>
          <label>Cobertura logística<input class="form-control" name="coverage" value="${esc(item.logistics?.coverage || "Nacional")}"></label>
          <label>Origem de expedição<input class="form-control" name="origin" value="${esc(item.logistics?.origin || "Conforme disponibilidade")}"></label>
          <div class="partner-warning"><i class="bi bi-truck"></i><span>A comunicação deve citar transportadoras e parceiros logísticos. Não afirmar frota própria.</span></div>
        </div>
        <div class="admin-field-card supply-modes"><h3>Modalidades possíveis</h3>${modes.map((mode) => `<label><input type="checkbox" name="modes" value="${mode}" ${(item.logistics?.modes || []).includes(mode) ? "checked" : ""}><span><i class="bi bi-check"></i>${mode}</span></label>`).join("")}</div>
        <div class="admin-field-card"><h3>Preparação e restrições</h3>
          <label>Embalagem<textarea class="form-control" rows="4" name="packaging">${esc(item.logistics?.packaging || "")}</textarea></label>
          <label>Condições e restrições<textarea class="form-control" rows="4" name="restrictions">${esc(item.logistics?.restrictions || "")}</textarea></label>
        </div>
      </div>
    </section>`;
  }

  formStepFour(item) {
    return template`<section class="form-step ${this.step === 4 ? "active" : ""}" data-form-step="4"><div class="form-section-title"><h2>Imagens e documentos</h2><p>Defina a imagem principal, galeria e arquivos de apoio.</p></div>
      <div class="media-form-grid">
        <div class="admin-field-card"><h3>Imagem principal</h3>
          <div class="image-preview" data-main-preview>${item.image ? `<img src="${esc(item.image)}" alt="">` : `<i class="bi bi-image"></i><span>Nenhuma imagem selecionada</span>`}</div>
          <label>URL atual<input class="form-control" name="image" value="${esc(item.image)}" placeholder="./assets/uploads/items/..."></label>
          <label class="upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" name="mainImageFile"><i class="bi bi-cloud-arrow-up"></i><strong>Enviar nova imagem</strong><span>${this.pendingFiles.main ? esc(this.pendingFiles.main.name) : "PNG, JPG ou WebP até 8 MB"}</span></label>
        </div>
        <div class="admin-field-card"><h3>Galeria</h3>
          <div class="gallery-preview">${(item.gallery || []).map((image) => `<figure><img src="${esc(image)}" alt=""><figcaption>${esc(image.split("/").pop())}</figcaption></figure>`).join("") || `<p>Nenhuma imagem adicional.</p>`}</div>
          <label class="upload-zone"><input type="file" multiple accept="image/png,image/jpeg,image/webp" name="galleryFiles"><i class="bi bi-images"></i><strong>Adicionar imagens</strong><span>${this.pendingFiles.gallery.length ? `${this.pendingFiles.gallery.length} arquivo(s) selecionado(s)` : "Seleção múltipla"}</span></label>
          <input type="hidden" name="galleryExisting" value="${esc(JSON.stringify(item.gallery || []))}">
        </div>
        <div class="admin-field-card documents-card"><h3>Documentos</h3>
          <div class="document-preview">${(item.documents || []).map((document) => `<div><i class="bi bi-file-earmark-pdf"></i><span>${esc(document.name || document.url || document)}</span></div>`).join("") || `<p>Nenhum documento anexado.</p>`}</div>
          <label class="upload-zone"><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" name="documentFiles"><i class="bi bi-file-earmark-arrow-up"></i><strong>Adicionar documentos</strong><span>${this.pendingFiles.documents.length ? `${this.pendingFiles.documents.length} arquivo(s) selecionado(s)` : "Ficha técnica, catálogo ou especificação"}</span></label>
          <input type="hidden" name="documentsExisting" value="${esc(JSON.stringify(item.documents || []))}">
        </div>
      </div>
    </section>`;
  }

  formStepFive(item) {
    const segment = findSegment(item.segmentId);
    const line = findLine(item.lineId);
    return template`<section class="form-step ${this.step === 5 ? "active" : ""}" data-form-step="5"><div class="form-section-title"><h2>Revisão</h2><p>Confirme os dados antes de gerar o commit no repositório.</p></div>
      <div class="review-grid">
        <article class="review-public-card"><div class="review-image">${item.image ? `<img src="${esc(item.image)}" alt="">` : `<i class="bi bi-image"></i>`}</div>
          <div><span class="availability availability-${item.status}">${esc(statusLabel[item.status] || item.status)}</span><h3>${esc(item.name || "Nome do item")}</h3><p>${esc(item.shortDescription || "Descrição curta do item.")}</p>
            <strong>${esc(item.supplyCondition || "Sob consulta")}</strong></div></article>
        <article class="review-summary"><h3>Identificação</h3><dl><div><dt>Código</dt><dd>${esc(item.code || "—")}</dd></div><div><dt>EAN</dt><dd>${esc(item.ean || "—")}</dd></div><div><dt>NCM</dt><dd>${esc(item.ncm || "—")}</dd></div><div><dt>Tipo</dt><dd>${esc(item.type)}</dd></div></dl></article>
        <article class="review-summary"><h3>Classificação</h3><dl><div><dt>Segmento</dt><dd>${esc(segment?.name || "—")}</dd></div><div><dt>Linha</dt><dd>${esc(line?.name || "—")}</dd></div><div><dt>Categoria</dt><dd>${esc(item.category || "—")}</dd></div><div><dt>Publicação</dt><dd>${esc(publicationLabel[item.publicationStatus] || item.publicationStatus)}</dd></div></dl></article>
        <article class="review-summary"><h3>Logística</h3><dl><div><dt>Cobertura</dt><dd>${esc(item.logistics?.coverage || "—")}</dd></div><div><dt>Origem</dt><dd>${esc(item.logistics?.origin || "—")}</dd></div><div><dt>Modalidades</dt><dd>${esc((item.logistics?.modes || []).join(", ") || "—")}</dd></div></dl></article>
        <aside class="commit-summary"><i class="bi bi-github"></i><div><h3>O que acontecerá ao salvar</h3><ol><li>Arquivos selecionados serão enviados para <code>website/assets/uploads</code>.</li><li>O catálogo será atualizado em <code>website/data/catalog.json</code>.</li><li>O GitHub registrará um commit.</li><li>O workflow do Pages publicará a nova versão.</li></ol></div></aside>
      </div>
    </section>`;
  }

  collectForm() {
    const form = this.querySelector("#adminItemForm");
    const data = new FormData(form);
    const current = this.editing || emptyItem();
    return {
      ...current,
      id: current.id || slugify(data.get("name")),
      code: data.get("code")?.trim() || current.code,
      ean: data.get("ean")?.trim() || "",
      ncm: data.get("ncm")?.trim() || "",
      name: data.get("name")?.trim() || current.name,
      segmentId: data.get("segmentId") || current.segmentId,
      lineId: data.get("lineId") || current.lineId,
      category: data.get("category")?.trim() || current.category,
      subcategory: data.get("subcategory")?.trim() || "",
      brand: data.get("brand")?.trim() || "",
      shortDescription: data.get("shortDescription")?.trim() || current.shortDescription,
      description: data.get("description")?.trim() || current.description,
      status: data.get("status") || current.status,
      publicationStatus: data.get("publicationStatus") || current.publicationStatus,
      supplyCondition: data.get("supplyCondition")?.trim() || current.supplyCondition,
      unit: data.get("unit") || current.unit,
      minimumQuantity: Math.max(1, Number(data.get("minimumQuantity") || current.minimumQuantity || 1)),
      type: data.get("type") || current.type,
      image: data.get("image")?.trim() || current.image,
      gallery: JSON.parse(data.get("galleryExisting") || JSON.stringify(current.gallery || [])),
      documents: JSON.parse(data.get("documentsExisting") || JSON.stringify(current.documents || [])),
      attributes: parseObjectLines(data.get("attributes") || objectLines(current.attributes)),
      applications: listLines(data.get("applications") || (current.applications || []).join("\n")),
      benefits: listLines(data.get("benefits") || (current.benefits || []).join("\n")),
      logistics: {
        coverage: data.get("coverage")?.trim() || current.logistics?.coverage || "Nacional",
        origin: data.get("origin")?.trim() || current.logistics?.origin || "Conforme disponibilidade",
        modes: data.getAll("modes").length ? data.getAll("modes") : current.logistics?.modes || [],
        packaging: data.get("packaging")?.trim() || current.logistics?.packaging || "",
        restrictions: data.get("restrictions")?.trim() || current.logistics?.restrictions || "",
      },
      featured: data.get("featured") === "on",
    };
  }

  restoreFormState(item) {
    this.editing = item;
  }

  validateStep(step) {
    const panel = this.querySelector(`[data-form-step="${step}"]`);
    const fields = [...panel.querySelectorAll("[required]")];
    for (const field of fields) {
      if (!field.checkValidity()) {
        field.reportValidity();
        field.focus();
        return false;
      }
    }
    return true;
  }

  bindItemForm() {
    const form = this.querySelector("#adminItemForm");
    const captureFiles = () => {
      const main = form?.elements.mainImageFile?.files?.[0];
      const gallery = [...(form?.elements.galleryFiles?.files || [])];
      const documents = [...(form?.elements.documentFiles?.files || [])];
      if (main) this.pendingFiles.main = main;
      if (gallery.length) this.pendingFiles.gallery = gallery;
      if (documents.length) this.pendingFiles.documents = documents;
    };
    const preserveAndRender = (nextStep) => {
      captureFiles();
      this.restoreFormState(this.collectForm());
      this.step = nextStep;
      this.renderShell(this.currentAdminRoute());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    this.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => {
      const requested = Number(button.dataset.step);
      if (requested <= this.step || this.validateStep(this.step)) preserveAndRender(requested);
    }));
    this.querySelector("[data-next]")?.addEventListener("click", () => {
      if (this.validateStep(this.step)) preserveAndRender(Math.min(5, this.step + 1));
    });
    this.querySelector("[data-previous]")?.addEventListener("click", () => preserveAndRender(Math.max(1, this.step - 1)));
    this.querySelector("[data-save-later]")?.addEventListener("click", () => {
      const draft = this.collectForm();
      draft.publicationStatus = "rascunho";
      sessionStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(draft));
      flash("Rascunho preservado nesta sessão. Use “Salvar e publicar” para gravá-lo no GitHub.", "info");
    });
    this.querySelector('select[name="segmentId"]')?.addEventListener("change", () => {
      this.restoreFormState(this.collectForm());
      this.editing.segmentId = this.querySelector('select[name="segmentId"]').value;
      this.editing.lineId = "";
      this.renderShell(this.currentAdminRoute());
    });
    const short = this.querySelector('[name="shortDescription"]');
    short?.addEventListener("input", () => { this.querySelector("[data-short-count]").textContent = short.value.length; });
    const description = this.querySelector('[name="description"]');
    description?.addEventListener("input", () => { this.querySelector("[data-description-count]").textContent = description.value.length; });
    const attributes = this.querySelector('[name="attributes"]');
    attributes?.addEventListener("input", () => {
      const preview = this.querySelector("[data-attribute-preview]");
      const parsed = parseObjectLines(attributes.value);
      preview.innerHTML = Object.entries(parsed).map(([key,value]) => `<div><strong>${esc(key)}</strong><span>${esc(value)}</span></div>`).join("") || "<p>Adicione atributos para visualizar.</p>";
    });
    const imageUrl = this.querySelector('[name="image"]');
    imageUrl?.addEventListener("input", () => {
      const preview = this.querySelector("[data-main-preview]");
      preview.innerHTML = imageUrl.value ? `<img src="${esc(imageUrl.value)}" alt="">` : `<i class="bi bi-image"></i><span>Nenhuma imagem selecionada</span>`;
    });
    form?.elements.mainImageFile?.addEventListener("change", () => {
      const file = form.elements.mainImageFile.files?.[0];
      if (!file) return;
      this.pendingFiles.main = file;
      const preview = this.querySelector("[data-main-preview]");
      const url = URL.createObjectURL(file);
      preview.innerHTML = `<img src="${url}" alt="">`;
    });
    form?.elements.galleryFiles?.addEventListener("change", () => {
      this.pendingFiles.gallery = [...form.elements.galleryFiles.files];
    });
    form?.elements.documentFiles?.addEventListener("change", () => {
      this.pendingFiles.documents = [...form.elements.documentFiles.files];
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!this.validateStep(1)) {
        this.restoreFormState(this.collectForm());
        this.step = 1;
        this.renderShell(this.currentAdminRoute());
        return;
      }
      const item = this.collectForm();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Enviando arquivos e catálogo...';
      try {
        captureFiles();
        const mainImage = this.pendingFiles.main;
        if (mainImage) item.image = await githubUploadFile(state.token, mainImage, item.id, "items");
        const galleryFiles = this.pendingFiles.gallery;
        for (const file of galleryFiles) {
          const url = await githubUploadFile(state.token, file, item.id, "gallery");
          if (url) item.gallery.push(url);
        }
        const documentFiles = this.pendingFiles.documents;
        for (const file of documentFiles) {
          const url = await githubUploadFile(state.token, file, item.id, "documents");
          if (url) item.documents.push({ name: file.name, url });
        }
        const index = state.data.items.findIndex((entry) => entry.id === item.id);
        if (index >= 0) state.data.items[index] = item;
        else state.data.items.push(item);
        await this.persistCatalog(`${index >= 0 ? "Atualiza" : "Adiciona"} item ${item.name}`);
        sessionStorage.removeItem(ADMIN_DRAFT_KEY);
        flash(`Item “${item.name}” salvo no GitHub.`, "success");
        location.hash = "/admin/itens";
      } catch (error) {
        flash(error.message, "error");
        submit.disabled = false;
        submit.innerHTML = '<i class="bi bi-github me-2"></i>Salvar e publicar';
      }
    });
  }

  entityView(kind) {
    const isSegments = kind === "segments";
    const entries = state.data[kind];
    return template`
      <section class="admin-panel entity-manager">
        <div class="panel-heading"><div><h2>${isSegments ? "Segmentos de fornecimento" : "Linhas de produtos"}</h2><p>Edite textos e relações usados pela navegação pública.</p></div>
          <button class="btn btn-primary" data-add-entity="${kind}"><i class="bi bi-plus-lg me-2"></i>Adicionar</button></div>
        <div class="entity-list">${entries.map((entry) => `<article data-entity="${entry.id}">
          <img src="${esc(entry.image)}" alt=""><div><small>${isSegments ? "SEGMENTO" : esc(findSegment(entry.segmentId)?.name || "LINHA")}</small><h3>${esc(entry.name)}</h3><p>${esc(entry.description)}</p></div>
          <div class="entity-count"><strong>${isSegments ? state.data.lines.filter((line) => line.segmentId === entry.id).length : state.data.items.filter((item) => item.lineId === entry.id).length}</strong><span>${isSegments ? "linhas" : "itens"}</span></div>
          <button data-edit-entity="${entry.id}"><i class="bi bi-pencil"></i></button></article>`).join("")}</div>
      </section>
      <dialog class="entity-dialog" id="entityDialog"><form method="dialog" id="entityForm"><header><h2 data-dialog-title></h2><button value="cancel"><i class="bi bi-x-lg"></i></button></header>
        <input type="hidden" name="id"><label>Nome *<input class="form-control" required name="name"></label>
        ${isSegments ? `<label>Ícone Bootstrap<input class="form-control" name="icon" placeholder="bi-laptop"></label>` :
          `<label>Segmento *<select class="form-select" required name="segmentId">${state.data.segments.map((segment) => `<option value="${segment.id}">${esc(segment.name)}</option>`).join("")}</select></label>`}
        <label>Descrição *<textarea class="form-control" rows="4" required name="description"></textarea></label>
        <label>Imagem<input class="form-control" name="image" placeholder="./assets/images/..."></label>
        <label>Exemplos <span class="optional">(um por linha)</span><textarea class="form-control" rows="6" name="examples"></textarea></label>
        <footer><button class="btn btn-outline-secondary" value="cancel">Cancelar</button><button class="btn btn-primary" value="default" type="submit">Salvar no GitHub</button></footer>
      </form></dialog>`;
  }

  bindEntityManager(kind) {
    const dialog = this.querySelector("#entityDialog");
    const form = this.querySelector("#entityForm");
    const isSegments = kind === "segments";
    const open = (entry = null) => {
      form.reset();
      form.elements.id.value = entry?.id || "";
      form.elements.name.value = entry?.name || "";
      form.elements.description.value = entry?.description || "";
      form.elements.image.value = entry?.image || "";
      form.elements.examples.value = (entry?.examples || []).join("\n");
      if (isSegments) form.elements.icon.value = entry?.icon || "bi-grid";
      else form.elements.segmentId.value = entry?.segmentId || state.data.segments[0]?.id || "";
      this.querySelector("[data-dialog-title]").textContent = entry ? `Editar ${entry.name}` : `Adicionar ${isSegments ? "segmento" : "linha"}`;
      dialog.showModal();
    };
    this.querySelector("[data-add-entity]")?.addEventListener("click", () => open());
    this.querySelectorAll("[data-edit-entity]").forEach((button) => button.addEventListener("click", () => {
      open(state.data[kind].find((entry) => entry.id === button.dataset.editEntity));
    }));
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const data = new FormData(form);
      const id = data.get("id") || slugify(data.get("name"));
      const previous = state.data[kind].find((entry) => entry.id === id);
      const entry = {
        ...(previous || {}),
        id, name: data.get("name").trim(), description: data.get("description").trim(),
        image: data.get("image").trim(), examples: listLines(data.get("examples")),
        ...(isSegments ? { icon: data.get("icon").trim() || "bi-grid" } : { segmentId: data.get("segmentId") }),
      };
      const index = state.data[kind].findIndex((candidate) => candidate.id === id);
      if (index >= 0) state.data[kind][index] = entry;
      else state.data[kind].push(entry);
      try {
        await this.persistCatalog(`${index >= 0 ? "Atualiza" : "Adiciona"} ${isSegments ? "segmento" : "linha"} ${entry.name}`);
        dialog.close();
        flash(`${entry.name} salvo no catálogo.`, "success");
        this.renderShell(this.currentAdminRoute());
      } catch (error) {
        flash(error.message, "error");
      }
    });
  }

  settingsView() {
    const site = state.data.site;
    return template`
      <div class="settings-grid">
        <form class="admin-panel settings-form" id="siteSettingsForm"><div class="panel-heading"><div><h2>Dados institucionais</h2><p>Informações compartilhadas pelo cabeçalho, contato e rodapé.</p></div></div>
          <div class="row g-3"><div class="col-md-6"><label>Telefone<input class="form-control" name="phone" value="${esc(site.phone)}"></label></div>
            <div class="col-md-6"><label>WhatsApp de exibição<input class="form-control" name="whatsappDisplay" value="${esc(site.whatsappDisplay)}"></label></div>
            <div class="col-md-6"><label>WhatsApp internacional<input class="form-control" name="whatsapp" value="${esc(site.whatsapp)}"></label></div>
            <div class="col-md-6"><label>E-mail<input class="form-control" type="email" name="email" value="${esc(site.email)}"></label></div>
            <div class="col-md-6"><label>Horário<input class="form-control" name="hours" value="${esc(site.hours)}"></label></div>
            <div class="col-md-6"><label>Cidade / região<input class="form-control" name="addressTitle" value="${esc(site.addressTitle)}"></label></div>
            <div class="col-12"><label>Endereço <span class="optional">(uma linha por entrada)</span><textarea class="form-control" rows="3" name="addressLines">${esc((site.addressLines || []).join("\n"))}</textarea></label></div>
            <div class="col-12"><label>Narrativa logística<textarea class="form-control" rows="3" name="coverage">${esc(site.coverage)}</textarea></label></div>
            <div class="col-12"><button class="btn btn-primary"><i class="bi bi-github me-2"></i>Salvar configurações</button></div></div>
        </form>
        <aside class="admin-panel integration-card"><div class="panel-heading"><div><h2>Integração GitHub</h2><p>Configuração fixa desta versão.</p></div></div>
          <div class="integration-logo"><i class="bi bi-github"></i><div><strong>glaucodeveloper/isocon</strong><span>Autenticado como ${esc(this.profile?.login || "")}</span></div></div>
          <dl><div><dt>Branch</dt><dd>main</dd></div><div><dt>Catálogo</dt><dd>website/data/catalog.json</dd></div><div><dt>Uploads</dt><dd>website/assets/uploads</dd></div><div><dt>Publicação</dt><dd>GitHub Pages Action</dd></div></dl>
          <div class="security-note"><i class="bi bi-shield-lock"></i><span>O PAT não é salvo no catálogo ou no repositório. Ele permanece em sessionStorage até o logout ou fechamento da sessão.</span></div>
          <button class="btn btn-outline-danger w-100" data-logout><i class="bi bi-box-arrow-right me-2"></i>Encerrar sessão administrativa</button>
        </aside>
      </div>`;
  }

  bindSettings() {
    this.querySelector("#siteSettingsForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      Object.assign(state.data.site, {
        phone: form.get("phone").trim(),
        whatsappDisplay: form.get("whatsappDisplay").trim(),
        whatsapp: form.get("whatsapp").replace(/\D/g, ""),
        email: form.get("email").trim(),
        hours: form.get("hours").trim(),
        addressTitle: form.get("addressTitle").trim(),
        addressLines: listLines(form.get("addressLines")),
        coverage: form.get("coverage").trim(),
      });
      try {
        await this.persistCatalog("Atualiza configurações institucionais");
        flash("Configurações salvas no GitHub.", "success");
      } catch (error) { flash(error.message, "error"); }
    });
    this.querySelector("[data-logout]")?.addEventListener("click", () => {
      state.token = "";
      state.adminRemote = null;
      sessionStorage.removeItem("isoconPat");
      this.renderLogin("Sessão encerrada.");
    });
  }

  async persistCatalog(message) {
    const response = await githubWriteCatalog(state.token, state.data, this.remote?.sha, message);
    this.remote = { sha: response.content.sha, data: state.data, isNew: false };
    state.adminRemote = this.remote;
    return response;
  }

  showFlash({ message, tone }) {
    const box = this.querySelector("#adminFlash");
    if (!box) return;
    box.className = `admin-flash show ${tone}`;
    box.innerHTML = `<i class="bi bi-${tone === "error" ? "exclamation-circle" : tone === "info" ? "info-circle" : "check-circle"}"></i><span>${esc(message)}</span><button><i class="bi bi-x"></i></button>`;
    box.querySelector("button")?.addEventListener("click", () => box.classList.remove("show"));
    setTimeout(() => box.classList.remove("show"), 6000);
  }
}
customElements.define("admin-app", AdminApp);
