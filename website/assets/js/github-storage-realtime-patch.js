import { state, esc, route } from "./utils.js";
import {
  githubStorageConfig,
  githubStorageToken,
} from "./github-storage-config.js";

const CHAT_EMPTY = { version: 1, conversations: [] };
const CONTACTS_EMPTY = { version: 1, contacts: [] };

const STORE = Object.freeze({
  visitor: "isoconChatVisitor",
  conversationId: "isoconGithubConversationId",
  conversationSecret: "isoconGithubConversationSecret",
});

const apiBase =
  `https://api.github.com/repos/${githubStorageConfig.owner}/${githubStorageConfig.repo}`;

const uuid = (prefix) =>
  globalThis.crypto?.randomUUID?.()
  || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pathEncode = (value) =>
  String(value).split("/").map(encodeURIComponent).join("/");

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const bytes = Uint8Array.from(
    atob(String(value).replaceAll("\n", "").replaceAll("\r", "")),
    (ch) => ch.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

async function hash(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value)),
  );
  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function headers() {
  return {
    Authorization: `Bearer ${githubStorageToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readJson(path, fallback) {
  const response = await fetch(
    `${apiBase}/contents/${pathEncode(path)}`
      + `?ref=${encodeURIComponent(githubStorageConfig.branch)}`
      + `&_=${Date.now()}`,
    { cache: "no-store", headers: headers() },
  );

  if (response.status === 404) {
    return { data: structuredClone(fallback), sha: null };
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message || `Falha ao ler ${path}.`);
  }

  const payload = await response.json();
  return {
    data: JSON.parse(decodeBase64Utf8(payload.content)),
    sha: payload.sha || null,
  };
}

async function writeJson(path, data, sha, message) {
  const body = {
    message,
    branch: githubStorageConfig.branch,
    content: encodeBase64Utf8(JSON.stringify(data, null, 2)),
  };
  if (sha) body.sha = sha;

  return fetch(`${apiBase}/contents/${pathEncode(path)}`, {
    method: "PUT",
    headers: {
      ...headers(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function mutate(path, fallback, fn, message) {
  let last = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await readJson(path, fallback);
    const next = await fn(structuredClone(current.data));

    const response = await writeJson(
      path,
      next,
      current.sha,
      message,
    );

    if (response.ok) return next;

    const detail = await response.json().catch(() => ({}));
    last = new Error(detail.message || `Falha ao gravar ${path}.`);

    if (![409, 422].includes(response.status)) throw last;
    await sleep(150 + Math.round(Math.random() * 400));
  }

  throw last || new Error("Conflito persistente no storage GitHub.");
}

const clean = (value, max = 1200) =>
  String(value || "").trim().slice(0, max);

function identity() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE.visitor) || "null");
    if (!value?.name || !value?.company) return null;
    return value;
  } catch {
    return null;
  }
}

function formatTime(value) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    { hour: "2-digit", minute: "2-digit" },
  ).format(new Date(value));
}

function formatListTime(value) {
  const d = new Date(value);
  if (d.toDateString() === new Date().toDateString()) return formatTime(value);
  return new Intl.DateTimeFormat(
    "pt-BR",
    { day: "2-digit", month: "2-digit" },
  ).format(d);
}

async function visitorConversation(chat) {
  const id = localStorage.getItem(STORE.conversationId) || "";
  const secret = localStorage.getItem(STORE.conversationSecret) || "";
  if (!id || !secret) return null;

  const item = (chat.conversations || []).find((x) => x.id === id);
  if (!item) return null;
  if (item.visitorSecretHash !== await hash(secret)) return null;
  return item;
}

async function ensureConversation() {
  const who = identity();
  if (!who) throw new Error("Identifique-se antes de enviar.");

  const current = await readJson(githubStorageConfig.chatPath, CHAT_EMPTY);
  const found = await visitorConversation(current.data);
  if (found) return found;

  localStorage.removeItem(STORE.conversationId);
  localStorage.removeItem(STORE.conversationSecret);

  const id = uuid("conversation");
  const secret = `${uuid("visitor")}-${uuid("secret")}`;
  const now = new Date().toISOString();

  const conversation = {
    id,
    visitor: {
      name: clean(who.name, 100),
      company: clean(who.company, 140),
    },
    visitorSecretHash: await hash(secret),
    createdAt: now,
    updatedAt: now,
    status: "open",
    adminReadAt: null,
    messages: [],
  };

  await mutate(
    githubStorageConfig.chatPath,
    CHAT_EMPTY,
    (data) => {
      data.version ||= 1;
      data.conversations = Array.isArray(data.conversations)
        ? data.conversations
        : [];
      data.conversations.unshift(conversation);
      return data;
    },
    "Inicia conversa comercial",
  );

  localStorage.setItem(STORE.conversationId, id);
  localStorage.setItem(STORE.conversationSecret, secret);
  return conversation;
}

async function sendVisitor(text) {
  const conversation = await ensureConversation();
  const secret = localStorage.getItem(STORE.conversationSecret) || "";
  const secretHash = await hash(secret);
  const messageId = uuid("message");
  const now = new Date().toISOString();
  const messageText = clean(text);

  await mutate(
    githubStorageConfig.chatPath,
    CHAT_EMPTY,
    (data) => {
      const target = (data.conversations || [])
        .find((x) => x.id === conversation.id);

      if (!target || target.visitorSecretHash !== secretHash) {
        throw new Error("Sessão da conversa inválida.");
      }

      target.messages ||= [];
      if (!target.messages.some((m) => m.id === messageId)) {
        target.messages.push({
          id: messageId,
          author: "visitor",
          text: messageText,
          createdAt: now,
        });
      }
      target.updatedAt = now;
      target.status = "open";
      return data;
    },
    "Nova mensagem do chat",
  );
}

async function sendAdmin(conversationId, text) {
  const messageId = uuid("message");
  const now = new Date().toISOString();
  const messageText = clean(text);

  await mutate(
    githubStorageConfig.chatPath,
    CHAT_EMPTY,
    (data) => {
      const target = (data.conversations || [])
        .find((x) => x.id === conversationId);

      if (!target) throw new Error("Conversa não encontrada.");

      target.messages ||= [];
      if (!target.messages.some((m) => m.id === messageId)) {
        target.messages.push({
          id: messageId,
          author: "admin",
          text: messageText,
          createdAt: now,
        });
      }
      target.adminReadAt = now;
      target.updatedAt = now;
      target.status = "open";
      return data;
    },
    "Resposta administrativa no chat",
  );
}

async function markRead(conversationId) {
  const now = new Date().toISOString();
  await mutate(
    githubStorageConfig.chatPath,
    CHAT_EMPTY,
    (data) => {
      const target = (data.conversations || [])
        .find((x) => x.id === conversationId);
      if (target) target.adminReadAt = now;
      return data;
    },
    "Marca conversa como lida",
  );
}

async function toggleStatus(conversationId) {
  await mutate(
    githubStorageConfig.chatPath,
    CHAT_EMPTY,
    (data) => {
      const target = (data.conversations || [])
        .find((x) => x.id === conversationId);
      if (target) {
        target.status = target.status === "closed" ? "open" : "closed";
        target.updatedAt = new Date().toISOString();
      }
      return data;
    },
    "Atualiza conversa",
  );
}

/* presença publicada pelo admin no branch presence */
const presenceUrl =
  "https://raw.githubusercontent.com/"
  + "glaucodeveloper/isocon/presence/admin-status.json";

let presence = {
  online: false,
  displayName: "ISOCON Administração",
  expiresAt: null,
};

async function refreshPresence() {
  try {
    const response = await fetch(
      `${presenceUrl}?_=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error();

    const data = await response.json();
    presence = {
      online: Boolean(
        data.online
        && data.expiresAt
        && Date.parse(data.expiresAt) > Date.now()
      ),
      displayName: data.displayName || "ISOCON Administração",
      updatedAt: data.updatedAt || null,
      expiresAt: data.expiresAt || null,
    };
  } catch {
    presence.online = Boolean(
      presence.online
      && presence.expiresAt
      && Date.parse(presence.expiresAt) > Date.now()
    );
  }
}

