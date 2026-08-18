import {
  state,
  githubConfig,
  esc,
  validatePat,
} from "./utils.js";
import "./components.js";
import "./admin.js";

/*
 * ISOCON — interface administrativa institucional e presença remota.
 *
 * A interface não expõe GitHub, PAT, branch, commit ou caminhos técnicos.
 * A integração continua funcionando internamente.
 *
 * A presença remota usa o branch técnico "presence", que é substituído a
 * cada heartbeat. O branch contém somente admin-status.json e não polui o
 * histórico do branch principal.
 */

const PRESENCE = Object.freeze({
  branch: "presence",
  file: "admin-status.json",
  pollMs: 5000,
  heartbeatMs: 20000,
  ttlMs: 90000,
  rawUrl: `https://raw.githubusercontent.com/${githubConfig.owner}/${githubConfig.repo}/presence/admin-status.json`,
});

const ADMIN_SESSION_ID_KEY = "isoconRemotePresenceSession";
const REMOTE_STATE_EVENT = "isoconremotepresencechange";
const LOCAL_PRESENCE_KEY = "isoconAdminPresenceSessions";
const LOCAL_PRESENCE_TTL = 35000;

let remotePresence = {
  online: false,
  displayName: "ISOCON Administração",
  updatedAt: null,
  expiresAt: null,
};

let remotePollTimer = null;
let remoteHeartbeatTimer = null;
let remoteWriteQueue = Promise.resolve();

