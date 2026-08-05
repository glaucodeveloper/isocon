/*
 * ISOCON — agrupa módulos marcados como “em preparação”
 * em uma seção própria da sidebar administrativa.
 */

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

function isPreparationEntry(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.matches("a, button")) return false;

  const text = normalize(element.textContent);
  return text.includes("em preparacao");
}

function configurationLabel(nav) {
  return [...nav.children].find((element) =>
    element.matches(".admin-nav-label")
    && normalize(element.textContent) === "configuracoes"
  ) || null;
}

function organizePreparationSection(root = document) {
  const navs = root.matches?.("#adminSidebar nav")
    ? [root]
    : [...root.querySelectorAll?.("#adminSidebar nav") || []];

  for (const nav of navs) {
    const entries = [...nav.children].filter(isPreparationEntry);

    /*
     * Remove marcadores antigos antes de reconstruir. Isso evita duplicação
     * após renderizações de rota e atualizações da sidebar.
     */
    nav.querySelectorAll(
      ":scope > .admin-implementation-label, :scope > .admin-implementation-divider"
    ).forEach((element) => element.remove());

    if (!entries.length) continue;

    const label = document.createElement("span");
    label.className = "admin-nav-label admin-implementation-label";
    label.textContent = "PARA IMPLEMENTAÇÃO";

    const divider = document.createElement("span");
    divider.className = "admin-implementation-divider";
    divider.setAttribute("aria-hidden", "true");

    const config = configurationLabel(nav);

    if (config) {
      nav.insertBefore(divider, config);
      nav.insertBefore(label, config);

      for (const entry of entries) {
        entry.classList.add("implementation-module");
        nav.insertBefore(entry, config);
      }
    } else {
      nav.append(divider, label);

      for (const entry of entries) {
        entry.classList.add("implementation-module");
        nav.append(entry);
      }
    }
  }
}

const AdminApp = customElements.get("admin-app");
const prototype = AdminApp?.prototype;

if (prototype && !prototype.__isoconImplementationSectionPatch) {
  prototype.__isoconImplementationSectionPatch = true;

  const previousRenderShell = prototype.renderShell;

  prototype.renderShell = function patchedImplementationSection(current) {
    previousRenderShell.call(this, current);
    organizePreparationSection(this);
  };
}

new MutationObserver((mutations) => {
  const relevant = mutations.some((mutation) =>
    [...mutation.addedNodes].some((node) =>
      node instanceof Element
      && (
        node.matches?.("#adminSidebar, #adminSidebar nav")
        || node.querySelector?.("#adminSidebar nav")
      )
    )
  );

  if (relevant) queueMicrotask(() => organizePreparationSection());
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("DOMContentLoaded", () => {
  organizePreparationSection();
});

organizePreparationSection();