/* chat público */
const ChatWidget = customElements.get("chat-widget");
const chatPrototype = ChatWidget?.prototype;

function messagesHtml(conversation) {
  if (!conversation?.messages?.length) {
    return `
      <div class="chat-welcome-message">
        <strong>Olá! Como podemos ajudar?</strong>
        <span>Envie uma mensagem para iniciar o atendimento comercial.</span>
      </div>`;
  }

  return conversation.messages.map((m) => `
    <div class="chat-bubble ${m.author === "visitor" ? "visitor" : "admin"}">
      <div>${esc(m.text).replaceAll("\n", "<br>")}</div>
      <time>${formatTime(m.createdAt)}</time>
    </div>
  `).join("");
}

function identifyHtml(widget) {
  if (!widget.identificationOpen) return "";
  const who = identity();

  return `
    <div class="chat-identification-backdrop">
      <section class="chat-identification-modal" role="dialog" aria-modal="true">
        <button
          type="button"
          class="chat-identification-close"
          data-gh-identification-close
          aria-label="Fechar">
          <i class="bi bi-x-lg"></i>
        </button>

        <div class="chat-identification-icon">
          <i class="bi bi-building-check"></i>
        </div>

        <span>IDENTIFICAÇÃO COMERCIAL</span>
        <h2>Antes de enviar sua primeira mensagem</h2>
        <p>
          Informe seu nome e empresa. A conversa será sincronizada
          com a administração.
        </p>

        <form data-gh-identification-form>
          <label>
            Seu nome
            <input
              class="form-control"
              name="name"
              required
              maxlength="100"
              value="${esc(who?.name || "")}">
          </label>

          <label>
            Empresa
            <input
              class="form-control"
              name="company"
              required
              maxlength="140"
              value="${esc(who?.company || "")}">
          </label>

          <button class="btn btn-primary" type="submit">
            <i class="bi bi-chat-dots me-2"></i>
            Identificar e enviar
          </button>
        </form>
      </section>
    </div>`;
}

