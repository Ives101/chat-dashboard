import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

const DB_PATH = path.join(os.homedir(), ".chat-dashboard", "chat.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      folder_id TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reactions TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS message_edits (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      edited_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      chat_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS shared_links (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      app TEXT NOT NULL UNIQUE,
      connected INTEGER NOT NULL DEFAULT 0,
      config TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chats_folder ON chats(folder_id);
    CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at);
    CREATE INDEX IF NOT EXISTS idx_edits_msg ON message_edits(message_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_chat ON attachments(chat_id);
    CREATE INDEX IF NOT EXISTS idx_shared_token ON shared_links(token);
  `);
  return _db;
}

// Helpers
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export type Folder = {
  id: string;
  name: string;
  created_at: number;
};

export type Chat = {
  id: string;
  title: string;
  folder_id: string | null;
  pinned: number;
  created_at: number;
  updated_at: number;
};

export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reactions: Record<string, "up" | "down">;
  created_at: number;
};

export type MessageEdit = {
  id: string;
  message_id: string;
  content: string;
  edited_at: number;
};

export type Attachment = {
  id: string;
  message_id: string | null;
  chat_id: string;
  filename: string;
  mime_type: string;
  size: number;
  data: string;
  created_at: number;
};

export type SharedLink = {
  id: string;
  chat_id: string;
  token: string;
  created_at: number;
  expires_at: number | null;
};

export function listFolders(): Folder[] {
  return getDb().prepare("SELECT * FROM folders ORDER BY created_at ASC").all() as Folder[];
}

export function createFolder(name: string): Folder {
  const f: Folder = { id: newId(), name, created_at: Date.now() };
  getDb().prepare("INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)").run(f.id, f.name, f.created_at);
  return f;
}

export function renameFolder(id: string, name: string): void {
  getDb().prepare("UPDATE folders SET name = ? WHERE id = ?").run(name, id);
}

export function deleteFolder(id: string): void {
  const db = getDb();
  db.prepare("UPDATE chats SET folder_id = NULL WHERE folder_id = ?").run(id);
  db.prepare("DELETE FROM folders WHERE id = ?").run(id);
}

export function listChats(query?: string): Chat[] {
  const db = getDb();
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    return db
      .prepare(
        "SELECT * FROM chats WHERE title LIKE ? ORDER BY pinned DESC, updated_at DESC"
      )
      .all(q) as Chat[];
  }
  return db.prepare("SELECT * FROM chats ORDER BY pinned DESC, updated_at DESC").all() as Chat[];
}

export function getChat(id: string): Chat | undefined {
  return getDb().prepare("SELECT * FROM chats WHERE id = ?").get(id) as Chat | undefined;
}

export function createChat(title: string = "New chat", folderId?: string | null): Chat {
  const now = Date.now();
  const c: Chat = { id: newId(), title, folder_id: folderId ?? null, pinned: 0, created_at: now, updated_at: now };
  getDb().prepare("INSERT INTO chats (id, title, folder_id, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    c.id, c.title, c.folder_id, c.pinned, c.created_at, c.updated_at
  );
  return c;
}

export function updateChat(id: string, patch: { title?: string; folder_id?: string | null; pinned?: boolean }): Chat | undefined {
  const db = getDb();
  const existing = getChat(id);
  if (!existing) return undefined;
  const title = patch.title ?? existing.title;
  const folder_id = patch.folder_id !== undefined ? (patch.folder_id ?? null) : existing.folder_id;
  const pinned = patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : existing.pinned;
  const updated_at = Date.now();
  db.prepare("UPDATE chats SET title = ?, folder_id = ?, pinned = ?, updated_at = ? WHERE id = ?").run(title, folder_id, pinned, updated_at, id);
  return getChat(id);
}

export function deleteChat(id: string): void {
  getDb().prepare("DELETE FROM chats WHERE id = ?").run(id);
}

function parseReactions(s: string | null): Record<string, "up" | "down"> {
  try { const v = JSON.parse(s ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export function listMessages(chatId: string): Message[] {
  const rows = getDb().prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC").all(chatId) as any[];
  return rows.map((r) => ({ ...r, reactions: parseReactions(r.reactions) }));
}

export function addMessage(chatId: string, role: Message["role"], content: string): Message {
  const m: Message = { id: newId(), chat_id: chatId, role, content, reactions: {}, created_at: Date.now() };
  getDb().prepare("INSERT INTO messages (id, chat_id, role, content, reactions, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    m.id, m.chat_id, m.role, m.content, JSON.stringify(m.reactions), m.created_at
  );
  getDb().prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(m.created_at, chatId);
  return m;
}

export function updateMessage(id: string, chatId: string, content: string): void {
  const db = getDb();
  // Save edit history
  const existing = db.prepare("SELECT content FROM messages WHERE id = ? AND chat_id = ?").get(id, chatId) as { content: string } | undefined;
  if (existing) {
    db.prepare("INSERT INTO message_edits (id, message_id, content, edited_at) VALUES (?, ?, ?, ?)").run(newId(), id, existing.content, Date.now());
  }
  db.prepare("UPDATE messages SET content = ? WHERE id = ? AND chat_id = ?").run(content, id, chatId);
  db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(Date.now(), chatId);
}

export function deleteMessage(id: string, chatId: string): void {
  getDb().prepare("DELETE FROM messages WHERE id = ? AND chat_id = ?").run(id, chatId);
}

export function setMessageReaction(messageId: string, reaction: "up" | "down" | null): void {
  const db = getDb();
  const row = db.prepare("SELECT reactions FROM messages WHERE id = ?").get(messageId) as { reactions: string } | undefined;
  if (!row) return;
  const reactions = parseReactions(row.reactions);
  if (reaction === null) {
    // toggle off - remove
  } else {
    reactions["user"] = reaction;
  }
  // Actually store per-message reaction as a simple value
  db.prepare("UPDATE messages SET reactions = ? WHERE id = ?").run(JSON.stringify(reaction ? { type: reaction } : {}), messageId);
}

export function getMessageEdits(messageId: string): MessageEdit[] {
  return getDb().prepare("SELECT * FROM message_edits WHERE message_id = ? ORDER BY edited_at DESC").all(messageId) as MessageEdit[];
}

export function addAttachment(chatId: string, filename: string, mimeType: string, size: number, data: string, messageId?: string): Attachment {
  const a: Attachment = { id: newId(), message_id: messageId ?? null, chat_id: chatId, filename, mime_type: mimeType, size, data, created_at: Date.now() };
  getDb().prepare("INSERT INTO attachments (id, message_id, chat_id, filename, mime_type, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    a.id, a.message_id, a.chat_id, a.filename, a.mime_type, a.size, a.data, a.created_at
  );
  return a;
}

export function listAttachments(chatId: string): Attachment[] {
  return getDb().prepare("SELECT * FROM attachments WHERE chat_id = ? ORDER BY created_at ASC").all(chatId) as Attachment[];
}

export function deleteAttachment(id: string): void {
  getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
}

export function createSharedLink(chatId: string, expiresInMs?: number): SharedLink {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const link: SharedLink = { id: newId(), chat_id: chatId, token, created_at: Date.now(), expires_at: expiresInMs ? Date.now() + expiresInMs : null };
  getDb().prepare("INSERT INTO shared_links (id, chat_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").run(
    link.id, link.chat_id, link.token, link.created_at, link.expires_at
  );
  return link;
}

export function getSharedChat(token: string): { chat: Chat; messages: Message[] } | null {
  const db = getDb();
  const link = db.prepare("SELECT * FROM shared_links WHERE token = ?").get(token) as SharedLink | undefined;
  if (!link) return null;
  if (link.expires_at && link.expires_at < Date.now()) return null;
  const chat = getChat(link.chat_id);
  if (!chat) return null;
  return { chat, messages: listMessages(link.chat_id) };
}

export function listSharedLinks(chatId: string): SharedLink[] {
  return getDb().prepare("SELECT * FROM shared_links WHERE chat_id = ? ORDER BY created_at DESC").all(chatId) as SharedLink[];
}

export function deleteSharedLink(id: string): void {
  getDb().prepare("DELETE FROM shared_links WHERE id = ?").run(id);
}

export function exportAll(): { folders: Folder[]; chats: Chat[]; messages: Message[] } {
  const db = getDb();
  return {
    folders: listFolders(),
    chats: db.prepare("SELECT * FROM chats ORDER BY created_at ASC").all() as Chat[],
    messages: db.prepare("SELECT * FROM messages ORDER BY created_at ASC").all() as Message[],
  };
}

export function importData(data: { folders?: Folder[]; chats?: Chat[]; messages?: Message[] }): void {
  const db = getDb();
  const insertFolder = db.prepare("INSERT OR IGNORE INTO folders (id, name, created_at) VALUES (?, ?, ?)");
  const insertChat = db.prepare("INSERT OR IGNORE INTO chats (id, title, folder_id, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  const insertMsg = db.prepare("INSERT OR IGNORE INTO messages (id, chat_id, role, content, reactions, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const tx = db.transaction(() => {
    for (const f of data.folders ?? []) insertFolder.run(f.id, f.name, f.created_at);
    for (const c of data.chats ?? []) insertChat.run(c.id, c.title, c.folder_id, c.pinned, c.created_at, c.updated_at);
    for (const m of data.messages ?? []) insertMsg.run(m.id, m.chat_id, m.role, m.content, JSON.stringify(m.reactions ?? {}), m.created_at);
  });
  tx();
}

// ---------- Settings ----------
export function getSetting(key: string): string | undefined {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}
export function setSetting(key: string, value: string): void {
  getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

// ---------- Webhooks ----------
export type Webhook = {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  enabled: number;
  created_at: number;
};
export function listWebhooks(): Webhook[] {
  const rows = getDb().prepare("SELECT * FROM webhooks ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({ ...r, events: safeParseArray(r.events) }));
}
function safeParseArray(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function createWebhook(input: { name: string; url: string; events?: string[]; secret?: string | null }): Webhook {
  const w: Webhook = { id: newId(), name: input.name, url: input.url, events: input.events ?? [], secret: input.secret ?? null, enabled: 1, created_at: Date.now() };
  getDb().prepare("INSERT INTO webhooks (id, name, url, events, secret, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(w.id, w.name, w.url, JSON.stringify(w.events), w.secret, w.enabled, w.created_at);
  return w;
}
export function updateWebhook(id: string, patch: { name?: string; url?: string; events?: string[]; secret?: string | null; enabled?: boolean }): Webhook | undefined {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as any;
  if (!existing) return undefined;
  const name = patch.name ?? existing.name;
  const url = patch.url ?? existing.url;
  const events = patch.events ?? safeParseArray(existing.events);
  const secret = patch.secret !== undefined ? patch.secret : existing.secret;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled;
  db.prepare("UPDATE webhooks SET name = ?, url = ?, events = ?, secret = ?, enabled = ? WHERE id = ?").run(name, url, JSON.stringify(events), secret, enabled, id);
  return listWebhooks().find((w) => w.id === id);
}
export function deleteWebhook(id: string): void {
  getDb().prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

// ---------- Integrations ----------
export type Integration = {
  id: string;
  app: string;
  connected: number;
  config: Record<string, any>;
  updated_at: number;
};
const DEFAULT_INTEGRATIONS = ["openai", "agy", "grok", "opencode", "qwen", "slack", "discord", "generic"];
export function listIntegrations(): Integration[] {
  const db = getDb();
  for (const app of DEFAULT_INTEGRATIONS) {
    const row = db.prepare("SELECT id FROM integrations WHERE app = ?").get(app);
    if (!row) {
      db.prepare("INSERT INTO integrations (id, app, connected, config, updated_at) VALUES (?, ?, 0, '{}', ?)").run(newId(), app, Date.now());
    }
  }
  const rows = db.prepare("SELECT * FROM integrations ORDER BY app ASC").all() as any[];
  return rows.map((r) => ({ ...r, config: safeParseObj(r.config) }));
}
function safeParseObj(s: string): Record<string, any> {
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function upsertIntegration(app: string, patch: { connected?: boolean; config?: Record<string, any> }): Integration {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM integrations WHERE app = ?").get(app) as any;
  const now = Date.now();
  if (!existing) {
    const id = newId();
    const connected = patch.connected ? 1 : 0;
    const config = patch.config ?? {};
    db.prepare("INSERT INTO integrations (id, app, connected, config, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, app, connected, JSON.stringify(config), now);
    return { id, app, connected, config, updated_at: now };
  }
  const connected = patch.connected !== undefined ? (patch.connected ? 1 : 0) : existing.connected;
  const config = patch.config !== undefined ? patch.config : safeParseObj(existing.config);
  db.prepare("UPDATE integrations SET connected = ?, config = ?, updated_at = ? WHERE app = ?").run(connected, JSON.stringify(config), now, app);
  const row = db.prepare("SELECT * FROM integrations WHERE app = ?").get(app) as any;
  return { ...row, config: safeParseObj(row.config) };
}