import { state, esc, route } from "./utils.js";

/*
 * ISOCON — editor institucional de textos e SEO.
 *
 * Textos que já pertencem ao catálogo continuam em seus objetos originais
 * (site, home, logistics, representatives e about).
 *
 * Textos fixos das páginas são reconhecidos pelo conteúdo original. O
 * instalador registra esses textos em copywriting.labels/copywriting.texts.
 */

const COPY_ROUTE = "/admin/copywriting";
const SKIPPED_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "OPTION"]);

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function copyHash(value = "") {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(normalizeText(value));

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function copySlug(value = "") {
  const base = normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52);

  return `${base || "texto"}-${copyHash(value)}`;
}

function copyStore() {
  state.data.copywriting ||= {};
  state.data.copywriting.seo ||= {};
  state.data.copywriting.labels ||= {};
  state.data.copywriting.texts ||= {};
  return state.data.copywriting;
}

function copyValue(original) {
  const store = copyStore();
  const key = copySlug(original);
  const value = store.texts[key];

  return typeof value === "string" && value.length
    ? value
    : original;
}

const processedTextNodes = new WeakSet();

function applyStructuralCopy(root = document) {
  if (!state.data || document.body.classList.contains("admin-mode")) return;

  const store = copyStore();
  if (!Object.keys(store.texts).length) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        const text = normalizeText(node.nodeValue);

        if (!parent || !text || processedTextNodes.has(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          SKIPPED_TAGS.has(parent.tagName)
          || parent.closest("admin-app")
          || parent.closest("item-card, line-card, segment-card")
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    processedTextNodes.add(node);

    const original = normalizeText(node.nodeValue);
    const replacement = copyValue(original);
    if (replacement === original) continue;

    const leading = node.nodeValue.match(/^\s*/)?.[0] || "";
    const trailing = node.nodeValue.match(/\s*$/)?.[0] || "";
    node.nodeValue = `${leading}${replacement}${trailing}`;
  }
}

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement("meta");
    document.head.append(element);
  }

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

function applyRuntimeSeo() {
  if (!state.data) return;

  const seo = copyStore().seo;
  const title = seo.title || "ISOCON | Soluções empresariais e logística nacional";
  const description =
    seo.description
    || "Catálogo B2B de produtos, equipamentos e suprimentos para empresas, com atendimento comercial e logística em todo o Brasil.";
  const canonical = seo.canonical || "https://isoconvca.com.br/";
  const socialTitle = seo.socialTitle || title;
  const socialDescription = seo.socialDescription || description;
  const socialImage =
    seo.socialImage
    || "https://isoconvca.com.br/assets/images/hero-home.png";

  document.title = title;

  upsertMeta('meta[name="description"]', {
    name: "description",
    content: description,
  });
  upsertMeta('meta[property="og:title"]', {
    property: "og:title",
    content: socialTitle,
  });
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: socialDescription,
  });
  upsertMeta('meta[property="og:url"]', {
    property: "og:url",
    content: canonical,
  });
  upsertMeta('meta[property="og:image"]', {
    property: "og:image",
    content: socialImage,
  });
  upsertMeta('meta[name="twitter:card"]', {
    name: "twitter:card",
    content: "summary_large_image",
  });
  upsertMeta('meta[name="twitter:title"]', {
    name: "twitter:title",
    content: socialTitle,
  });
  upsertMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: socialDescription,
  });
  upsertMeta('meta[name="twitter:image"]', {
    name: "twitter:image",
    content: socialImage,
  });

  let canonicalLink = document.head.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement("link");
    canonicalLink.rel = "canonical";
    document.head.append(canonicalLink);
  }
  canonicalLink.href = canonical;
}

function labelForPath(path) {
  const translations = {
    site: "Institucional",
    home: "Página inicial",
    logistics: "Logística",
    representatives: "Representantes",
    about: "Sobre a ISOCON",
    title: "Título",
    subtitle: "Subtítulo",
    description: "Descrição",
    text: "Texto",
    name: "Nome",
    coverage: "Cobertura",
    hours: "Horário",
    phone: "Telefone",
    whatsappDisplay: "WhatsApp exibido",
    email: "E-mail",
    addressTitle: "Cidade / região",
    addressLines: "Endereço",
    benefits: "Benefícios",
    steps: "Etapas",
    heroImage: "Imagem da capa",
  };

  return path
    .split(".")
    .map((part) => translations[part] || (
      /^\d+$/.test(part) ? `Item ${Number(part) + 1}` : part
    ))
    .join(" · ");
}