async function refreshPublicChat(widget, render = true) {
  try {
    const current = await readJson(
      githubStorageConfig.chatPath,
      CHAT_EMPTY,
    );
    widget._ghConversation = await visitorConversation(current.data);
    widget._ghError = "";
  } catch (error) {
    widget._ghError = error.message;
  }

  if (render && widget.isConnected) widget.render();
}

function bindPublicChat(widget) {
  widget.querySelector("[data-gh-toggle]")?.addEventListener("click", () => {
    widget.open = !widget.open;
    widget.render();
  });

  widget.querySelector("[data-gh-close]")?.addEventListener("click", () => {
    widget.open = false;
    widget.render();
  });

  widget.querySelectorAll("[data-gh-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = widget.querySelector('[name="chatMessage"]');
      if (!input) return;
      input.value = button.dataset.ghPrompt || "";
      input.focus();
    });
  });

  widget.querySelector("[data-gh-chat-form]")?.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const text = clean(event.currentTarget.elements.chatMessage?.value);
      if (!text || widget._ghSending) return;

      if (!identity()) {
        widget.pendingMessage = text;
        widget.identificationOpen = true;
        widget.render();
        return;
      }

      widget._ghSending = true;
      widget._ghError = "";
      widget.render();

      void sendVisitor(text)
        .then(() => {
          widget.pendingMessage = "";
          return refreshPublicChat(widget, false);
        })
        .catch((error) => {
          widget._ghError = error.message;
        })
        .finally(() => {
          widget._ghSending = false;
          widget.render();
        });
    },
  );

  widget.querySelector("[data-gh-identification-close]")
    ?.addEventListener("click", () => {
      widget.identificationOpen = false;
      widget.render();
    });

  widget.querySelector("[data-gh-identification-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const who = {
        name: clean(data.get("name"), 100),
        company: clean(data.get("company"), 140),
      };
      if (!who.name || !who.company) return;

      localStorage.setItem(STORE.visitor, JSON.stringify(who));
      widget.identificationOpen = false;
      const pending = widget.pendingMessage;
      widget.render();

      if (pending) {
        const input = widget.querySelector('[name="chatMessage"]');
        if (input) input.value = pending;
        widget.querySelector("[data-gh-chat-form]")
          ?.requestSubmit();
      }
    });

  const log = widget.querySelector("[data-gh-chat-log]");
  if (log) log.scrollTop = log.scrollHeight;
}

