import { state, esc, route, whatsappUrl, addToQuote } from "./utils.js";

const template = String.raw;

export class SiteHeader extends HTMLElement {
  connectedCallback() { this.render(); }
  render() {
    const site = state.data.site;
    const activeRoute = route().split("?")[0];
    const nav = [
      ["/", "Início"], ["/segmentos", "Segmentos"], ["/linhas", "Linhas de Produtos"],
      ["/logistica", "Logística"],
      ["/sobre", "Sobre a ISOCON"], ["/contato", "Contato"],
    ];
    this.innerHTML = template`
      <div class="site-topbar">
        <div class="container-fluid site-container d-flex justify-content-between gap-3 flex-wrap">
          <div class="d-flex gap-4 flex-wrap">
            <span><i class="bi bi-geo-alt me-2"></i>Atendimento comercial</span>
            <a href="tel:${site.phone.replace(/\D/g, "")}"><i class="bi bi-telephone me-2"></i>${esc(site.phone)}</a>
            <a href="${whatsappUrl()}" target="_blank"><i class="bi bi-whatsapp me-2 text-success"></i>${esc(site.whatsappDisplay)}</a>
            <a href="mailto:${site.email}"><i class="bi bi-envelope me-2"></i>${esc(site.email)}</a>
          </div>
          <div class="d-flex gap-4 flex-wrap">
            <span><i class="bi bi-clock me-2"></i>${esc(site.hours)}</span>
          </div>
        </div>
      </div>
      <nav class="navbar navbar-expand-xl bg-white site-navbar sticky-top">
        <div class="container-fluid site-container py-2">
          <a class="navbar-brand brand-lockup" href="#/" aria-label="ISOCON Início">
            <img class="brand-symbol brand-logo-image" src="./assets/images/logo%201.png" alt="ISOCON">
            <span class="brand-name">ISOCON</span>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#siteMenu">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="offcanvas offcanvas-end" id="siteMenu">
            <div class="offcanvas-header">
              <h5>Menu ISOCON</h5><button class="btn-close" data-bs-dismiss="offcanvas"></button>
            </div>
            <div class="offcanvas-body align-items-center">
              <ul class="navbar-nav mx-auto gap-xl-2">
                ${nav.map(([path, label]) => {
                  const active = activeRoute === path || (path !== "/" && activeRoute.startsWith(path));
                  return `<li class="nav-item"><a class="nav-link ${active ? "active" : ""}" href="#${path}">${label}</a></li>`;
                }).join("")}
              </ul>
              <form class="site-search d-flex" id="globalSearch">
                <input class="form-control" name="q" placeholder="Buscar segmento, linha ou item..." aria-label="Busca">
                <button class="btn" aria-label="Buscar"><i class="bi bi-search"></i></button>
              </form>
              <a class="btn btn-primary site-quote-button" href="#/solicitacao">
                <i class="bi bi-file-earmark-text me-2"></i>Solicitar cotação
                <span class="quote-count">${state.quote.length}</span>
              </a>
            </div>
          </div>
        </div>
      </nav>`;
    this.querySelector("#globalSearch")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get("q").trim();
      if (value) location.hash = `/busca?q=${encodeURIComponent(value)}`;
    });
  }
}
customElements.define("site-header", SiteHeader);

