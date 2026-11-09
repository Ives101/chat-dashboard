// IndexedDB-based offline cache for chat data
const DB_NAME = "chat-dashboard-offline";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("chats")) {
        const chats = db.createObjectStore("chats", { keyPath: "id" });
        chats.createIndex("folder_id", "folder_id", { unique: false });
        chats.createIndex("updated_at", "updated_at", { unique: false });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const msgs = db.createObjectStore("messages", { keyPath: "id" });
        msgs.createIndex("chat_id", "chat_id", { unique: false });
      }
      if (!db.objectStoreNames.contains("folders")) {
        db.createObjectStore("folders", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

// Generic helpers
async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function put(store: string, item: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function putMany(store: string, items: any[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const item of items) os.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteItem(store: string, id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getByIndex<T>(store: string, index: string, value: any): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

// Public API
export const offlineCache = {
  // Chats
  async getChats(): Promise<any[]> { return getAll("chats"); },
  async setChats(chats: any[]): Promise<void> { await putMany("chats", chats); },
  async setChat(chat: any): Promise<void> { await put("chats", chat); },
  async removeChat(id: string): Promise<void> { await deleteItem("chats", id); },
  async getChat(id: string): Promise<any | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chats", "readonly");
      const req = tx.objectStore("chats").get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // Messages
  async getMessages(chatId: string): Promise<any[]> { return getByIndex("messages", "chat_id", chatId); },
  async setMessages(chatId: string, msgs: any[]): Promise<void> {
    // Remove old messages for this chat first
    const existing = await getByIndex<any>("messages", "chat_id", chatId);
    for (const m of existing) await deleteItem("messages", m.id);
    await putMany("messages", msgs);
  },
  async addMessage(msg: any): Promise<void> { await put("messages", msg); },

  // Folders
  async getFolders(): Promise<any[]> { return getAll("folders"); },
  async setFolders(folders: any[]): Promise<void> { await putMany("folders", folders); },
  async setFolder(folder: any): Promise<void> { await put("folders", folder); },
  async removeFolder(id: string): Promise<void> { await deleteItem("folders", id); },

  // Sync queue
  async getQueue(): Promise<any[]> { return getAll("syncQueue"); },
  async enqueue(action: any): Promise<void> { await put("syncQueue", action); },
  async dequeue(id: string): Promise<void> { await deleteItem("syncQueue", id); },
  async clearQueue(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("syncQueue", "readwrite");
      tx.objectStore("syncQueue").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

// Sync all queued mutations
export async function syncOfflineQueue(): Promise<number> {
  const queue = await offlineCache.getQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: any[] = [];

  for (const action of queue) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: action.body ? { "Content-Type": "application/json" } : {},
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      if (res.ok) {
        synced++;
        await offlineCache.dequeue(action.id);
      } else {
        remaining.push(action);
      }
    } catch {
      remaining.push(action);
    }
  }

  // Clear and re-add remaining
  await offlineCache.clearQueue();
  for (const a of remaining) await offlineCache.enqueue(a);

  return synced;
}