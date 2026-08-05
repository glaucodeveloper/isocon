
import "./components.js";
import "./admin.js";
import { state, route } from "./utils.js";
import {
  homePage, segmentsPage, linesPage, segmentPage, linePage, itemPage,
  logisticsPage, contactPage, aboutPage, searchPage,
  quotePage, notFoundPage, bindPublicPage
} from "./pages.js";

class IsoconApp extends HTMLElement {
  async connectedCallback() {
    try {
      const response = await fetch("./data/catalog.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`Não foi possível carregar data/catalog.json (${response.status}).`);
      state.data = await response.json();
      this.render();
      window.addEventListener("hashchange", () => this.render());
      document.addEventListener("quotechange", () => {
        const count = state.quote.reduce((total, entry) => total + entry.quantity, 0);
        document.querySelectorAll(".quote-count").forEach((element) => { element.textContent = count; });
      });
    } catch (error) {
      this.innerHTML = `<main class="fatal-error"><i class="bi bi-exclamation-triangle"></i><h1>Falha ao carregar o website</h1><p>${error.message}</p><code>Execute o projeto por um servidor HTTP, não diretamente pelo protocolo file://.</code></main>`;
    }
  }

  publicContent(path) {
    if (path === "/") return homePage();
    if (path === "/segmentos") return segmentsPage();
    if (path === "/linhas") return linesPage();
    if (path.startsWith("/segmento/")) return segmentPage(path.split("/")[2]);
    if (path.startsWith("/linha/")) return linePage(path.split("/")[2]);
    if (path.startsWith("/item/")) return itemPage(path.split("/")[2]);
    if (path === "/logistica") return logisticsPage();
    if (path === "/contato") return contactPage();
    if (path === "/sobre") return aboutPage();
    if (path === "/busca") return searchPage();
    if (path === "/solicitacao") return quotePage();
    return notFoundPage();
  }

  render() {
    if (!state.data) return;
    const fullRoute = route();
    const path = fullRoute.split("?")[0];

    if (path.startsWith("/admin")) {
      document.body.classList.add("admin-mode");
      if (!this.querySelector(":scope > admin-app")) this.innerHTML = `<admin-app></admin-app>`;
      return;
    }

    document.body.classList.remove("admin-mode");
    this.innerHTML = `
      <site-header></site-header>
      <main id="publicPage">${this.publicContent(path)}</main>
      <site-footer></site-footer>
      <quote-bar></quote-bar>
      <chat-widget></chat-widget>`;
    bindPublicPage(this.querySelector("#publicPage"));
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
customElements.define("isocon-app", IsoconApp);
