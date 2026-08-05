export const state = {
  data: null,
  quote: JSON.parse(localStorage.getItem("isoconQuote") || "[]"),
  token: sessionStorage.getItem("isoconPat") || "",
  adminRemote: null,
};

export const githubConfig = {
  owner: "glaucodeveloper",
  repo: "isocon",
  branch: "main",
  catalogPath: "website/data/catalog.json",
  uploadPath: "website/assets/uploads",
};

export const esc = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

export const slugify = (value = "") => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

export const route = () => location.hash.slice(1) || "/";
export const queryParams = () => new URLSearchParams(location.hash.split("?")[1] || "");
export const findItem = (id) => state.data.items.find((item) => item.id === id);
export const findLine = (id) => state.data.lines.find((line) => line.id === id);
export const findSegment = (id) => state.data.segments.find((segment) => segment.id === id);

export const whatsappUrl = (message = "Olá, gostaria de falar com a ISOCON.") =>
  `https://wa.me/${state.data.site.whatsapp}?text=${encodeURIComponent(message)}`;

export function saveQuote() {
  localStorage.setItem("isoconQuote", JSON.stringify(state.quote));
  document.dispatchEvent(new CustomEvent("quotechange"));
}
export function addToQuote(id) {
  const existing = state.quote.find((entry) => entry.id === id);
  if (existing) existing.quantity += 1;
  else state.quote.push({ id, quantity: 1, note: "" });
  saveQuote();
}
export function removeFromQuote(id) {
  state.quote = state.quote.filter((entry) => entry.id !== id);
  saveQuote();
}
export function updateQuote(id, patch) {
  const entry = state.quote.find((candidate) => candidate.id === id);
  if (entry) Object.assign(entry, patch);
  saveQuote();
}

export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}
export function decodeBase64Utf8(base64) {
  const clean = base64.replaceAll("\n", "").replaceAll("\r", "");
  const bytes = Uint8Array.from(atob(clean), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function validatePat(token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const [profileResponse, repositoryResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}`, { headers }),
  ]);
  if (!profileResponse.ok || !repositoryResponse.ok) throw new Error("Token inválido ou sem acesso ao repositório.");
  const profile = await profileResponse.json();
  const repository = await repositoryResponse.json();
  if (!(repository.permissions?.push || repository.permissions?.admin)) {
    throw new Error("O token precisa de permissão Contents: Read and write no repositório isocon.");
  }
  return { profile, repository };
}
const repositoryApi = () =>
  `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}`;

const repositoryHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
});

async function githubResolveCatalogEntry(token) {
  const response = await fetch(
    `${repositoryApi()}/git/trees/${encodeURIComponent(githubConfig.branch)}?recursive=1`,
    {
      cache: "no-store",
      headers: repositoryHeaders(token),
    },
  );

  if (response.status === 404 || response.status === 409) return null;

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || "Não foi possível localizar o catálogo na base institucional.",
    );
  }

  const payload = await response.json();
  const candidates = [
    githubConfig.catalogPath,
    "website/data/catalog.json",
    "data/catalog.json",
  ];

  const entry =
    candidates
      .map((path) => (payload.tree || []).find(
        (candidate) => candidate.type === "blob" && candidate.path === path,
      ))
      .find(Boolean)
    || (payload.tree || []).find(
      (candidate) =>
        candidate.type === "blob"
        && candidate.path.endsWith("/data/catalog.json"),
    )
    || null;

  if (entry?.path) {
    githubConfig.catalogPath = entry.path;
    githubConfig.uploadPath = entry.path.startsWith("website/")
      ? "website/assets/uploads"
      : "assets/uploads";
  }

  return entry;
}

async function githubReadBlob(token, sha) {
  const response = await fetch(`${repositoryApi()}/git/blobs/${sha}`, {
    cache: "no-store",
    headers: repositoryHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || "Não foi possível ler o catálogo na base institucional.",
    );
  }

  return response.json();
}

export async function githubReadCatalog(token) {
  const entry = await githubResolveCatalogEntry(token);

  if (!entry) {
    return {
      sha: null,
      data: structuredClone(state.data),
      isNew: true,
    };
  }

  const payload = await githubReadBlob(token, entry.sha);

  return {
    sha: entry.sha,
    data: JSON.parse(decodeBase64Utf8(payload.content)),
    isNew: false,
  };
}

async function githubPutCatalog(token, data, sha, message) {
  const body = {
    message,
    content: encodeBase64Utf8(JSON.stringify(data, null, 2)),
    branch: githubConfig.branch,
  };

  if (sha) body.sha = sha;

  return fetch(
    `${repositoryApi()}/contents/${githubConfig.catalogPath}`,
    {
      method: "PUT",
      headers: {
        ...repositoryHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

export async function githubWriteCatalog(token, data, sha, message) {
  /*
   * O arquivo pode ter sido carregado antes de o caminho remoto ser resolvido.
   * Antes de atualizar, busca-se sempre a entrada atual no Git e utiliza-se
   * o SHA do blob existente. Sem ele, a API interpreta a operação como criação.
   */
  let entry = await githubResolveCatalogEntry(token);
  let currentSha = entry?.sha || sha || null;

  let response = await githubPutCatalog(
    token,
    data,
    currentSha,
    message,
  );

  if (!response.ok) {
    const firstError = await response.clone().json().catch(() => ({}));
    const retryable =
      response.status === 409
      || (
        response.status === 422
        && /sha|does not match|invalid request/i.test(
          String(firstError.message || ""),
        )
      );

    if (retryable) {
      entry = await githubResolveCatalogEntry(token);
      currentSha = entry?.sha || null;

      response = await githubPutCatalog(
        token,
        data,
        currentSha,
        message,
      );
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || "Falha ao atualizar o catálogo institucional.",
    );
  }

  return response.json();
}

export async function githubUploadFile(token, file, itemSlug, group = "items") {
  if (!file || !file.size) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error(`O arquivo ${file.name} excede 8 MB.`);
  const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "bin";
  const stem = file.name.replace(/\.[^.]+$/, "");
  const safeName = `${Date.now()}-${slugify(stem)}.${extension}`;
  const repositoryPath = `${githubConfig.uploadPath}/${group}/${itemSlug}/${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  const response = await fetch(
    `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/contents/${repositoryPath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Adiciona arquivo ${file.name}`,
        content: btoa(binary),
        branch: githubConfig.branch,
      }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Falha ao enviar ${file.name}.`);
  }
  return `./assets/uploads/${group}/${itemSlug}/${safeName}`;
}