if (chatPrototype) {
  chatPrototype.connectedCallback = function ghChatConnected() {
    this.open = false;
    this.identificationOpen = false;
    this.pendingMessage = "";
    this._ghConversation = null;
    this._ghError = "";
    this._ghSending = false;
    this.render();

    void refreshPresence().then(() => this.isConnected && this.render());
    void refreshPublicChat(this);

    this._ghChatPoll = setInterval(
      () => void refreshPublicChat(this),
      githubStorageConfig.pollMs,
    );

    this._ghPresencePoll = setInterval(
      () => void refreshPresence().then(() => {
        if (this.isConnected) this.render();
      }),
      githubStorageConfig.presencePollMs,
    );
  };

  chatPrototype.disconnectedCallback = function ghChatDisconnected() {
    clearInterval(this._ghChatPoll);
    clearInterval(this._ghPresencePoll);
  };

  chatPrototype.render = function ghChatRender() {
    const who = identity();
    const conversation = this._ghConversation;

    this.innerHTML = `
      ${this.open ? `
        <aside class="chat-panel chat-panel-expanded">
          <header class="chat-panel-header">
            <div class="chat-agent">
              <span class="online-dot ${presence.online ? "online" : "offline"}"></span>
              <div>
                <strong>Atendimento ISOCON</strong>
                <small>
                  ${presence.online
                    ? "ISOCON Administração está online agora"
                    : "Equipe ausente — deixe sua mensagem"}
                </small>
              </div>
            </div>
            <button data-gh-close aria-label="Fechar">
              <i class="bi bi-x-lg"></i>
            </button>
          </header>

          ${who ? `
            <div class="chat-visitor-summary">
              <i class="bi bi-person-check"></i>
              <span>
                <strong>${esc(who.name)}</strong>
                <small>${esc(who.company)}</small>
              </span>
            </div>` : ""}

          <div
            class="chat-conversation-log"
            data-gh-chat-log
            aria-live="polite">
            ${messagesHtml(conversation)}
          </div>

          ${!conversation?.messages?.length ? `
            <div class="chat-quick-actions">
              <button
                type="button"
                data-gh-prompt="Gostaria de solicitar uma cotação.">
                Solicitar cotação
              </button>
              <button
                type="button"
                data-gh-prompt="Tenho dúvidas sobre uma linha de produtos.">
                Dúvidas sobre produtos
              </button>
              <button
                type="button"
                data-gh-prompt="Preciso verificar condições de logística para minha região.">
                Consultar logística
              </button>
            </div>` : ""}

          ${this._ghError ? `
            <div class="gh-storage-error">
              <i class="bi bi-exclamation-triangle"></i>
              ${esc(this._ghError)}
            </div>` : ""}

          <form class="chat-compose" data-gh-chat-form>
            <input
              name="chatMessage"
              maxlength="1200"
              autocomplete="off"
              value="${esc(this.pendingMessage || "")}"
              placeholder="${who
                ? "Digite sua mensagem..."
                : "Digite a primeira mensagem..."}"
              ${this._ghSending ? "disabled" : ""}>
            <button
              type="submit"
              aria-label="Enviar"
              ${this._ghSending ? "disabled" : ""}>
              <i class="bi bi-${this._ghSending
                ? "hourglass-split"
                : "send-fill"}"></i>
            </button>
          </form>

          <div class="chat-storage-note">
            <i class="bi bi-cloud-check"></i>
            Conversa persistida no repositório de dados.
          </div>
        </aside>` : ""}

      <button class="chat-fab" data-gh-toggle aria-label="Atendimento">
        <i class="bi bi-${this.open ? "x-lg" : "chat-dots"}"></i>
      </button>

      ${identifyHtml(this)}
    `;

    bindPublicChat(this);
  };
}

/* contato público */
async function saveContact(form) {
  const data = new FormData(form);
  const item = {
    id: uuid("contact"),
    name: clean(data.get("name"), 100),
    company: clean(data.get("company"), 140),
    email: clean(data.get("email"), 254),
    phone: clean(data.get("phone"), 80),
    subject: clean(data.get("subject") || "Contato pelo site", 180),
    message: clean(data.get("message"), 4000),
    createdAt: new Date().toISOString(),
    unread: true,
    status: "novo",
  };

  if (!item.name || !item.email || !item.message) {
    throw new Error("Preencha nome, e-mail e mensagem.");
  }

  await mutate(
    githubStorageConfig.contactsPath,
    CONTACTS_EMPTY,
    (store) => {
      store.version ||= 1;
      store.contacts = Array.isArray(store.contacts) ? store.contacts : [];
      store.contacts.unshift(item);
      store.contacts = store.contacts.slice(0, 1000);
      return store;
    },
    "Novo contato pelo website",
  );
}