export class SiteFooter extends HTMLElement {
  connectedCallback() {
    const site = state.data.site;
    this.innerHTML = template`
      <section class="trust-strip">
        <div class="container-fluid site-container"><div class="row g-0">
          ${state.data.home.trust.map((entry) => `
            <div class="col-6 col-lg-3 trust-item">
              <i class="bi ${entry.icon}"></i>
              <div><strong>${esc(entry.title)}</strong><span>${esc(entry.text)}</span></div>
            </div>`).join("")}
        </div></div>
      </section>
      <footer class="site-footer">
        <div class="container-fluid site-container py-5">
          <div class="row g-4">
            <div class="col-lg-3">
              <div class="brand-lockup brand-lockup-light mb-3">
                <img class="brand-symbol brand-logo-image" src="./assets/images/logo%201.png" alt="ISOCON">
                <span class="brand-name">ISOCON</span>
              </div>
              <p>Distribuindo capacidade, construindo parcerias e coordenando entregas para empresas.</p>
              <div class="social-links">
                <a href="#"><i class="bi bi-linkedin"></i></a><a href="#"><i class="bi bi-instagram"></i></a>
                <a href="#"><i class="bi bi-facebook"></i></a><a href="#"><i class="bi bi-youtube"></i></a>
              </div>
            </div>
            <div class="col-6 col-lg-2">
              <h3>Institucional</h3><a href="#/sobre">Quem somos</a>
              <a href="#/logistica">Logística</a><a href="#/contato">Trabalhe conosco</a>
            </div>
            <div class="col-6 col-lg-2">
              <h3>Fornecimento</h3>
              ${state.data.segments.slice(0, 6).map((segment) => `<a href="#/segmento/${segment.id}">${esc(segment.name)}</a>`).join("")}
            </div>
            <div class="col-6 col-lg-2">
              <h3>Suporte</h3><a href="#/solicitacao">Falar com consultor</a><a href="#/contato">Perguntas frequentes</a>
              <a href="#/solicitacao">Solicitar cotação</a><a href="#/contato">Políticas e garantias</a>
            </div>
            <div class="col-6 col-lg-3">
              <h3>Contato</h3>
              <a href="tel:${site.phone.replace(/\D/g, "")}"><i class="bi bi-telephone me-2"></i>${esc(site.phone)}</a>
              <a href="${whatsappUrl()}" target="_blank"><i class="bi bi-whatsapp me-2"></i>${esc(site.whatsappDisplay)}</a>
              <a href="mailto:${site.email}"><i class="bi bi-envelope me-2"></i>${esc(site.email)}</a>
              <span><i class="bi bi-geo-alt me-2"></i>${esc(site.addressTitle)}</span>
            </div>
          </div>
          <hr>
          <div class="d-flex justify-content-between flex-wrap gap-2 site-footer-bottom">
            <span>© 2026 ISOCON.</span><span>Catálogo B2B com atendimento comercial.</span>
          </div>
        </div>
      </footer>`;
  }
}
customElements.define("site-footer", SiteFooter);

export class SegmentCard extends HTMLElement {
  set data(value) { this._data = value; this.render(); }
  render() {
    if (!this._data) return;
    const segment = this._data;
    this.innerHTML = template`
      <article class="segment-card h-100">
        <img src="${segment.image}" alt="${esc(segment.name)}">
        <div class="segment-card-body">
          <div class="segment-card-title"><i class="bi ${segment.icon}"></i><h3>${esc(segment.name)}</h3></div>
          <p>${esc(segment.description)}</p>
          <ul>${segment.examples.slice(0, 4).map((example) => `<li>${esc(example)}</li>`).join("")}</ul>
          <a href="#/segmento/${segment.id}">Explorar segmento <i class="bi bi-arrow-right"></i></a>
        </div>
      </article>`;
  }
}
customElements.define("segment-card", SegmentCard);

export class LineCard extends HTMLElement {
  set data(value) { this._data = value; this.render(); }
  render() {
    if (!this._data) return;
    const line = this._data;
    this.innerHTML = template`
      <article class="line-card h-100">
        <img src="${line.image}" alt="${esc(line.name)}">
        <div><h3>${esc(line.name)}</h3>
          <ul>${line.examples.map((example) => `<li>${esc(example)}</li>`).join("")}</ul>
          <a href="#/linha/${line.id}">Ver itens desta linha <i class="bi bi-arrow-right"></i></a>
        </div>
      </article>`;
  }
}
customElements.define("line-card", LineCard);

