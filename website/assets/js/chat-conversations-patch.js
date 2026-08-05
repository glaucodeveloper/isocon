import { state, esc, route } from "./utils.js";
import "./components.js";
import "./admin.js";

const STORAGE = Object.freeze({
  visitor: "isoconChatVisitor",
  currentConversation: "isoconChatConversationId",
  conversations: "isoconChatConversations",
  adminPresence: "isoconAdminPresenceSessions",
  adminPresenceSession: "isoconAdminPresenceSession",
});

const PRESENCE_TTL = 30000;
const PRESENCE_INTERVAL = 9000;

const safeParse = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const readStorage = (key, fallback) =>
  safeParse(localStorage.getItem(key) || "null", fallback);

const writeStorage = (key, value) =>
  localStorage.setItem(key, JSON.stringify(value));

const uuid = (prefix) =>
  globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatTime = (value) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" })
    .format(new Date(value));

const formatListTime = (value) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatTime(value);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
};

function conversations() {
  const value = readStorage(STORAGE.conversations, []);
  return Array.isArray(value) ? value : [];
}

function saveConversations(value) {
  writeStorage(STORAGE.conversations, value);
  document.dispatchEvent(new CustomEvent("chatconversationschange"));
}

function visitorIdentity() {
  const value = readStorage(STORAGE.visitor, null);
  if (!value?.name || !value?.company) return null;
  return value;
}

function currentConversationId() {
  return localStorage.getItem(STORAGE.currentConversation) || "";
}

function setCurrentConversationId(id) {
  localStorage.setItem(STORAGE.currentConversation, id);
}

function getConversation(id = currentConversationId()) {
  return conversations().find((conversation) => conversation.id === id) || null;
}

function ensureVisitorConversation(identity = visitorIdentity()) {
  const all = conversations();
  const currentId = currentConversationId();
  let conversation = all.find((entry) => entry.id === currentId);

  if (!conversation) {
    conversation = {
      id: uuid("conversation"),
      visitor: {
        name: identity?.name || "",
        company: identity?.company || "",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "open",
      unreadAdmin: 0,
      unreadVisitor: 0,
      messages: [],
    };
    all.unshift(conversation);
    setCurrentConversationId(conversation.id);
    saveConversations(all);
  } else if (identity) {
    conversation.visitor = {
      name: identity.name,
      company: identity.company,
    };
    saveConversations(all);
  }

  return conversation;
}

function addMessage(conversationId, author, text) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return null;

  const all = conversations();
  const conversation = all.find((entry) => entry.id === conversationId);
  if (!conversation) return null;

  conversation.messages.push({
    id: uuid("message"),
    author,
    text: cleanText,
    createdAt: new Date().toISOString(),
  });
  conversation.updatedAt = new Date().toISOString();
  conversation.status = "open";

  if (author === "visitor") conversation.unreadAdmin = Number(conversation.unreadAdmin || 0) + 1;
  if (author === "admin") conversation.unreadVisitor = Number(conversation.unreadVisitor || 0) + 1;

  saveConversations(all);
  return conversation;
}

function markConversationRead(conversationId, audience) {
  const all = conversations();
  const conversation = all.find((entry) => entry.id === conversationId);
  if (!conversation) return;

  const field = audience === "admin" ? "unreadAdmin" : "unreadVisitor";
  if (!conversation[field]) return;
  conversation[field] = 0;
  saveConversations(all);
}

function updateConversation(conversationId, patch) {
  const all = conversations();
  const conversation = all.find((entry) => entry.id === conversationId);
  if (!conversation) return;
  Object.assign(conversation, patch, { updatedAt: new Date().toISOString() });
  saveConversations(all);
}

/* -------------------------------------------------------------------------- */
/* Presença administrativa compartilhada entre abas do mesmo domínio.          */
/* -------------------------------------------------------------------------- */

let presenceTimer = null;

function presenceSessionId() {
  let id = sessionStorage.getItem(STORAGE.adminPresenceSession);
  if (!id) {
    id = uuid("admin");
    sessionStorage.setItem(STORAGE.adminPresenceSession, id);
  }
  return id;
}