document.addEventListener(
  "submit",
  (event) => {
    const form = event.target;
    if (!form?.matches?.("#contactForm")) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (form.dataset.ghSending === "1") return;
    form.dataset.ghSending = "1";

    let status = form.querySelector("[data-gh-contact-status]");
    if (!status) {
      status = document.createElement("div");
      status.dataset.ghContactStatus = "";
      status.className = "gh-contact-status";
      form.append(status);
    }

    const button = form.querySelector(
      'button[type="submit"], button:not([type])',
    );
    const original = button?.innerHTML || "";

    if (button) {
      button.disabled = true;
      button.innerHTML =
        '<i class="bi bi-hourglass-split me-2"></i>Enviando...';
    }

    status.className = "gh-contact-status loading";
    status.textContent = "Enviando sua mensagem...";

    void saveContact(form)
      .then(() => {
        form.reset();
        status.className = "gh-contact-status success";
        status.innerHTML =
          '<i class="bi bi-check-circle"></i> '
          + "Mensagem enviada para a administração.";
      })
      .catch((error) => {
        status.className = "gh-contact-status error";
        status.innerHTML =
          `<i class="bi bi-exclamation-triangle"></i> ${esc(error.message)}`;
      })
      .finally(() => {
        form.dataset.ghSending = "0";
        if (button) {
          button.disabled = false;
          button.innerHTML = original;
        }
      });
  },
  true,
);

/* admin */
const AdminApp = customElements.get("admin-app");
const adminPrototype = AdminApp?.prototype;

let adminChat = structuredClone(CHAT_EMPTY);
let adminContacts = structuredClone(CONTACTS_EMPTY);
let lastChatSha = "";
let lastContactsSha = "";
let adminTimer = null;
let adminBusy = false;
let adminInstance = null;

function unreadCount(conversation) {
  const readAt = conversation.adminReadAt
    ? Date.parse(conversation.adminReadAt)
    : 0;

  return (conversation.messages || []).filter(
    (m) =>
      m.author === "visitor"
      && Date.parse(m.createdAt) > readAt,
  ).length;
}