const uuid = () =>
  globalThis.crypto?.randomUUID?.()
  || `presence-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function presenceSessionId() {
  let value = sessionStorage.getItem(ADMIN_SESSION_ID_KEY);
  if (!value) {
    value = uuid();
    sessionStorage.setItem(ADMIN_SESSION_ID_KEY, value);
  }
  return value;
}

function isRemotePresenceOnline(value = remotePresence) {
  if (!value?.online || !value?.expiresAt) return false;
  return Date.parse(value.expiresAt) > Date.now();
}

function isLocalPresenceOnline() {
  try {
    const sessions = JSON.parse(localStorage.getItem(LOCAL_PRESENCE_KEY) || "{}");
    const limit = Date.now() - LOCAL_PRESENCE_TTL;
    return Object.values(sessions || {}).some((session) =>
      Number(session?.lastSeen || 0) >= limit
    );
  } catch {
    return false;
  }
}

function isEffectivePresenceOnline() {
  return isLocalPresenceOnline() || isRemotePresenceOnline();
}

function setOptimisticPresence(online) {
  const now = Date.now();
  remotePresence = {
    online,
    displayName: "ISOCON Administração",
    sessionId: presenceSessionId(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(online ? now + PRESENCE.ttlMs : now).toISOString(),
  };
  document.dispatchEvent(new CustomEvent(REMOTE_STATE_EVENT, {
    detail: remotePresence,
  }));
  applyRemotePresenceToChats();
}

function sanitizeAdministrativeMessage(value = "") {
  return String(value)
    .replace(/GitHub Personal Access Token/gi, "credencial administrativa")
    .replace(/GitHub PAT/gi, "credencial administrativa")
    .replace(/Personal Access Token/gi, "credencial administrativa")
    .replace(/\bPAT\b/gi, "credencial")
    .replace(/GitHub Pages Actions?/gi, "rotina automática de publicação")
    .replace(/GitHub Actions?/gi, "rotina automática de publicação")
    .replace(/Contents API/gi, "serviço de publicação")
    .replace(/GitHub/gi, "plataforma de publicação")
    .replace(/repositório oficial/gi, "base institucional")
    .replace(/repositório/gi, "base institucional")
    .replace(/\bcommits?\b/gi, "registro de atualização")
    .replace(/\bBranch main\b/gi, "Versão principal")
    .replace(/\bbranch\b/gi, "versão")
    .replace(/\bJSON\b/gi, "dados estruturados")
    .replace(/Versionado no Git/gi, "Atualizado na base")
    .replace(/histórico no Git/gi, "histórico de alterações")
    .replace(/salvo no GitHub/gi, "salvo com sucesso")
    .replace(/gravar(?:-lo)? no GitHub/gi, "publicar as alterações");
}

function sanitizeVisibleText(root) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const next = sanitizeAdministrativeMessage(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  root.querySelectorAll(".bi-github").forEach((icon) => {
    icon.classList.remove("bi-github");
    icon.classList.add("bi-shield-check");
  });

  root.querySelectorAll('input[placeholder*="github"], input[placeholder*="pat" i]')
    .forEach((input) => {
      input.placeholder = "Insira sua credencial de acesso";
    });
}

/* -------------------------------------------------------------------------- */
/* Publicação de presença em branch técnico substituível.                     */
/* -------------------------------------------------------------------------- */

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function apiRequest(path, token, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}${path}`, {
    ...options,
    headers: {
      ...apiHeaders(token),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `Falha de presença remota (${response.status}).`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchRemotePresence() {
  try {
    const response = await fetch(`${PRESENCE.rawUrl}?v=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      remotePresence = {
        online: false,
        displayName: "ISOCON Administração",
        updatedAt: null,
        expiresAt: null,
      };
    } else {
      const payload = await response.json();
      remotePresence = {
        online: Boolean(payload.online),
        displayName: "ISOCON Administração",
        updatedAt: payload.updatedAt || null,
        expiresAt: payload.expiresAt || null,
        sessionId: payload.sessionId || "",
      };
    }
  } catch {
    remotePresence = {
      ...remotePresence,
      online: isRemotePresenceOnline(remotePresence),
    };
  }

  document.dispatchEvent(new CustomEvent(REMOTE_STATE_EVENT, {
    detail: remotePresence,
  }));

  applyRemotePresenceToChats();
  return remotePresence;
}

async function currentPublishedPresence() {
  try {
    const response = await fetch(`${PRESENCE.rawUrl}?read=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function replacePresenceBranch(payload, token) {
  /*
   * Cada atualização cria um commit técnico baseado no HEAD principal e
   * força somente o branch "presence". O branch principal não recebe commits.
   */
  const mainRef = await apiRequest(
    `/git/ref/heads/${encodeURIComponent(githubConfig.branch || "main")}`,
    token,
  );

  const baseSha = mainRef?.object?.sha;
  if (!baseSha) {
    throw new Error("Não foi possível localizar a versão principal para publicar a presença.");
  }

  const blob = await apiRequest("/git/blobs", token, {
    method: "POST",
    body: JSON.stringify({
      content: JSON.stringify(payload, null, 2),
      encoding: "utf-8",
    }),
  });

  const tree = await apiRequest("/git/trees", token, {
    method: "POST",
    body: JSON.stringify({
      tree: [{
        path: PRESENCE.file,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      }],
    }),
  });

  const commit = await apiRequest("/git/commits", token, {
    method: "POST",
    body: JSON.stringify({
      message: "Atualiza presença administrativa",
      tree: tree.sha,
      parents: [baseSha],
    }),
  });

  const getRefPath = `/git/ref/heads/${encodeURIComponent(PRESENCE.branch)}`;
  const updateRefPath = `/git/refs/heads/${encodeURIComponent(PRESENCE.branch)}`;

  const refResponse = await fetch(
    `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}${getRefPath}`,
    {
      cache: "no-store",
      headers: apiHeaders(token),
    },
  );

  if (refResponse.status === 404) {
    const createResponse = await fetch(
      `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}/git/refs`,
      {
        method: "POST",
        headers: apiHeaders(token),
        body: JSON.stringify({
          ref: `refs/heads/${PRESENCE.branch}`,
          sha: commit.sha,
        }),
      },
    );

    if (createResponse.status === 422) {
      await apiRequest(updateRefPath, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: true }),
      });
    } else if (!createResponse.ok) {
      const detail = await createResponse.json().catch(() => ({}));
      throw new Error(detail.message || "Não foi possível criar o canal de presença.");
    }
    return;
  }

  if (!refResponse.ok) {
    const detail = await refResponse.json().catch(() => ({}));
    throw new Error(detail.message || "Não foi possível consultar o canal de presença.");
  }

  await apiRequest(updateRefPath, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
}

function queuePresenceWrite(online, token = state.token) {
  if (!token) return Promise.resolve();

  remoteWriteQueue = remoteWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (!online) {
        const current = await currentPublishedPresence();
        if (
          current?.online
          && current.sessionId
          && current.sessionId !== presenceSessionId()
          && Date.parse(current.expiresAt || 0) > Date.now()
        ) {
          return;
        }
      }

      const now = Date.now();
      const payload = {
        online,
        displayName: "ISOCON Administração",
        sessionId: presenceSessionId(),
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(online ? now + PRESENCE.ttlMs : now).toISOString(),
      };

      await replacePresenceBranch(payload, token);
      remotePresence = payload;
      document.dispatchEvent(new CustomEvent(REMOTE_STATE_EVENT, {
        detail: remotePresence,
      }));
      applyRemotePresenceToChats();
    })
    .catch((error) => {
      console.warn("Não foi possível atualizar a presença administrativa.", error);
    });

  return remoteWriteQueue;
}

function startRemoteHeartbeat() {
  if (!state.token) return;
  clearInterval(remoteHeartbeatTimer);

  // Atualiza imediatamente o chat no mesmo navegador.
  setOptimisticPresence(true);

  // Publica para outros navegadores e dispositivos.
  queuePresenceWrite(true);
  remoteHeartbeatTimer = setInterval(() => {
    if (state.token) {
      setOptimisticPresence(true);
      queuePresenceWrite(true);
    }
  }, PRESENCE.heartbeatMs);
}

async function stopRemoteHeartbeat({ publishOffline = true } = {}) {
  clearInterval(remoteHeartbeatTimer);
  remoteHeartbeatTimer = null;

  setOptimisticPresence(false);

  if (publishOffline && state.token) {
    await queuePresenceWrite(false, state.token);
  }
}

function startRemotePolling() {
  clearInterval(remotePollTimer);
  fetchRemotePresence();
  remotePollTimer = setInterval(fetchRemotePresence, PRESENCE.pollMs);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    fetchRemotePresence();
    if (state.token) queuePresenceWrite(true);
  }
});