function cleanPresenceSessions(value = readStorage(STORAGE.adminPresence, {})) {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, session]) =>
      Number(session?.lastSeen || 0) >= now - PRESENCE_TTL
    ),
  );
}

function heartbeatAdminPresence(profile = {}) {
  const sessions = cleanPresenceSessions();
  sessions[presenceSessionId()] = {
    id: presenceSessionId(),
    login: profile.login || "",
    name: profile.name || profile.login || "Equipe ISOCON",
    avatar: profile.avatar_url || "",
    lastSeen: Date.now(),
  };
  writeStorage(STORAGE.adminPresence, sessions);
  document.dispatchEvent(new CustomEvent("adminpresencechange"));
}

function startAdminPresence(profile) {
  heartbeatAdminPresence(profile);
  clearInterval(presenceTimer);
  presenceTimer = setInterval(() => heartbeatAdminPresence(profile), PRESENCE_INTERVAL);
}

function stopAdminPresence() {
  clearInterval(presenceTimer);
  presenceTimer = null;
  const sessions = cleanPresenceSessions();
  delete sessions[presenceSessionId()];
  writeStorage(STORAGE.adminPresence, sessions);
  document.dispatchEvent(new CustomEvent("adminpresencechange"));
}

function activeAdminPresence() {
  const sessions = cleanPresenceSessions();
  const active = Object.values(sessions).sort((a, b) => b.lastSeen - a.lastSeen);
  return active[0] || null;
}

/* -------------------------------------------------------------------------- */
/* Chat público.                                                               */
/* -------------------------------------------------------------------------- */

const ChatWidget = customElements.get("chat-widget");
const chatPrototype = ChatWidget?.prototype;

function conversationMessagesHtml(conversation) {
  if (!conversation?.messages?.length) {
    return `
      <div class="chat-welcome-message">
        <strong>Olá! Como podemos ajudar?</strong>
        <span>Envie uma mensagem para iniciar o atendimento comercial.</span>
      </div>`;
  }

  return conversation.messages.map((message) => `
    <div class="chat-bubble ${message.author === "visitor" ? "visitor" : "admin"}">
      <div>${esc(message.text).replaceAll("\n", "<br>")}</div>
      <time>${formatTime(message.createdAt)}</time>
    </div>`).join("");
}

function identificationModalHtml(widget) {
  if (!widget.identificationOpen) return "";
  const identity = visitorIdentity();

  return `
    <div class="chat-identification-backdrop">
      <section class="chat-identification-modal" role="dialog" aria-modal="true" aria-labelledby="chatIdentificationTitle">
        <button type="button" class="chat-identification-close" data-identification-close aria-label="Fechar">
          <i class="bi bi-x-lg"></i>
        </button>
        <div class="chat-identification-icon"><i class="bi bi-building-check"></i></div>
        <span>IDENTIFICAÇÃO COMERCIAL</span>
        <h2 id="chatIdentificationTitle">Antes de enviar sua primeira mensagem</h2>
        <p>Informe quem está falando e a empresa que representa. Esses dados acompanham a conversa no painel administrativo.</p>
        <form data-identification-form>
          <label>
            Seu nome
            <input class="form-control" name="name" autocomplete="name" required maxlength="100"
              value="${esc(identity?.name || "")}" placeholder="Nome do responsável">
          </label>
          <label>
            Empresa representada
            <input class="form-control" name="company" autocomplete="organization" required maxlength="140"
              value="${esc(identity?.company || "")}" placeholder="Razão social ou nome comercial">
          </label>
          <button class="btn btn-primary" type="submit">
            <i class="bi bi-chat-dots me-2"></i>Identificar e enviar mensagem
          </button>
        </form>
        <small>Os dados ficam armazenados neste navegador para manter o histórico da conversa.</small>
      </section>
    </div>`;
}