function adminConversations() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const tab = params.get("tab") || "all";
  const q = clean(params.get("q"), 120).toLowerCase();

  return [...(adminChat.conversations || [])]
    .filter((conversation) => {
      const unread = unreadCount(conversation);
      if (tab === "unread" && !unread) return false;
      if (tab === "closed" && conversation.status !== "closed") return false;
      if (tab !== "closed" && conversation.status === "closed") return false;

      if (!q) return true;
      const source = [
        conversation.visitor?.name,
        conversation.visitor?.company,
        conversation.messages?.at(-1)?.text,
      ].join(" ").toLowerCase();
      return source.includes(q);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function selectedConversation(list = adminConversations()) {
  const id = new URLSearchParams(location.hash.split("?")[1] || "")
    .get("id");
  return list.find((x) => x.id === id) || list[0] || null;
}

function selectedContact() {
  const id = new URLSearchParams(location.hash.split("?")[1] || "")
    .get("message");
  return (adminContacts.contacts || []).find((x) => x.id === id)
    || adminContacts.contacts?.[0]
    || null;
}

function conversationView() {
  const list = adminConversations();
  const selected = selectedConversation(list);
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const tab = params.get("tab") || "all";
  const q = params.get("q") || "";
  const unreadTotal = (adminChat.conversations || [])
    .reduce((n, c) => n + unreadCount(c), 0);

  return `
    <section class="admin-conversations-shell">
      <aside class="admin-conversations-sidebar">
        <header>
          <div>
            <h2>Conversas</h2>
            <span>${unreadTotal} mensagem(ns) não lida(s)</span>
          </div>
          <i class="bi bi-chat-square-dots"></i>
        </header>

        <form class="admin-conversation-search" data-gh-admin-search>
          <i class="bi bi-search"></i>
          <input
            name="q"
            value="${esc(q)}"
            placeholder="Buscar pessoa ou empresa">
        </form>

        <nav class="admin-conversation-tabs">
          <a class="${tab === "all" ? "active" : ""}" href="#/admin/conversas">
            Todas
          </a>
          <a class="${tab === "unread" ? "active" : ""}" href="#/admin/conversas?tab=unread">
            Não lidas
          </a>
          <a class="${tab === "closed" ? "active" : ""}" href="#/admin/conversas?tab=closed">
            Encerradas
          </a>
        </nav>

        <div class="admin-conversation-list">
          ${list.length ? list.map((c) => {
            const last = c.messages?.at(-1);
            const unread = unreadCount(c);
            const lp = new URLSearchParams();
            lp.set("id", c.id);
            if (tab !== "all") lp.set("tab", tab);
            if (q) lp.set("q", q);

            return `
              <a
                class="admin-conversation-item ${selected?.id === c.id ? "active" : ""}"
                href="#/admin/conversas?${lp}">
                <span class="conversation-avatar">
                  ${esc((c.visitor?.name || "?").slice(0, 1).toUpperCase())}
                </span>
                <span class="conversation-preview">
                  <strong>${esc(c.visitor?.name || "Visitante")}</strong>
                  <small>${esc(c.visitor?.company || "")}</small>
                  <em>${esc(last?.text || "Conversa iniciada")}</em>
                </span>
                <span class="conversation-meta">
                  <time>${formatListTime(c.updatedAt)}</time>
                  ${unread ? `<b>${unread}</b>` : ""}
                </span>
              </a>`;
          }).join("") : `
            <div class="admin-conversation-empty">
              <i class="bi bi-chat-left"></i>
              <strong>Nenhuma conversa</strong>
              <span>As mensagens públicas aparecerão aqui.</span>
            </div>`}
        </div>
      </aside>

      <article class="admin-conversation-room">
        ${selected ? `
          <header>
            <div class="conversation-room-person">
              <span class="conversation-avatar">
                ${esc((selected.visitor?.name || "?").slice(0, 1).toUpperCase())}
              </span>
              <div>
                <strong>${esc(selected.visitor?.name || "Visitante")}</strong>
                <small>${esc(selected.visitor?.company || "")}</small>
              </div>
            </div>

            <div class="conversation-room-actions">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                data-gh-toggle-status="${esc(selected.id)}">
                <i class="bi bi-${selected.status === "closed"
                  ? "arrow-counterclockwise"
                  : "check2-circle"} me-1"></i>
                ${selected.status === "closed" ? "Reabrir" : "Encerrar"}
              </button>
            </div>
          </header>

          <div
            class="admin-conversation-messages"
            data-gh-admin-log>
            ${(selected.messages || []).map((m) => `
              <div class="admin-chat-message ${m.author}">
                <div>${esc(m.text).replaceAll("\n", "<br>")}</div>
                <time>${formatTime(m.createdAt)}</time>
              </div>
            `).join("")}
          </div>

          <form
            class="admin-conversation-compose"
            data-gh-admin-compose
            data-conversation-id="${esc(selected.id)}">
            <textarea
              name="message"
              rows="1"
              maxlength="1200"
              required
              placeholder="Digite uma resposta"></textarea>
            <button type="submit" class="send" aria-label="Enviar">
              <i class="bi bi-send-fill"></i>
            </button>
          </form>

          <footer>
            <i class="bi bi-cloud-check"></i>
            Conversa persistida no repositório de dados.
          </footer>` : `
          <div class="admin-conversation-placeholder">
            <i class="bi bi-chat-square-text"></i>
            <strong>Selecione uma conversa</strong>
          </div>`}
      </article>
    </section>`;
}

function contactsView() {
  const selected = selectedContact();
  const contacts = adminContacts.contacts || [];

  return `
    <section class="admin-contacts-grid">
      <article class="admin-panel contacts-list-panel">
        <div class="panel-heading">
          <div>
            <h2>Mensagens recebidas</h2>
            <p>Registros persistidos no repositório de dados.</p>
          </div>
          <strong>${contacts.length}</strong>
        </div>

        <div class="contact-admin-list">
          ${contacts.length ? contacts.map((c) => `
            <a
              class="${c.unread ? "unread" : ""} ${selected?.id === c.id ? "active" : ""}"
              href="#/admin/contatos?message=${encodeURIComponent(c.id)}">
              <span class="contact-avatar">
                ${esc((c.name || "?").slice(0, 1).toUpperCase())}
              </span>
              <div>
                <strong>${esc(c.name)}</strong>
                <small>${esc(c.company || c.email)}</small>
                <p>${esc(c.subject)}</p>
              </div>
              <time>${new Date(c.createdAt).toLocaleDateString("pt-BR")}</time>
            </a>
          `).join("") : `
            <div class="admin-empty-state">
              <i class="bi bi-inbox"></i>
              <strong>Nenhuma mensagem</strong>
              <span>As mensagens públicas aparecerão aqui.</span>
            </div>`}
        </div>
      </article>

      <article class="admin-panel contact-detail-panel">
        ${selected ? `
          <header>
            <div>
              <span>${selected.unread ? "NOVA MENSAGEM" : "MENSAGEM"}</span>
              <h2>${esc(selected.subject)}</h2>
            </div>
            <button
              class="btn btn-outline-danger btn-sm"
              data-gh-delete-contact="${esc(selected.id)}">
              <i class="bi bi-trash"></i>
            </button>
          </header>

          <dl>
            <div><dt>Responsável</dt><dd>${esc(selected.name)}</dd></div>
            <div><dt>Empresa</dt><dd>${esc(selected.company || "Não informada")}</dd></div>
            <div><dt>E-mail</dt><dd><a href="mailto:${esc(selected.email)}">${esc(selected.email)}</a></dd></div>
            <div><dt>Telefone</dt><dd>${esc(selected.phone || "Não informado")}</dd></div>
            <div><dt>Recebida em</dt><dd>${new Date(selected.createdAt).toLocaleString("pt-BR")}</dd></div>
          </dl>

          <div class="contact-message-body">
            ${esc(selected.message).replaceAll("\n", "<br>")}
          </div>

          <div class="contact-detail-actions">
            ${selected.unread ? `
              <button
                class="btn btn-outline-primary"
                data-gh-read-contact="${esc(selected.id)}">
                <i class="bi bi-envelope-open me-2"></i>
                Marcar como lida
              </button>` : ""}
            <a
              class="btn btn-primary"
              href="mailto:${esc(selected.email)}?subject=${encodeURIComponent(`Retorno ISOCON: ${selected.subject}`)}">
              <i class="bi bi-reply me-2"></i>
              Responder por e-mail
            </a>
          </div>` : `
          <div class="admin-empty-state">
            <i class="bi bi-envelope-open"></i>
            <strong>Selecione uma mensagem</strong>
          </div>`}
      </article>
    </section>`;
}

async function markContact(id) {
  await mutate(
    githubStorageConfig.contactsPath,
    CONTACTS_EMPTY,
    (data) => {
      const item = (data.contacts || []).find((x) => x.id === id);
      if (item) {
        item.unread = false;
        item.status = "lido";
      }
      return data;
    },
    "Marca contato como lido",
  );
}

async function removeContact(id) {
  await mutate(
    githubStorageConfig.contactsPath,
    CONTACTS_EMPTY,
    (data) => {
      data.contacts = (data.contacts || []).filter((x) => x.id !== id);
      return data;
    },
    "Remove contato",
  );
}

function ensureConversationMenu(admin, current) {
  const nav = admin.querySelector("#adminSidebar nav");
  if (!nav) return;

  let link = nav.querySelector('a[href="#/admin/conversas"]');
  if (!link) {
    link = document.createElement("a");
    link.href = "#/admin/conversas";
    link.innerHTML =
      '<i class="bi bi-chat-square-dots"></i><span>Conversas</span>';

    const contacts = nav.querySelector('a[href="#/admin/contatos"]');
    if (contacts) contacts.insertAdjacentElement("afterend", link);
    else nav.prepend(link);
  }

  link.classList.toggle("active", current === "/admin/conversas");

  const unread = (adminChat.conversations || [])
    .reduce((n, c) => n + unreadCount(c), 0);

  link.querySelector(".admin-menu-unread")?.remove();
  if (unread) {
    const badge = document.createElement("b");
    badge.className = "admin-menu-unread";
    badge.textContent = unread > 99 ? "99+" : String(unread);
    link.append(badge);
  }
}

async function refreshAdmin(admin, rerender = true) {
  if (!admin?.isConnected || adminBusy) return;
  adminBusy = true;

  try {
    const [chat, contacts] = await Promise.all([
      readJson(githubStorageConfig.chatPath, CHAT_EMPTY),
      readJson(githubStorageConfig.contactsPath, CONTACTS_EMPTY),
    ]);

    const changed =
      chat.sha !== lastChatSha
      || contacts.sha !== lastContactsSha;

    adminChat = chat.data;
    adminContacts = contacts.data;
    lastChatSha = chat.sha || "";
    lastContactsSha = contacts.sha || "";

    state.contactMessages = adminContacts.contacts || [];
    admin._ghStorageError = "";

    if (changed && rerender && admin.isConnected) {
      admin.renderRoute();
    } else {
      ensureConversationMenu(admin, route().split("?")[0]);
    }
  } catch (error) {
    admin._ghStorageError = error.message;
    console.warn("GitHub storage:", error);
  } finally {
    adminBusy = false;
  }
}

function startAdminPoll(admin) {
  adminInstance = admin;
  clearInterval(adminTimer);
  void refreshAdmin(admin, true);

  adminTimer = setInterval(() => {
    if (adminInstance?.isConnected && state.token) {
      void refreshAdmin(adminInstance, true);
    }
  }, githubStorageConfig.pollMs);
}

function bindAdmin(admin, current) {
  ensureConversationMenu(admin, current);

  if (current === "/admin/conversas") {
    const selected = selectedConversation();

    if (selected && unreadCount(selected)) {
      void markRead(selected.id).then(() => refreshAdmin(admin, false));
    }

    admin.querySelector("[data-gh-admin-search]")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const params = new URLSearchParams(location.hash.split("?")[1] || "");
        const q = clean(new FormData(event.currentTarget).get("q"), 120);
        if (q) params.set("q", q);
        else params.delete("q");
        location.hash =
          `/admin/conversas${params.size ? `?${params}` : ""}`;
      });

    admin.querySelector("[data-gh-admin-compose]")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const text = clean(new FormData(form).get("message"));
        if (!text) return;

        const button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;

        void sendAdmin(form.dataset.conversationId, text)
          .then(() => {
            form.reset();
            return refreshAdmin(admin, true);
          })
          .catch((error) => {
            admin._ghStorageError = error.message;
          })
          .finally(() => {
            if (button) button.disabled = false;
          });
      });

    admin.querySelector("[data-gh-toggle-status]")
      ?.addEventListener("click", (event) => {
        void toggleStatus(event.currentTarget.dataset.ghToggleStatus)
          .then(() => refreshAdmin(admin, true));
      });

    const log = admin.querySelector("[data-gh-admin-log]");
    if (log) log.scrollTop = log.scrollHeight;
  }

  if (current === "/admin/contatos") {
    admin.querySelector("[data-gh-read-contact]")
      ?.addEventListener("click", (event) => {
        void markContact(event.currentTarget.dataset.ghReadContact)
          .then(() => refreshAdmin(admin, true));
      });

    admin.querySelector("[data-gh-delete-contact]")
      ?.addEventListener("click", (event) => {
        if (!confirm("Excluir esta mensagem?")) return;
        void removeContact(event.currentTarget.dataset.ghDeleteContact)
          .then(() => {
            location.hash = "/admin/contatos";
            return refreshAdmin(admin, true);
          });
      });
  }
}