function editableEntries(value, prefix = "", result = []) {
  if (typeof value === "string") {
    result.push({ path: prefix, value, type: "string" });
    return result;
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === "string")) {
      result.push({
        path: prefix,
        value: value.join("\n"),
        type: "string-list",
      });
      return result;
    }

    value.forEach((entry, index) => {
      editableEntries(entry, `${prefix}.${index}`, result);
    });
    return result;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const next = prefix ? `${prefix}.${key}` : key;
      editableEntries(entry, next, result);
    });
  }

  return result;
}

function getAtPath(root, path) {
  return path.split(".").reduce((value, part) => value?.[part], root);
}

function setAtPath(root, path, value) {
  const parts = path.split(".");
  const last = parts.pop();
  let current = root;

  for (const part of parts) {
    current = current[part];
  }

  current[last] = value;
}

function textField(entry) {
  const multiline =
    entry.type === "string-list"
    || entry.value.length > 90
    || entry.value.includes("\n");

  const control = multiline
    ? `<textarea class="form-control" rows="${entry.value.length > 220 ? 5 : 3}"
         data-structural-path="${esc(entry.path)}"
         data-structural-type="${entry.type}">${esc(entry.value)}</textarea>`
    : `<input class="form-control"
         data-structural-path="${esc(entry.path)}"
         data-structural-type="${entry.type}"
         value="${esc(entry.value)}">`;

  return `
    <label class="copywriting-field">
      <span>${esc(labelForPath(entry.path))}</span>
      ${control}
    </label>`;
}

function structuralSection(key, title, description) {
  const value = state.data[key];
  if (!value) return "";

  const entries = editableEntries(value, key);

  return `
    <section class="copywriting-section" data-copy-section="${key}">
      <header>
        <div>
          <span>CONTEÚDO ESTRUTURADO</span>
          <h2>${esc(title)}</h2>
          <p>${esc(description)}</p>
        </div>
        <strong>${entries.length} campos</strong>
      </header>
      <div class="copywriting-fields">
        ${entries.map(textField).join("")}
      </div>
    </section>`;
}

function seoFields() {
  const seo = copyStore().seo;

  const fields = [
    ["title", "Título para Google", seo.title || "ISOCON | Soluções empresariais e logística nacional", false],
    ["description", "Descrição para Google", seo.description || "Catálogo B2B de produtos, equipamentos e suprimentos para empresas, com atendimento comercial e logística em todo o Brasil.", true],
    ["canonical", "Endereço canônico", seo.canonical || "https://isoconvca.com.br/", false],
    ["socialTitle", "Título da prévia social", seo.socialTitle || seo.title || "ISOCON | Soluções empresariais e logística nacional", false],
    ["socialDescription", "Descrição da prévia social", seo.socialDescription || seo.description || "Soluções empresariais, atendimento comercial e logística nacional.", true],
    ["socialImage", "Imagem da prévia social", seo.socialImage || "https://isoconvca.com.br/assets/images/hero-home.png", false],
  ];

  return fields.map(([key, label, value, multiline]) => `
    <label class="copywriting-field">
      <span>${esc(label)}</span>
      ${multiline
        ? `<textarea class="form-control" rows="3" data-seo-field="${key}">${esc(value)}</textarea>`
        : `<input class="form-control" data-seo-field="${key}" value="${esc(value)}">`}
    </label>`).join("");
}

