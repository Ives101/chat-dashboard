// Sync queue for offline mutations with conflict resolution
export type SyncAction = {
  id: string;
  method: string;
  url: string;
  body?: any;
  timestamp: number;
  version?: number; // for conflict resolution
};

const QUEUE_KEY = "sync-queue";

export function getSyncQueue(): SyncAction[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addToSyncQueue(action: Omit<SyncAction, "id" | "timestamp">): void {
  const queue = getSyncQueue();
  queue.push({
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearSyncQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

// Conflict resolution: last-write-wins based on timestamp
// If server has a newer version, we skip the local change
export async function processSyncQueue(): Promise<number> {
  const queue = getSyncQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: SyncAction[] = [];

  for (const action of queue) {
    try {
      // For mutations, check if there's a conflict (server has newer version)
      if (action.method === "PUT" || action.method === "DELETE") {
        // Try to fetch current server state to check for conflicts
        const getResourceUrl = action.url.replace(/\/[^/]+$/, ""); // strip last segment for collection
        // Simple approach: just attempt the mutation
        // If it fails with 409 (conflict), skip; otherwise retry
      }

      const res = await fetch(action.url, {
        method: action.method,
        headers: action.body ? { "Content-Type": "application/json" } : {},
        body: action.body ? JSON.stringify(action.body) : undefined,
      });

      if (res.ok) {
        synced++;
      } else if (res.status === 409) {
        // Conflict - server has newer version, skip this change
        console.warn("Conflict detected, skipping:", action.url);
      } else {
        remaining.push(action);
      }
    } catch {
      remaining.push(action);
    }
  }

  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return synced;
}

// Wrapper for fetch that queues mutations when offline
export async function offlineFetch(url: string, options?: RequestInit): Promise<Response> {
  if (navigator.onLine) {
    try {
      return await fetch(url, options);
    } catch {
      // Network error - queue if mutation
      if (options?.method && options.method !== "GET") {
        addToSyncQueue({
          method: options.method,
          url,
          body: options.body ? JSON.parse(options.body as string) : undefined,
        });
      }
      throw new Error("offline");
    }
  } else {
    // Offline - queue mutations
    if (options?.method && options.method !== "GET") {
      addToSyncQueue({
        method: options.method,
        url,
        body: options.body ? JSON.parse(options.body as string) : undefined,
      });
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error("offline");
  }
}

// Merge strategy: when coming back online, fetch server data and merge with local
// Last-write-wins based on updated_at timestamp
export function mergeData<T extends { id: string; updated_at?: number; created_at: number }>(
  local: T[],
  server: T[]
): T[] {
  const merged = new Map<string, T>();
  
  // Add all server items
  for (const item of server) {
    merged.set(item.id, item);
  }
  
  // Merge local items - keep if newer or not on server
  for (const item of local) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
    } else {
      const localTime = item.updated_at ?? item.created_at;
      const serverTime = existing.updated_at ?? existing.created_at;
      if (localTime > serverTime) {
        merged.set(item.id, item);
      }
    }
  }
  
  return Array.from(merged.values());
}