document.addEventListener("adminpresencechange", () => {
  applyRemotePresenceToChats();
});

window.addEventListener("storage", (event) => {
  if (event.key === LOCAL_PRESENCE_KEY) {
    applyRemotePresenceToChats();
  }
});

// Mantém o indicador coerente mesmo quando uma aba fecha sem emitir evento.
setInterval(applyRemotePresenceToChats, 3000);

/* -------------------------------------------------------------------------- */
/* Chat: status lido por polling no branch de presença.                       */
/* -------------------------------------------------------------------------- */

function applyRemotePresenceToChats() {
  const online = isEffectivePresenceOnline();
  document.querySelectorAll("chat-widget").forEach((widget) => {
    const dot = widget.querySelector(".online-dot");
    const status = widget.querySelector(".chat-panel-header small");

    if (dot) {
      dot.classList.toggle("online", online);
      dot.classList.toggle("offline", !online);
    }

    if (status) {
      status.textContent = online
        ? "ISOCON Administração está online agora"
        : "Equipe ausente — deixe sua mensagem";
    }
  });
}

const ChatWidget = customElements.get("chat-widget");
const chatPrototype = ChatWidget?.prototype;

if (chatPrototype && !chatPrototype.__isoconRemotePresencePatch) {
  chatPrototype.__isoconRemotePresencePatch = true;
  const previousRender = chatPrototype.render;
  const previousConnected = chatPrototype.connectedCallback;
  const previousDisconnected = chatPrototype.disconnectedCallback;

  chatPrototype.connectedCallback = function patchedInstitutionalChatConnected() {
    previousConnected.call(this);
    startRemotePolling();
    queueMicrotask(applyRemotePresenceToChats);
  };

  chatPrototype.disconnectedCallback = function patchedInstitutionalChatDisconnected() {
    previousDisconnected?.call(this);
  };

  chatPrototype.render = function patchedInstitutionalChatRender() {
    previousRender.call(this);
    applyRemotePresenceToChats();
  };
}

/* -------------------------------------------------------------------------- */
/* Login e área administrativa institucionais.                                */
/* -------------------------------------------------------------------------- */

const AdminApp = customElements.get("admin-app");
const adminPrototype = AdminApp?.prototype;