function fixedCopyFields() {
  const store = copyStore();
  const entries = Object.entries(store.labels)
    .map(([key, label]) => ({
      key,
      label,
      value: store.texts[key] ?? label,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  return entries.map((entry) => `
    <label class="copywriting-field copywriting-fixed-field"
      data-copy-search="${esc(`${entry.label} ${entry.value}`.toLowerCase())}">
      <span>${esc(entry.label)}</span>
      <textarea class="form-control" rows="${entry.value.length > 140 ? 4 : 2}"
        data-copy-key="${esc(entry.key)}">${esc(entry.value)}</textarea>
      <small>Texto original: ${esc(entry.label)}</small>
    </label>`).join("");
}

function copywritingView() {
  const fixedCount = Object.keys(copyStore().labels).length;

  return `
    <form class="copywriting-admin" id="copywritingForm">
      <section class="copywriting-intro">
        <div>
          <span>CONTEÚDO INSTITUCIONAL</span>
          <h2>Copywriting e SEO</h2>
          <p>Edite títulos, descrições, chamadas, botões e textos estruturais do website.</p>
        </div>
        <div class="copywriting-actions">
          <a class="btn btn-outline-primary" href="#/" target="_blank">
            <i class="bi bi-box-arrow-up-right me-2"></i>Visualizar website
          </a>
          <button class="btn btn-primary" type="submit">
            <i class="bi bi-check2-circle me-2"></i>Salvar conteúdo
          </button>
        </div>
      </section>

      <nav class="copywriting-tabs">
        <button type="button" class="active" data-copy-tab="seo">SEO e compartilhamento</button>
        <button type="button" data-copy-tab="structured">Conteúdo institucional</button>
        <button type="button" data-copy-tab="fixed">Textos da interface <b>${fixedCount}</b></button>
      </nav>

      <section class="copywriting-tab-panel active" data-copy-panel="seo">
        <section class="copywriting-section">
          <header>
            <div>
              <span>BUSCA E COMPARTILHAMENTO</span>
              <h2>SEO da página inicial</h2>
              <p>Esses dados formam o resultado de busca e a prévia enviada por WhatsApp.</p>
            </div>
          </header>
          <div class="copywriting-fields">${seoFields()}</div>
          <aside class="seo-preview">
            <span>PRÉVIA SOCIAL</span>
            <img src="${esc(copyStore().seo.socialImage || "https://isoconvca.com.br/assets/images/hero-home.png")}" alt="">
            <div>
              <small>isoconvca.com.br</small>
              <strong>${esc(copyStore().seo.socialTitle || copyStore().seo.title || "ISOCON")}</strong>
              <p>${esc(copyStore().seo.socialDescription || copyStore().seo.description || "")}</p>
            </div>
          </aside>
          <p class="copywriting-note">
            A publicação transforma esses campos em metadados estáticos antes do deploy,
            para que mecanismos de busca e aplicativos de mensagem consigam lê-los.
          </p>
        </section>
      </section>

      <section class="copywriting-tab-panel" data-copy-panel="structured">
        ${structuralSection("site", "Dados institucionais", "Identidade, contatos, endereço e cobertura.")}
        ${structuralSection("home", "Página inicial", "Capa, benefícios e mensagens principais.")}
        ${structuralSection("logistics", "Logística", "Etapas, explicações e cobertura operacional.")}
        ${structuralSection("representatives", "Representantes", "Apresentação e informações regionais.")}
        ${structuralSection("about", "Sobre a ISOCON", "Textos institucionais e posicionamento.")}
      </section>

      <section class="copywriting-tab-panel" data-copy-panel="fixed">
        <section class="copywriting-section">
          <header>
            <div>
              <span>INTERFACE PÚBLICA</span>
              <h2>Textos estruturais</h2>
              <p>Chamadas, títulos, botões, instruções e textos fixos usados ao longo das páginas.</p>
            </div>
            <strong>${fixedCount} textos</strong>
          </header>
          <div class="copywriting-search">
            <i class="bi bi-search"></i>
            <input class="form-control" type="search"
              placeholder="Buscar texto estrutural..."
              data-copywriting-search>
          </div>
          <div class="copywriting-fields copywriting-fixed-grid">
            ${fixedCopyFields()}
          </div>
        </section>
      </section>

      <footer class="copywriting-savebar">
        <span>As alterações entram na publicação após o salvamento.</span>
        <button class="btn btn-primary" type="submit">
          <i class="bi bi-check2-circle me-2"></i>Salvar conteúdo
        </button>
      </footer>
    </form>`;
}

function installSidebarEntry(admin, current) {
  const nav = admin.querySelector("#adminSidebar nav");
  if (!nav || nav.querySelector(`[href="#${COPY_ROUTE}"]`)) return;

  const configurationLabel = [...nav.children].find((element) =>
    element.matches(".admin-nav-label")
    && normalizeText(element.textContent).toUpperCase() === "CONFIGURAÇÕES"
  );

  const contentLabel = document.createElement("span");
  contentLabel.className = "admin-nav-label copywriting-nav-label";
  contentLabel.textContent = "CONTEÚDO";

  const link = document.createElement("a");
  link.href = `#${COPY_ROUTE}`;
  link.className = current === COPY_ROUTE ? "active" : "";
  link.innerHTML = '<i class="bi bi-fonts"></i>Copywriting e SEO';

  if (configurationLabel) {
    nav.insertBefore(contentLabel, configurationLabel);
    nav.insertBefore(link, configurationLabel);
  } else {
    nav.append(contentLabel, link);
  }
}

function bindCopywriting(admin) {
  const form = admin.querySelector("#copywritingForm");
  if (!form) return;

  admin.querySelectorAll("[data-copy-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      admin.querySelectorAll("[data-copy-tab]").forEach((entry) => {
        entry.classList.toggle("active", entry === button);
      });
      admin.querySelectorAll("[data-copy-panel]").forEach((panel) => {
        panel.classList.toggle(
          "active",
          panel.dataset.copyPanel === button.dataset.copyTab,
        );
      });
    });
  });

  admin.querySelector("[data-copywriting-search]")?.addEventListener("input", (event) => {
    const needle = event.currentTarget.value.trim().toLowerCase();

    admin.querySelectorAll("[data-copy-search]").forEach((field) => {
      field.hidden = Boolean(needle) && !field.dataset.copySearch.includes(needle);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const store = copyStore();

    form.querySelectorAll("[data-seo-field]").forEach((field) => {
      store.seo[field.dataset.seoField] = field.value.trim();
    });

    form.querySelectorAll("[data-copy-key]").forEach((field) => {
      store.texts[field.dataset.copyKey] = field.value.trim();
    });

    form.querySelectorAll("[data-structural-path]").forEach((field) => {
      const type = field.dataset.structuralType;
      const value = type === "string-list"
        ? field.value.split("\n").map((line) => line.trim()).filter(Boolean)
        : field.value.trim();

      setAtPath(state.data, field.dataset.structuralPath, value);
    });

    try {
      await admin.persistCatalog("Atualiza conteúdo institucional e SEO");
      document.dispatchEvent(new CustomEvent("adminflash", {
        detail: {
          message: "Conteúdo institucional e SEO salvos.",
          tone: "success",
        },
      }));
      applyRuntimeSeo();
    } catch (error) {
      document.dispatchEvent(new CustomEvent("adminflash", {
        detail: {
          message: error.message,
          tone: "error",
        },
      }));
    }
  });
}

const AdminApp = customElements.get("admin-app");
const adminPrototype = AdminApp?.prototype;

if (adminPrototype && !adminPrototype.__isoconCopywritingSeoPatch) {
  adminPrototype.__isoconCopywritingSeoPatch = true;

  const previousShellTitle = adminPrototype.shellTitle;
  const previousRouteContent = adminPrototype.routeContent;
  const previousRenderShell = adminPrototype.renderShell;

  adminPrototype.shellTitle = function patchedCopywritingTitle(current) {
    if (current === COPY_ROUTE) {
      return ["Copywriting e SEO", "Textos estruturais, busca e compartilhamento"];
    }
    return previousShellTitle.call(this, current);
  };

  adminPrototype.routeContent = function patchedCopywritingContent(current) {
    if (current === COPY_ROUTE) return copywritingView();
    return previousRouteContent.call(this, current);
  };

  adminPrototype.renderShell = function patchedCopywritingShell(current) {
    previousRenderShell.call(this, current);
    installSidebarEntry(this, current);
    if (current === COPY_ROUTE) bindCopywriting(this);
  };
}

const observer = new MutationObserver(() => {
  if (!document.body.classList.contains("admin-mode")) {
    queueMicrotask(() => {
      applyStructuralCopy(document.querySelector("isocon-app") || document);
      applyRuntimeSeo();
    });
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("DOMContentLoaded", () => {
  applyStructuralCopy();
  applyRuntimeSeo();
});
