/*
 * ISOCON — resolução estável de imagens e documentos.
 *
 * Os caminhos gravados no catálogo continuam portáveis:
 *   ./assets/uploads/...
 *
 * Na exibição, o endereço é resolvido a partir da própria pasta da aplicação,
 * obtida por import.meta.url. Isso funciona no GitHub Pages, em subpastas e
 * no servidor local.
 *
 * Caso a versão publicada ainda não contenha o arquivo recém-enviado, a imagem
 * usa temporariamente o arquivo bruto do branch main.
 */

const APPLICATION_ROOT = new URL("../../", import.meta.url);
const RAW_ROOT =
  "https://raw.githubusercontent.com/glaucodeveloper/isocon/main/website/";

function assetRelativePath(value = "") {
  const source = String(value || "").trim();
  if (!source) return "";

  if (
    source.startsWith("blob:")
    || source.startsWith("data:")
    || source.startsWith("file:")
  ) {
    return "";
  }

  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);

      if (parsed.hostname === "raw.githubusercontent.com") return "";

      const markers = [
        "/website/assets/",
        "/isocon/assets/",
        "/assets/",
      ];

      for (const marker of markers) {
        const position = parsed.pathname.indexOf(marker);
        if (position >= 0) {
          return `assets/${parsed.pathname.slice(position + marker.length)}`;
        }
      }

      return "";
    } catch {
      return "";
    }
  }

  let normalized = source
    .replaceAll("\\", "/")
    .replace(/^[.][/]/, "")
    .replace(/^[/]+/, "");

  const websiteIndex = normalized.indexOf("website/assets/");
  if (websiteIndex >= 0) {
    normalized = normalized.slice(
      websiteIndex + "website/".length,
    );
  }

  const assetsIndex = normalized.indexOf("assets/");
  if (assetsIndex >= 0) {
    normalized = normalized.slice(assetsIndex);
  }

  return normalized.startsWith("assets/") ? normalized : "";
}

function localAssetUrl(value) {
  const relative = assetRelativePath(value);
  return relative ? new URL(relative, APPLICATION_ROOT).href : "";
}

function rawAssetUrl(value) {
  const relative = assetRelativePath(value);
  return relative ? new URL(relative, RAW_ROOT).href : "";
}

function installImageFallback(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.isoconAssetBound === "true") return;

  const source = image.getAttribute("src") || "";
  const relative = assetRelativePath(source);
  if (!relative) return;

  image.dataset.isoconAssetBound = "true";
  image.dataset.isoconAssetOriginal = source;
  image.dataset.isoconAssetRelative = relative;

  const local = localAssetUrl(relative);
  const raw = rawAssetUrl(relative);

  image.addEventListener("load", () => {
    image.classList.remove("asset-load-failed");
  });

  image.addEventListener("error", () => {
    if (
      image.dataset.isoconRawFallback !== "true"
      && raw
      && image.src !== raw
    ) {
      image.dataset.isoconRawFallback = "true";
      image.src = raw;
      return;
    }

    image.classList.add("asset-load-failed");
  });

  if (local && image.src !== local) {
    image.src = local;
  }
}

function installSourceFallback(source) {
  if (!(source instanceof HTMLSourceElement)) return;
  if (source.dataset.isoconAssetBound === "true") return;

  const current = source.getAttribute("src") || "";
  source.dataset.isoconAssetBound = "true";
  const local = localAssetUrl(current);
  if (local && source.src !== local) source.src = local;

  const currentSet = source.getAttribute("srcset") || "";
  if (!currentSet) return;

  const normalizedSet = currentSet
    .split(",")
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/);
      const url = localAssetUrl(parts.shift() || "");
      return url ? [url, ...parts].join(" ") : candidate.trim();
    })
    .join(", ");

  if (source.srcset !== normalizedSet) {
    source.srcset = normalizedSet;
  }
}

function installDocumentLink(link) {
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.dataset.isoconAssetBound === "true") return;

  const current = link.getAttribute("href") || "";
  link.dataset.isoconAssetBound = "true";
  const local = localAssetUrl(current);
  if (!local) return;

  if (link.href !== local) link.href = local;

  link.addEventListener("click", async (event) => {
    if (link.dataset.isoconRawDocument === "true") return;

    try {
      const response = await fetch(link.href, {
        method: "HEAD",
        cache: "no-store",
      });

      if (response.ok) return;
    } catch {
      // O fallback bruto é aplicado abaixo.
    }

    const raw = rawAssetUrl(current);
    if (!raw) return;

    event.preventDefault();
    link.dataset.isoconRawDocument = "true";
    window.open(raw, link.target || "_blank", "noopener");
  });
}

function processAssets(root = document) {
  if (root instanceof HTMLImageElement) installImageFallback(root);
  if (root instanceof HTMLSourceElement) installSourceFallback(root);
  if (root instanceof HTMLAnchorElement) installDocumentLink(root);

  root.querySelectorAll?.("img[src]").forEach(installImageFallback);
  root.querySelectorAll?.("source[src], source[srcset]")
    .forEach(installSourceFallback);
  root.querySelectorAll?.(
    'a[href^="./assets/"], a[href^="assets/"], a[href*="/website/assets/"]',
  ).forEach(installDocumentLink);
}

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof Element) processAssets(node);
    }

    if (
      mutation.type === "attributes"
      && mutation.target instanceof Element
    ) {
      processAssets(mutation.target);
    }
  }
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["src", "srcset", "href"],
});

document.addEventListener("DOMContentLoaded", () => processAssets());
processAssets();

globalThis.isoconAssetUrl = localAssetUrl;
globalThis.isoconRawAssetUrl = rawAssetUrl;
