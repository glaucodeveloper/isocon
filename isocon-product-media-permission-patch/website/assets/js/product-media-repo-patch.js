import { route } from "./utils.js";

/*
 * ISOCON — mídia persistente durante a edição.
 *
 * Os arquivos selecionados são mantidos como File/Blob no IndexedDB.
 * Assim permanecem disponíveis ao avançar/voltar etapas, após renderizações
 * do formulário e depois de uma atualização acidental da página.
 */

const DB_NAME = "isocon-admin-media-drafts";
const DB_VERSION = 1;
const STORE_NAME = "item-media";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

let databasePromise = null;
const objectUrls = new WeakMap();

function openDatabase() {
  if (!("indexedDB" in globalThis)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

async function readDraft(key) {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function writeDraft(record) {
  const database = await openDatabase();
  if (!database) return;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteDraft(key) {
  const database = await openDatabase();
  if (!database) return;

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function itemRouteKey(admin) {
  const current = admin.currentAdminRoute?.() || route().split("?")[0];
  if (!current.startsWith("/admin/item/")) return "";
  return `item:${current.slice("/admin/item/".length) || "novo"}`;
}

function hasFiles(pending = {}) {
  return Boolean(
    pending.main
    || pending.gallery?.length
    || pending.documents?.length
  );
}

function normalizePending(value = {}) {
  return {
    main: value.main instanceof Blob ? value.main : null,
    gallery: Array.isArray(value.gallery)
      ? value.gallery.filter((entry) => entry instanceof Blob)
      : [],
    documents: Array.isArray(value.documents)
      ? value.documents.filter((entry) => entry instanceof Blob)
      : [],
  };
}

function objectUrl(file) {
  if (!(file instanceof Blob)) return "";
  if (!objectUrls.has(file)) objectUrls.set(file, URL.createObjectURL(file));
  return objectUrls.get(file);
}

async function persistPendingMedia(admin) {
  const key = itemRouteKey(admin);
  if (!key) return;

  const pending = normalizePending(admin.pendingFiles);
  await writeDraft({
    key,
    pending,
    updatedAt: new Date().toISOString(),
  });
}

async function restorePendingMedia(admin, key) {
  const record = await readDraft(key).catch(() => null);
  if (!record || itemRouteKey(admin) !== key) return false;

  const restored = normalizePending(record.pending);
  if (!hasFiles(restored)) return false;

  admin.pendingFiles = restored;
  return true;
}

function updateUploadZone(input, text) {
  const zone = input?.closest(".upload-zone");
  const status = zone?.querySelector("span");
  if (status) status.textContent = text;
}

function decoratePendingMedia(admin) {
  const pending = normalizePending(admin.pendingFiles);

  if (pending.main) {
    const preview = admin.querySelector("[data-main-preview]");
    if (preview) {
      preview.innerHTML = `<img src="${objectUrl(pending.main)}" alt="Pré-visualização da imagem principal">`;
    }

    const review = admin.querySelector(".review-public-card .review-image");
    if (review) {
      review.innerHTML = `<img src="${objectUrl(pending.main)}" alt="Pré-visualização da imagem principal">`;
    }

    updateUploadZone(
      admin.querySelector('[name="mainImageFile"]'),
      `${pending.main.name || "imagem"} — preservada nesta edição`,
    );
  }

  if (pending.gallery.length) {
    const preview = admin.querySelector(".gallery-preview");
    if (preview) {
      const existing = preview.querySelector("p") ? "" : preview.innerHTML;
      preview.innerHTML = existing + pending.gallery.map((file) => `
        <figure class="pending-media">
          <img src="${objectUrl(file)}" alt="">
          <figcaption>${file.name || "imagem selecionada"} <b>pendente</b></figcaption>
        </figure>`).join("");
    }

    updateUploadZone(
      admin.querySelector('[name="galleryFiles"]'),
      `${pending.gallery.length} imagem(ns) preservada(s) nesta edição`,
    );
  }

  if (pending.documents.length) {
    const preview = admin.querySelector(".document-preview");
    if (preview) {
      const existing = preview.querySelector("p") ? "" : preview.innerHTML;
      preview.innerHTML = existing + pending.documents.map((file) => `
        <div class="pending-media">
          <i class="bi bi-file-earmark-arrow-up"></i>
          <span>${file.name || "documento selecionado"} <b>pendente</b></span>
        </div>`).join("");
    }

    updateUploadZone(
      admin.querySelector('[name="documentFiles"]'),
      `${pending.documents.length} documento(s) preservado(s) nesta edição`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Mensagem clara para credenciais sem permissão de escrita.                  */
/* -------------------------------------------------------------------------- */

const previousFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init = {}) => {
  const response = await previousFetch(input, init);
  const url = typeof input === "string" ? input : input.url;
  const method = String(
    init.method || (input instanceof Request ? input.method : "GET"),
  ).toUpperCase();

  const isRepositoryWrite =
    WRITE_METHODS.has(method)
    && url.startsWith("https://api.github.com/repos/glaucodeveloper/isocon/")
    && (
      url.includes("/contents/")
      || url.includes("/git/blobs")
      || url.includes("/git/trees")
      || url.includes("/git/commits")
      || url.includes("/git/refs")
    );

  if (response.status !== 403 || !isRepositoryWrite) return response;

  const payload = await response.clone().json().catch(() => ({}));
  const original = String(payload.message || "");
  const accepted = response.headers.get("x-accepted-github-permissions") || "";

  if (!/resource not accessible|forbidden|permission/i.test(original)) {
    return response;
  }

  const message = [
    "A credencial foi reconhecida, mas não possui autorização para gravar arquivos no catálogo.",
    "Crie uma credencial fine-grained para o proprietário glaucodeveloper, selecione somente o repositório isocon e defina Contents como Read and write.",
    accepted ? `Permissão informada pela API: ${accepted}.` : "",
    "Entre novamente na administração após substituir a credencial.",
  ].filter(Boolean).join(" ");

  return new Response(JSON.stringify({ ...payload, message }), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

/* -------------------------------------------------------------------------- */
/* Remove o acesso administrativo da barra pública mesmo em versões antigas.  */
/* -------------------------------------------------------------------------- */

function removePublicAdminLinks(root = document) {
  root.querySelectorAll('site-header a[href="#/admin"]').forEach((link) => {
    link.remove();
  });
}

/* -------------------------------------------------------------------------- */
/* Integração com o componente administrativo existente.                      */
/* -------------------------------------------------------------------------- */

const AdminApp = customElements.get("admin-app");
const prototype = AdminApp?.prototype;

if (prototype && !prototype.__isoconPersistentMediaPatch) {
  prototype.__isoconPersistentMediaPatch = true;

  const previousRenderRoute = prototype.renderRoute;
  const previousRenderShell = prototype.renderShell;
  const previousBindItemForm = prototype.bindItemForm;
  const previousPersistCatalog = prototype.persistCatalog;

  prototype.renderRoute = function patchedRenderRoute() {
    const previousKey = this._persistentMediaKey || "";
    const previousPending = normalizePending(this.pendingFiles);

    previousRenderRoute.call(this);

    const nextKey = itemRouteKey(this);
    this._persistentMediaKey = nextKey;

    if (!nextKey) return;

    if (nextKey === previousKey && hasFiles(previousPending)) {
      this.pendingFiles = previousPending;
      this.renderShell(this.currentAdminRoute());
      return;
    }

    if (!hasFiles(this.pendingFiles) && this._mediaRestoreRequested !== nextKey) {
      this._mediaRestoreRequested = nextKey;

      restorePendingMedia(this, nextKey).then((restored) => {
        if (!restored || itemRouteKey(this) !== nextKey) return;
        this.renderShell(this.currentAdminRoute());
      });
    }
  };

  prototype.renderShell = function patchedRenderShell(current) {
    previousRenderShell.call(this, current);
    removePublicAdminLinks();
    if (current.startsWith("/admin/item/")) {
      queueMicrotask(() => decoratePendingMedia(this));
    }
  };

  prototype.bindItemForm = function patchedBindItemForm() {
    previousBindItemForm.call(this);

    const form = this.querySelector("#adminItemForm");
    if (!form) return;

    const saveNow = async () => {
      await persistPendingMedia(this).catch((error) => {
        console.warn("Não foi possível preservar a mídia temporária.", error);
      });
      decoratePendingMedia(this);
    };

    form.elements.mainImageFile?.addEventListener("change", saveNow);
    form.elements.galleryFiles?.addEventListener("change", saveNow);
    form.elements.documentFiles?.addEventListener("change", saveNow);

    form.addEventListener("submit", () => {
      /*
       * Captura antes do listener assíncrono original iniciar os uploads.
       * O File/Blob permanece no IndexedDB até a confirmação do catálogo.
       */
      persistPendingMedia(this);
    }, true);

    this.querySelector("[data-save-later]")?.addEventListener("click", saveNow);
    this.querySelectorAll("[data-next], [data-previous], [data-step]")
      .forEach((button) => button.addEventListener("click", saveNow, true));
  };

  prototype.persistCatalog = async function patchedPersistCatalog(message) {
    const result = await previousPersistCatalog.call(this, message);

    if (
      itemRouteKey(this)
      && /(?:adiciona|atualiza)\s+item/i.test(String(message || ""))
    ) {
      const key = itemRouteKey(this);
      await deleteDraft(key).catch(() => undefined);
      this.pendingFiles = { main: null, gallery: [], documents: [] };
      this._mediaRestoreRequested = "";
    }

    return result;
  };
}

new MutationObserver(() => removePublicAdminLinks())
  .observe(document.documentElement, { childList: true, subtree: true });

removePublicAdminLinks();