export class ItemCard extends HTMLElement {
  set data(value) { this._data = value; this.render(); }
  render() {
    if (!this._data) return;
    const item = this._data;
    this.innerHTML = template`
      <article class="item-card h-100">
        <div class="item-card-image">
          <span class="availability availability-${item.status}">${item.status === "disponivel" ? "Disponível" : "Sob consulta"}</span>
          <button class="favorite" aria-label="Salvar item"><i class="bi bi-heart"></i></button>
          <img src="${item.image}" alt="${esc(item.name)}">
        </div>
        <div class="item-card-body">
          <h3>${esc(item.name)}</h3>
          <ul>${Object.entries(item.attributes).slice(0, 4).map(([key, value]) => `<li>${esc(key)}: ${esc(value)}</li>`).join("")}</ul>
          <a href="#/item/${item.id}">Ver detalhes <i class="bi bi-arrow-right"></i></a>
          <label class="add-list-check"><input type="checkbox" data-add-item="${item.id}"> Adicionar à lista</label>
        </div>
      </article>`;
    this.querySelector("[data-add-item]")?.addEventListener("change", (event) => {
      if (event.currentTarget.checked) addToQuote(item.id);
      event.currentTarget.checked = false;
    });
  }
}
customElements.define("item-card", ItemCard);

export class QuoteBar extends HTMLElement {
  connectedCallback() { document.addEventListener("quotechange", () => this.render()); this.render(); }
  render() {
    const count = state.quote.reduce((total, entry) => total + entry.quantity, 0);
    this.innerHTML = count ? template`
      <div class="quote-bar"><div class="container-fluid site-container"><div class="quote-bar-grid">
        <div><strong>Lista para orçamento (${count} ${count === 1 ? "item" : "itens"})</strong>
          <span>Salve itens e envie o contexto para a equipe comercial.</span></div>
        <a class="btn btn-outline-light" href="#/solicitacao"><i class="bi bi-list-check me-2"></i>Ver minha lista</a>
        <div class="quote-support"><strong>Atendimento rápido</strong><span>Receba orientações personalizadas.</span></div>
        <a class="btn btn-outline-light" href="#/solicitacao"><i class="bi bi-chat-dots me-2"></i>Abrir atendimento</a>
        <a class="btn btn-whatsapp" href="${whatsappUrl()}" target="_blank"><i class="bi bi-whatsapp me-2"></i>WhatsApp</a>
      </div></div></div>` : "";
  }
}
customElements.define("quote-bar", QuoteBar);

export class ChatWidget extends HTMLElement {
  connectedCallback() { this.open = false; this.render(); }
  render() {
    this.innerHTML = template`
      ${this.open ? `<aside class="chat-panel">
        <header><div><span class="online-dot"></span><strong>Atendimento ISOCON</strong><small>Online agora</small></div>
          <button data-close aria-label="Fechar"><i class="bi bi-x-lg"></i></button></header>
        <div class="chat-body">
          <div class="chat-message">Olá! Como podemos ajudar a sua empresa hoje?</div>
          <a href="#/solicitacao">Quero solicitar uma cotação</a>
          <a href="#/linhas">Tenho dúvidas sobre produtos</a>
          <a href="${whatsappUrl()}" target="_blank">Falar com um consultor</a>
        </div><footer><input placeholder="Digite sua mensagem..."><i class="bi bi-paperclip"></i></footer>
      </aside>` : ""}
      <button class="chat-fab" data-toggle aria-label="Atendimento"><i class="bi bi-${this.open ? "x-lg" : "chat-dots"}"></i></button>`;
    this.querySelector("[data-toggle]")?.addEventListener("click", () => { this.open = !this.open; this.render(); });
    this.querySelector("[data-close]")?.addEventListener("click", () => { this.open = false; this.render(); });
  }
}
customElements.define("chat-widget", ChatWidget);