function bindChatWidget(widget) {
  widget.querySelector("[data-toggle]")?.addEventListener("click", () => {
    widget.open = !widget.open;
    if (widget.open) {
      const conversation = getConversation();
      if (conversation) markConversationRead(conversation.id, "visitor");
    }
    widget.render();
  });

  widget.querySelector("[data-close]")?.addEventListener("click", () => {
    widget.open = false;
    widget.render();
  });

  widget.querySelectorAll("[data-chat-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = widget.querySelector('[name="chatMessage"]');
      if (!input) return;
      input.value = button.dataset.chatPrompt || "";
      input.focus();
    });
  });

  widget.querySelector("[data-chat-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.elements.chatMessage;
    const text = String(input.value || "").trim();
    if (!text) return;

    if (!visitorIdentity()) {
      widget.pendingMessage = text;
      widget.identificationOpen = true;
      widget.render();
      queueMicrotask(() => widget.querySelector('[name="name"]')?.focus());
      return;
    }

    const conversation = ensureVisitorConversation();
    addMessage(conversation.id, "visitor", text);
    widget.pendingMessage = "";
    widget.open = true;
    widget.render();
  });

  widget.querySelector("[data-identification-close]")?.addEventListener("click", () => {
    widget.identificationOpen = false;
    widget.render();
  });

  widget.querySelector("[data-identification-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identity = {
      name: String(form.get("name") || "").trim(),
      company: String(form.get("company") || "").trim(),
    };
    if (!identity.name || !identity.company) return;

    writeStorage(STORAGE.visitor, identity);
    const conversation = ensureVisitorConversation(identity);
    const pending = String(widget.pendingMessage || "").trim();
    widget.identificationOpen = false;
    widget.pendingMessage = "";

    if (pending) addMessage(conversation.id, "visitor", pending);
    widget.open = true;
    widget.render();
  });

  const log = widget.querySelector("[data-chat-log]");
  if (log) log.scrollTop = log.scrollHeight;
}