function institutionalLoginMarkup(message = "") {
  const safeMessage = esc(sanitizeAdministrativeMessage(message));

  return `
    <main class="admin-login">
      <section class="admin-login-visual">
        <div class="admin-login-brand">
          <img class="brand-symbol brand-logo-image" src="./assets/images/logo%201.png" alt="ISOCON">
          <span>ISOCON<small>ADMINISTRAÇÃO INSTITUCIONAL</small></span>
        </div>

        <div>
          <span class="red-line"></span>
          <h1>Catálogo organizado.<br>Gestão centralizada.</h1>
          <p>Administre segmentos, linhas, itens, conteúdos e canais comerciais da presença digital da ISOCON.</p>
        </div>

        <ul>
          <li><i class="bi bi-shield-check"></i>Acesso administrativo restrito</li>
          <li><i class="bi bi-collection"></i>Gestão integrada do catálogo</li>
          <li><i class="bi bi-cloud-check"></i>Publicação controlada</li>
        </ul>
      </section>

      <section class="admin-login-form">
        <form id="patLogin">
          <a href="#/" class="back-site">
            <i class="bi bi-arrow-left"></i>Voltar ao site
          </a>

          <div class="admin-login-lock"><i class="bi bi-shield-lock"></i></div>
          <span class="admin-login-eyebrow">ISOCON ADMINISTRAÇÃO</span>
          <h2>Área administrativa</h2>
          <p>Informe sua credencial administrativa para acessar a gestão institucional.</p>

          <label>Credencial administrativa
            <div class="password-field">
              <input
                class="form-control form-control-lg"
                required
                type="password"
                autocomplete="current-password"
                name="token"
                placeholder="Insira sua credencial de acesso">
              <button type="button" data-show-password aria-label="Exibir credencial">
                <i class="bi bi-eye"></i>
              </button>
            </div>
          </label>

          <div class="pat-help">
            <i class="bi bi-info-circle"></i>
            <span>A credencial é usada somente para validar esta sessão administrativa e permanece protegida no navegador.</span>
          </div>

          <button class="btn btn-primary btn-lg w-100" type="submit">
            <i class="bi bi-box-arrow-in-right me-2"></i>Entrar na administração
          </button>

          <div class="admin-login-message ${message ? "show" : ""}" id="loginMessage">${safeMessage}</div>
        </form>
      </section>
    </main>`;
}

function bindInstitutionalLogin(admin) {
  admin.querySelector("[data-show-password]")?.addEventListener("click", (event) => {
    const input = admin.querySelector('input[name="token"]');
    input.type = input.type === "password" ? "text" : "password";
    event.currentTarget.innerHTML =
      `<i class="bi bi-${input.type === "password" ? "eye" : "eye-slash"}"></i>`;
  });

  admin.querySelector("#patLogin")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") || "").trim();
    const messageBox = admin.querySelector("#loginMessage");

    messageBox.className = "admin-login-message show loading";
    messageBox.textContent = "Validando a credencial administrativa...";

    try {
      const result = await validatePat(token);
      state.token = token;
      sessionStorage.setItem("isoconPat", token);
      admin.profile = result.profile;
      await admin.openSession();
    } catch (error) {
      messageBox.className = "admin-login-message show error";
      messageBox.textContent = sanitizeAdministrativeMessage(
        error?.message || "A credencial não pôde ser validada.",
      );
    }
  });
}