if (adminPrototype && !adminPrototype.__isoconGithubStoragePatch) {
  adminPrototype.__isoconGithubStoragePatch = true;

  const previousOpenSession = adminPrototype.openSession;
  const previousRenderLogin = adminPrototype.renderLogin;
  const previousShellTitle = adminPrototype.shellTitle;
  const previousRouteContent = adminPrototype.routeContent;
  const previousRenderShell = adminPrototype.renderShell;

  adminPrototype.openSession = async function ghOpenSession() {
    const result = await previousOpenSession.call(this);
    if (state.token && this.profile && state.data) startAdminPoll(this);
    return result;
  };

  adminPrototype.renderLogin = function ghRenderLogin(message = "") {
    if (!state.token) {
      clearInterval(adminTimer);
      adminTimer = null;
      adminInstance = null;
    }
    return previousRenderLogin.call(this, message);
  };

  adminPrototype.shellTitle = function ghShellTitle(current) {
    if (current === "/admin/conversas") {
      return ["Conversas", "Chat sincronizado pelo GitHub"];
    }
    if (current === "/admin/contatos") {
      return ["Contatos", "Mensagens persistidas no GitHub"];
    }
    return previousShellTitle.call(this, current);
  };

  adminPrototype.routeContent = function ghRouteContent(current) {
    if (current === "/admin/conversas") return conversationView();
    if (current === "/admin/contatos") return contactsView();
    return previousRouteContent.call(this, current);
  };

  adminPrototype.renderShell = function ghRenderShell(current) {
    previousRenderShell.call(this, current);

    if (this._ghStorageError) {
      const flash = this.querySelector("#adminFlash");
      if (flash) {
        flash.className = "admin-flash show error";
        flash.textContent = this._ghStorageError;
      }
    }

    bindAdmin(this, current);
    if (state.token && this.profile && !adminTimer) startAdminPoll(this);
  };
}