if (chatPrototype && !chatPrototype.__isoconConversationsPatch) {
  chatPrototype.__isoconConversationsPatch = true;

  chatPrototype.connectedCallback = function patchedChatConnected() {
    this.open = false;
    this.identificationOpen = false;
    this.pendingMessage = "";
    this._chatRefresh = () => {
      if (this.isConnected) this.render();
    };
    document.addEventListener("chatconversationschange", this._chatRefresh);
    document.addEventListener("adminpresencechange", this._chatRefresh);
    this.render();
  };

  chatPrototype.disconnectedCallback = function patchedChatDisconnected() {
    document.removeEventListener("chatconversationschange", this._chatRefresh);
    document.removeEventListener("adminpresencechange", this._chatRefresh);
  };

  chatPrototype.render = function patchedChatRender() {
    const presence = activeAdminPresence();
    const identity = visitorIdentity();
    const conversation = getConversation();
    const unread = Number(conversation?.unreadVisitor || 0);

    this.innerHTML = `
      ${this.open ? `
        <aside class="chat-panel chat-panel-expanded">
          <header class="chat-panel-header">
            <div class="chat-agent">
              <span class="online-dot ${presence ? "online" : "offline"}"></span>
              <div>
                <strong>Atendimento ISOCON</strong>
                <small>${presence
                  ? `${esc(presence.name)} está online agora`
                  : "Equipe ausente — deixe sua mensagem"}</small>
              </div>
            </div>
            <button data-close aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
          </header>

          ${identity ? `
            <div class="chat-visitor-summary">
              <i class="bi bi-person-check"></i>
              <span><strong>${esc(identity.name)}</strong><small>${esc(identity.company)}</small></span>
            </div>` : ""}

          <div class="chat-conversation-log" data-chat-log aria-live="polite">
            ${conversationMessagesHtml(conversation)}
          </div>

          ${!conversation?.messages?.length ? `
            <div class="chat-quick-actions">
              <button type="button" data-chat-prompt="Gostaria de solicitar uma cotação.">Solicitar cotação</button>
              <button type="button" data-chat-prompt="Tenho dúvidas sobre uma linha de produtos.">Dúvidas sobre produtos</button>
              <button type="button" data-chat-prompt="Preciso verificar condições de logística para minha região.">Consultar logística</button>
            </div>` : ""}

          <form class="chat-compose" data-chat-form>
            <input name="chatMessage" autocomplete="off" maxlength="1200"
              value="${esc(this.pendingMessage || "")}"
              placeholder="${identity ? "Digite sua mensagem..." : "Digite a primeira mensagem..."}">
            <button type="submit" aria-label="Enviar mensagem"><i class="bi bi-send-fill"></i></button>
          </form>
          <div class="chat-storage-note">
            <i class="bi bi-shield-check"></i>
            Conversa armazenada neste navegador.
          </div>
        </aside>` : ""}

      <button class="chat-fab" data-toggle aria-label="Atendimento">
        <i class="bi bi-${this.open ? "x-lg" : "chat-dots"}"></i>
        ${!this.open && unread ? `<span class="chat-unread-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
      </button>

      ${identificationModalHtml(this)}
    `;

    bindChatWidget(this);
  };
}

/* -------------------------------------------------------------------------- */
/* Painel administrativo de conversas.                                        */
/* -------------------------------------------------------------------------- */

function selectedConversationFromRoute(all) {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const requested = params.get("id");
  return all.find((conversation) => conversation.id === requested) || all[0] || null;
}

function conversationTab() {
  return new URLSearchParams(location.hash.split("?")[1] || "").get("tab") || "all";
}

function conversationSearch() {
  return new URLSearchParams(location.hash.split("?")[1] || "").get("q") || "";
}

function filteredConversations() {
  const tab = conversationTab();
  const search = conversationSearch().toLowerCase().trim();

  return conversations()
    .filter((conversation) => {
      if (tab === "unread" && !conversation.unreadAdmin) return false;
      if (tab === "closed" && conversation.status !== "closed") return false;
      if (tab !== "closed" && conversation.status === "closed") return false;
      if (!search) return true;
      const source = [
        conversation.visitor?.name,
        conversation.visitor?.company,
        conversation.messages?.at(-1)?.text,
      ].join(" ").toLowerCase();
      return source.includes(search);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function conversationListItem(conversation, selectedId, tab, search) {
  const last = conversation.messages?.at(-1);
  const params = new URLSearchParams();
  params.set("id", conversation.id);
  if (tab && tab !== "all") params.set("tab", tab);
  if (search) params.set("q", search);

  return `
    <a class="admin-conversation-item ${selectedId === conversation.id ? "active" : ""}"
       href="#/admin/conversas?${params.toString()}">
      <span class="conversation-avatar">${esc((conversation.visitor?.name || "?").slice(0, 1).toUpperCase())}</span>
      <span class="conversation-preview">
        <strong>${esc(conversation.visitor?.name || "Visitante")}</strong>
        <small>${esc(conversation.visitor?.company || "Empresa não informada")}</small>
        <em>${esc(last?.text || "Conversa iniciada")}</em>
      </span>
      <span class="conversation-meta">
        <time>${formatListTime(conversation.updatedAt)}</time>
        ${conversation.unreadAdmin ? `<b>${conversation.unreadAdmin}</b>` : ""}
      </span>
    </a>`;
}

function adminConversationMessages(conversation) {
  return (conversation.messages || []).map((message) => `
    <div class="admin-chat-message ${message.author}">
      <div>${esc(message.text).replaceAll("\n", "<br>")}</div>
      <time>${formatTime(message.createdAt)}</time>
    </div>`).join("");
}

function conversationsView() {
  const all = filteredConversations();
  const selected = selectedConversationFromRoute(all);
  const tab = conversationTab();
  const search = conversationSearch();
  const unreadTotal = conversations().reduce((total, conversation) =>
    total + Number(conversation.unreadAdmin || 0), 0);

  return `
    <section class="admin-conversations-shell">
      <aside class="admin-conversations-sidebar">
        <header>
          <div><h2>Conversas</h2><span>${unreadTotal} mensagem(ns) não lida(s)</span></div>
          <i class="bi bi-chat-square-dots"></i>
        </header>

        <form class="admin-conversation-search" data-conversation-search>
          <i class="bi bi-search"></i>
          <input name="q" value="${esc(search)}" placeholder="Buscar pessoa ou empresa">
        </form>

        <nav class="admin-conversation-tabs">
          <a class="${tab === "all" ? "active" : ""}" href="#/admin/conversas">Todas</a>
          <a class="${tab === "unread" ? "active" : ""}" href="#/admin/conversas?tab=unread">Não lidas</a>
          <a class="${tab === "closed" ? "active" : ""}" href="#/admin/conversas?tab=closed">Encerradas</a>
        </nav>

        <div class="admin-conversation-list">
          ${all.length
            ? all.map((conversation) => conversationListItem(conversation, selected?.id, tab, search)).join("")
            : `<div class="admin-conversation-empty"><i class="bi bi-chat-left"></i><strong>Nenhuma conversa</strong><span>As mensagens iniciadas no chat público aparecerão aqui.</span></div>`}
        </div>
      </aside>

      <article class="admin-conversation-room">
        ${selected ? `
          <header>
            <div class="conversation-room-person">
              <span class="conversation-avatar">${esc((selected.visitor?.name || "?").slice(0, 1).toUpperCase())}</span>
              <div>
                <strong>${esc(selected.visitor?.name || "Visitante")}</strong>
                <small>${esc(selected.visitor?.company || "Empresa não informada")}</small>
              </div>
            </div>
            <div class="conversation-room-actions">
              <span class="${activeAdminPresence() ? "online" : ""}">
                <i class="bi bi-circle-fill"></i>
                ${activeAdminPresence() ? "Admin online" : "Sem presença ativa"}
              </span>
              <button type="button" class="btn btn-outline-secondary btn-sm" data-toggle-conversation-status="${selected.id}">
                <i class="bi bi-${selected.status === "closed" ? "arrow-counterclockwise" : "check2-circle"} me-1"></i>
                ${selected.status === "closed" ? "Reabrir" : "Encerrar"}
              </button>
            </div>
          </header>

          <div class="admin-conversation-messages" data-admin-conversation-log>
            <div class="conversation-day"><span>Conversa iniciada em ${new Date(selected.createdAt).toLocaleString("pt-BR")}</span></div>
            ${adminConversationMessages(selected)}
          </div>

          <form class="admin-conversation-compose" data-admin-conversation-form data-conversation-id="${selected.id}">
            <button type="button" aria-label="Anexos em preparação"><i class="bi bi-paperclip"></i></button>
            <textarea name="message" rows="1" maxlength="1200" required placeholder="Digite uma resposta"></textarea>
            <button type="submit" class="send" aria-label="Enviar resposta"><i class="bi bi-send-fill"></i></button>
          </form>

          <footer>
            <i class="bi bi-database-check"></i>
            Protótipo local: as conversas são compartilhadas apenas entre abas deste navegador e domínio.
          </footer>` : `
          <div class="admin-conversation-placeholder">
            <i class="bi bi-chat-square-text"></i>
            <strong>Selecione uma conversa</strong>
            <span>O histórico completo será exibido nesta área.</span>
          </div>`}
      </article>
    </section>`;
}

function insertConversationMenu(admin, current) {
  const nav = admin.querySelector("#adminSidebar nav");
  if (!nav || nav.querySelector('a[href="#/admin/conversas"]')) return;

  const contacts = nav.querySelector('a[href="#/admin/contatos"]');
  const dashboard = nav.querySelector('a[href="#/admin/dashboard"]');
  const unread = conversations().reduce((total, conversation) =>
    total + Number(conversation.unreadAdmin || 0), 0);

  const link = document.createElement("a");
  link.href = "#/admin/conversas";
  link.className = current === "/admin/conversas" ? "active" : "";
  link.innerHTML = `
    <i class="bi bi-chat-square-dots"></i>
    <span>Conversas</span>
    ${unread ? `<b class="admin-menu-unread">${unread > 99 ? "99+" : unread}</b>` : ""}`;

  (contacts || dashboard)?.insertAdjacentElement("afterend", link);
}

function addConversationNotifications(admin) {
  const dropdown = admin.querySelector("[data-notification-dropdown]");
  const bell = admin.querySelector("[data-notification-toggle]");
  if (!dropdown || dropdown.querySelector("[data-conversation-notifications]")) return;

  const unread = conversations()
    .filter((conversation) => conversation.unreadAdmin)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!unread.length) return;

  const section = document.createElement("section");
  section.dataset.conversationNotifications = "";
  section.innerHTML = `
    <h3>Conversas do chat</h3>
    ${unread.slice(0, 5).map((conversation) => `
      <a href="#/admin/conversas?id=${encodeURIComponent(conversation.id)}">
        <i class="bi bi-chat-square-text"></i>
        <span><strong>${esc(conversation.visitor?.name || "Visitante")}</strong><small>${esc(conversation.visitor?.company || "")}</small></span>
        <em>${conversation.unreadAdmin} nova(s)</em>
      </a>`).join("")}`;

  dropdown.querySelector("header")?.insertAdjacentElement("afterend", section);

  const badge = bell.querySelector("span") || document.createElement("span");
  const previous = Number(badge.textContent || 0);
  badge.textContent = String(previous + unread.reduce((sum, entry) => sum + Number(entry.unreadAdmin || 0), 0));
  if (!badge.isConnected) bell.append(badge);
}

function bindConversationsAdmin(admin) {
  const selected = selectedConversationFromRoute(filteredConversations());
  if (selected?.unreadAdmin) markConversationRead(selected.id, "admin");

  admin.querySelector("[data-conversation-search]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("q") || "").trim();
    location.hash = query
      ? `/admin/conversas?q=${encodeURIComponent(query)}`
      : "/admin/conversas";
  });

  admin.querySelector("[data-admin-conversation-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("message") || "").trim();
    if (!text) return;
    addMessage(form.dataset.conversationId, "admin", text);
    form.reset();
    admin.renderRoute();
  });

  admin.querySelector("[data-toggle-conversation-status]")?.addEventListener("click", (event) => {
    const id = event.currentTarget.dataset.toggleConversationStatus;
    const conversation = conversations().find((entry) => entry.id === id);
    if (!conversation) return;
    updateConversation(id, {
      status: conversation.status === "closed" ? "open" : "closed",
    });
    admin.renderRoute();
  });

  const log = admin.querySelector("[data-admin-conversation-log]");
  if (log) log.scrollTop = log.scrollHeight;
}

const AdminApp = customElements.get("admin-app");
const adminPrototype = AdminApp?.prototype;

if (adminPrototype && !adminPrototype.__isoconChatAdminPatch) {
  adminPrototype.__isoconChatAdminPatch = true;

  const previousOpenSession = adminPrototype.openSession;
  const previousRenderLogin = adminPrototype.renderLogin;
  const previousDisconnected = adminPrototype.disconnectedCallback;
  const previousShellTitle = adminPrototype.shellTitle;
  const previousRouteContent = adminPrototype.routeContent;
  const previousRenderShell = adminPrototype.renderShell;

  adminPrototype.openSession = async function patchedOpenSession() {
    const result = await previousOpenSession.call(this);
    if (state.token && this.profile) startAdminPresence(this.profile);
    return result;
  };

  adminPrototype.renderLogin = function patchedRenderLogin(message = "") {
    if (!state.token) stopAdminPresence();
    return previousRenderLogin.call(this, message);
  };

  adminPrototype.disconnectedCallback = function patchedAdminDisconnected() {
    stopAdminPresence();
    return previousDisconnected.call(this);
  };

  adminPrototype.shellTitle = function patchedConversationTitle(current) {
    if (current === "/admin/conversas") return ["Conversas", "Atendimento iniciado pelo chat do website"];
    return previousShellTitle.call(this, current);
  };

  adminPrototype.routeContent = function patchedConversationContent(current) {
    if (current === "/admin/conversas") return conversationsView();
    return previousRouteContent.call(this, current);
  };

  adminPrototype.renderShell = function patchedConversationShell(current) {
    previousRenderShell.call(this, current);
    insertConversationMenu(this, current);
    addConversationNotifications(this);
    if (current === "/admin/conversas") bindConversationsAdmin(this);
    if (state.token && this.profile) startAdminPresence(this.profile);
  };
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-logout]")) stopAdminPresence();
}, true);

document.addEventListener("chatconversationschange", () => {
  document.querySelector("chat-widget")?.render();
  const admin = document.querySelector("admin-app");
  if (admin && route().split("?")[0] === "/admin/conversas") admin.renderRoute();
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE.conversations) {
    document.dispatchEvent(new CustomEvent("chatconversationschange"));
  }
  if (event.key === STORAGE.adminPresence) {
    document.dispatchEvent(new CustomEvent("adminpresencechange"));
  }
});

window.addEventListener("beforeunload", () => {
  if (document.querySelector("admin-app") && state.token) stopAdminPresence();
});