function institutionalSettingsView(admin) {
  const site = state.data.site;

  return `
    <div class="settings-grid">
      <form class="admin-panel settings-form" id="siteSettingsForm">
        <div class="panel-heading">
          <div>
            <h2>Dados institucionais</h2>
            <p>Informações compartilhadas pelo cabeçalho, contato e rodapé.</p>
          </div>
        </div>

        <div class="row g-3">
          <div class="col-md-6"><label>Telefone<input class="form-control" name="phone" value="${esc(site.phone)}"></label></div>
          <div class="col-md-6"><label>WhatsApp de exibição<input class="form-control" name="whatsappDisplay" value="${esc(site.whatsappDisplay)}"></label></div>
          <div class="col-md-6"><label>WhatsApp internacional<input class="form-control" name="whatsapp" value="${esc(site.whatsapp)}"></label></div>
          <div class="col-md-6"><label>E-mail<input class="form-control" type="email" name="email" value="${esc(site.email)}"></label></div>
          <div class="col-md-6"><label>Horário<input class="form-control" name="hours" value="${esc(site.hours)}"></label></div>
          <div class="col-md-6"><label>Cidade / região<input class="form-control" name="addressTitle" value="${esc(site.addressTitle)}"></label></div>
          <div class="col-12"><label>Endereço <span class="optional">(uma linha por entrada)</span><textarea class="form-control" rows="3" name="addressLines">${esc((site.addressLines || []).join("\n"))}</textarea></label></div>
          <div class="col-12"><label>Narrativa logística<textarea class="form-control" rows="3" name="coverage">${esc(site.coverage)}</textarea></label></div>
          <div class="col-12"><button class="btn btn-primary"><i class="bi bi-check2-circle me-2"></i>Salvar configurações</button></div>
        </div>
      </form>

      <aside class="admin-panel integration-card institutional-session-card">
        <div class="panel-heading">
          <div>
            <h2>Sessão administrativa</h2>
            <p>Identidade e estado atual do acesso.</p>
          </div>
        </div>

        <div class="institutional-admin-identity">
          <span class="institutional-admin-avatar">IS</span>
          <div>
            <strong>ISOCON Administração</strong>
            <span>Gestão institucional</span>
          </div>
          <b>Ativa</b>
        </div>

        <dl>
          <div><dt>Área</dt><dd>Administração institucional</dd></div>
          <div><dt>Catálogo</dt><dd>Sincronizado</dd></div>
          <div><dt>Publicação</dt><dd>Controlada</dd></div>
          <div><dt>Atendimento</dt><dd>${isEffectivePresenceOnline() ? "Online" : "Ativando presença"}</dd></div>
        </dl>

        <div class="security-note">
          <i class="bi bi-shield-lock"></i>
          <span>A credencial permanece somente nesta sessão do navegador e não é exibida na interface.</span>
        </div>

        <button class="btn btn-outline-danger w-100" data-institutional-logout>
          <i class="bi bi-box-arrow-right me-2"></i>Sair da administração
        </button>
      </aside>
    </div>`;
}

function decoratePublicationPanel(admin) {
  const panel = admin.querySelector(".admin-publication-panel");
  if (!panel) return;

  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <h2>Publicação institucional</h2>
        <p>Estado da base pública do catálogo.</p>
      </div>
    </div>

    <div class="institutional-publication-status">
      <i class="bi bi-cloud-check"></i>
      <div><strong>Base institucional</strong><span>Conteúdo sincronizado</span></div>
      <b>Disponível</b>
    </div>

    <dl>
      <div><dt>Conteúdo</dt><dd>Catálogo institucional</dd></div>
      <div><dt>Modo</dt><dd>Publicação controlada</dd></div>
      <div><dt>Atualização</dt><dd>Automática após salvar</dd></div>
    </dl>

    <a class="btn btn-outline-primary w-100" href="#/admin/configuracoes">Ver configurações</a>`;
}

function decorateReviewSummaries(admin) {
  admin.querySelectorAll(".commit-summary").forEach((summary) => {
    summary.innerHTML = `
      <i class="bi bi-cloud-arrow-up"></i>
      <div>
        <h3>O que acontecerá ao salvar</h3>
        <ol>
          <li>Imagens e documentos selecionados serão incorporados ao item.</li>
          <li>Os dados do catálogo serão atualizados.</li>
          <li>Uma nova versão institucional será registrada.</li>
          <li>O website receberá a publicação atualizada.</li>
        </ol>
      </div>`;
  });
}

function profileMenuMarkup() {
  return `
    <div class="institutional-profile-menu">
      <button class="institutional-profile-trigger" type="button" data-profile-menu-toggle aria-expanded="false">
        <span class="institutional-profile-avatar">IS</span>
        <span class="institutional-profile-copy">
          <strong>ISOCON Administração</strong>
          <small>Gestão institucional</small>
        </span>
        <i class="bi bi-chevron-down"></i>
      </button>

      <div class="institutional-profile-dropdown" data-profile-menu hidden>
        <header>
          <span class="institutional-profile-avatar">IS</span>
          <div><strong>ISOCON Administração</strong><small>Sessão administrativa ativa</small></div>
        </header>
        <a href="#/admin/configuracoes"><i class="bi bi-gear"></i><span>Configurações</span></a>
        <button type="button" data-institutional-logout><i class="bi bi-box-arrow-right"></i><span>Sair</span></button>
      </div>
    </div>`;
}

async function institutionalLogout(admin) {
  await stopRemoteHeartbeat({ publishOffline: true });
  state.token = "";
  state.adminRemote = null;
  sessionStorage.removeItem("isoconPat");
  localStorage.removeItem("isoconAdminPresenceSessions");
  document.dispatchEvent(new CustomEvent("adminpresencechange"));
  admin.renderLogin("Sessão encerrada.");
}

function bindProfileMenu(admin) {
  const trigger = admin.querySelector("[data-profile-menu-toggle]");
  const menu = admin.querySelector("[data-profile-menu]");

  trigger?.addEventListener("click", (event) => {
    event.stopPropagation();
    const opening = menu.hidden;
    menu.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
  });

  admin.querySelectorAll("[data-institutional-logout]").forEach((button) => {
    button.addEventListener("click", () => institutionalLogout(admin));
  });

  admin._institutionalProfileOutsideHandler?.();
  const outside = (event) => {
    if (!event.target.closest(".institutional-profile-menu")) {
      if (menu) menu.hidden = true;
      trigger?.setAttribute("aria-expanded", "false");
    }
  };

  document.addEventListener("click", outside);
  admin._institutionalProfileOutsideHandler = () =>
    document.removeEventListener("click", outside);
}


function adminHelpModalMarkup() {
  return `
    <div class="admin-help-modal-backdrop" data-admin-help-modal hidden>
      <section class="admin-help-modal" role="dialog" aria-modal="true" aria-labelledby="adminHelpTitle">
        <header>
          <div class="admin-help-modal-icon"><i class="bi bi-headset"></i></div>
          <div>
            <span>CENTRAL DE ORIENTAÇÃO</span>
            <h2 id="adminHelpTitle">Ajuda da administração</h2>
            <p>Acesse rapidamente os fluxos principais da gestão ISOCON.</p>
          </div>
          <button type="button" data-admin-help-close aria-label="Fechar ajuda">
            <i class="bi bi-x-lg"></i>
          </button>
        </header>

        <div class="admin-help-modal-grid">
          <a href="#/admin/itens" data-admin-help-link>
            <i class="bi bi-box"></i>
            <span><strong>Itens do catálogo</strong><small>Cadastrar, revisar e publicar produtos.</small></span>
          </a>
          <a href="#/admin/segmentos" data-admin-help-link>
            <i class="bi bi-diagram-3"></i>
            <span><strong>Segmentos e linhas</strong><small>Organizar a estrutura comercial do catálogo.</small></span>
          </a>
          <a href="#/admin/conversas" data-admin-help-link>
            <i class="bi bi-chat-square-dots"></i>
            <span><strong>Conversas</strong><small>Responder contatos iniciados pelo chat.</small></span>
          </a>
          <a href="#/admin/contatos" data-admin-help-link>
            <i class="bi bi-envelope"></i>
            <span><strong>Mensagens de contato</strong><small>Consultar formulários recebidos.</small></span>
          </a>
          <a href="#/admin/configuracoes" data-admin-help-link>
            <i class="bi bi-gear"></i>
            <span><strong>Configurações</strong><small>Atualizar dados institucionais e canais.</small></span>
          </a>
          <a href="#/" target="_blank" rel="noopener">
            <i class="bi bi-box-arrow-up-right"></i>
            <span><strong>Abrir o website</strong><small>Conferir a apresentação pública em outra aba.</small></span>
          </a>
        </div>

        <section class="admin-help-process">
          <h3>Fluxo recomendado para publicar um item</h3>
          <ol>
            <li><b>1</b><span>Cadastre as informações básicas e a linha correta.</span></li>
            <li><b>2</b><span>Adicione atributos, aplicações, imagens e documentos.</span></li>
            <li><b>3</b><span>Revise disponibilidade, logística e apresentação pública.</span></li>
            <li><b>4</b><span>Salve e aguarde a confirmação da publicação.</span></li>
          </ol>
        </section>

        <footer>
          <i class="bi bi-info-circle"></i>
          <span>Esta central descreve os recursos da interface. A credencial administrativa nunca é exibida aqui.</span>
        </footer>
      </section>
    </div>`;
}

function decorateAdminHelp(admin) {
  const current = admin.querySelector(".admin-help");

  if (current && !current.matches("button")) {
    current.outerHTML = `
      <button type="button" class="admin-help" data-admin-help-open>
        <i class="bi bi-headset"></i>
        <div><strong>Precisa de ajuda?</strong><span>Abrir central de orientação.</span></div>
        <i class="bi bi-chevron-right admin-help-arrow"></i>
      </button>`;
  }

  const shell = admin.querySelector(".admin-shell");
  if (shell && !admin.querySelector("[data-admin-help-modal]")) {
    shell.insertAdjacentHTML("beforeend", adminHelpModalMarkup());
  }

  const modal = admin.querySelector("[data-admin-help-modal]");
  const open = () => {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("admin-help-open");
    queueMicrotask(() => modal.querySelector("[data-admin-help-close]")?.focus());
  };
  const close = () => {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("admin-help-open");
  };

  admin.querySelector("[data-admin-help-open]")?.addEventListener("click", open);
  modal?.querySelector("[data-admin-help-close]")?.addEventListener("click", close);
  modal?.querySelectorAll("[data-admin-help-link]").forEach((link) => {
    link.addEventListener("click", close);
  });
  modal?.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  admin._adminHelpKeyHandler?.();
  const keyHandler = (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) close();
  };
  document.addEventListener("keydown", keyHandler);
  admin._adminHelpKeyHandler = () => document.removeEventListener("keydown", keyHandler);
}

function decorateAdminShell(admin) {
  const topActions = admin.querySelector(".admin-top-actions");
  const profile = topActions?.querySelector(".admin-profile");

  if (profile) profile.outerHTML = profileMenuMarkup();
  else if (topActions && !topActions.querySelector(".institutional-profile-menu")) {
    topActions.insertAdjacentHTML("beforeend", profileMenuMarkup());
  }

  decoratePublicationPanel(admin);
  decorateReviewSummaries(admin);
  decorateAdminHelp(admin);
  sanitizeVisibleText(admin);
  bindProfileMenu(admin);
}

if (adminPrototype && !adminPrototype.__isoconInstitutionalAdminPatch) {
  adminPrototype.__isoconInstitutionalAdminPatch = true;

  const previousOpenSession = adminPrototype.openSession;
  const previousRenderShell = adminPrototype.renderShell;
  const previousSettingsView = adminPrototype.settingsView;
  const previousBindSettings = adminPrototype.bindSettings;
  const previousShowFlash = adminPrototype.showFlash;
  const previousDisconnected = adminPrototype.disconnectedCallback;

  adminPrototype.renderLogin = function patchedInstitutionalLogin(message = "") {
    this.innerHTML = institutionalLoginMarkup(message);
    bindInstitutionalLogin(this);
  };

  adminPrototype.openSession = async function patchedInstitutionalOpenSession() {
    const result = await previousOpenSession.call(this);
    if (state.token && this.profile && state.data) {
      startRemoteHeartbeat();
    }
    return result;
  };

  adminPrototype.settingsView = function patchedInstitutionalSettingsView() {
    return institutionalSettingsView(this);
  };

  adminPrototype.bindSettings = function patchedInstitutionalBindSettings() {
    previousBindSettings.call(this);

    this.querySelectorAll("[data-logout]").forEach((button) => button.remove());

    this.querySelectorAll("[data-institutional-logout]").forEach((button) => {
      button.addEventListener("click", () => institutionalLogout(this));
    });
  };

  adminPrototype.renderShell = function patchedInstitutionalShell(current) {
    previousRenderShell.call(this, current);
    decorateAdminShell(this);
  };

  adminPrototype.showFlash = function patchedInstitutionalFlash(detail) {
    previousShowFlash.call(this, {
      ...detail,
      message: sanitizeAdministrativeMessage(detail?.message || ""),
    });
  };

  adminPrototype.disconnectedCallback = function patchedInstitutionalDisconnected() {
    this._institutionalProfileOutsideHandler?.();
    this._adminHelpKeyHandler?.();
    return previousDisconnected.call(this);
  };
}

document.addEventListener("adminflash", (event) => {
  if (event.detail?.message) {
    event.detail.message = sanitizeAdministrativeMessage(event.detail.message);
  }
}, true);

document.addEventListener("click", (event) => {
  const logout = event.target.closest("[data-institutional-logout]");
  const admin = logout?.closest("admin-app");
  if (logout && admin) {
    event.preventDefault();
    event.stopImmediatePropagation();
    institutionalLogout(admin);
  }
}, true);

startRemotePolling();
