"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Sidebar, { type Folder, type Chat } from "@/components/Sidebar";
import ChatView from "@/components/ChatView";
import SettingsView from "@/components/SettingsView";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/components/Toast";

type Message = { id: string; chat_id: string; role: string; content: string; created_at: number };

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [backend, setBackend] = useState("openai");
  const [view, setView] = useState<"chats" | "settings">("chats");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draggedChatId, setDraggedChatId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("chat-backend");
    if (saved) setBackend(saved);
    const savedCollapsed = localStorage.getItem("sidebar-collapsed");
    if (savedCollapsed === "true") setSidebarCollapsed(true);
  }, []);

  const newChatRef = useRef<() => void>(() => {});
  const toggleSidebarRef = useRef<() => void>(() => {});
  useEffect(() => { newChatRef.current = newChat; }, [newChat]);
  useEffect(() => { toggleSidebarRef.current = toggleSidebar; }, [toggleSidebar]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newChatRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebarRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(data);
      const { offlineCache } = await import("@/lib/offlineCache");
      const { mergeData } = await import("@/lib/sync");
      const cached = await offlineCache.getFolders();
      const merged = mergeData(cached, data);
      await offlineCache.setFolders(merged);
      setFolders(merged);
    } catch {
      // Offline - load from cache
      try {
        const { offlineCache } = await import("@/lib/offlineCache");
        const cached = await offlineCache.getFolders();
        if (cached.length > 0) setFolders(cached);
      } catch {}
    }
  }, []);

  const loadChats = useCallback(async (q?: string) => {
    try {
      const url = q ? `/api/chats?q=${encodeURIComponent(q)}` : "/api/chats";
      const res = await fetch(url);
      const data = await res.json();
      if (!q) {
        const { offlineCache } = await import("@/lib/offlineCache");
        const { mergeData } = await import("@/lib/sync");
        const cached = await offlineCache.getChats();
        const merged = mergeData(cached, data);
        await offlineCache.setChats(merged);
        setChats(merged);
      } else {
        setChats(data);
      }
    } catch {
      // Offline - load from cache
      try {
        const { offlineCache } = await import("@/lib/offlineCache");
        const cached = await offlineCache.getChats();
        if (cached.length > 0) setChats(cached);
      } catch {}
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats/${chatId}`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      const { offlineCache } = await import("@/lib/offlineCache");
      await offlineCache.setMessages(chatId, data.messages ?? []);
    } catch {
      // Offline - load from cache
      try {
        const { offlineCache } = await import("@/lib/offlineCache");
        const cached = await offlineCache.getMessages(chatId);
        if (cached.length > 0) setMessages(cached);
      } catch {}
    }
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      const { processSyncQueue } = await import("@/lib/sync");
      const synced = await processSyncQueue();
      if (synced > 0) {
        toast(`Synced ${synced} change${synced !== 1 ? "s" : ""}`, "success");
        await loadFolders();
        await loadChats(search);
        if (activeChatId) await loadMessages(activeChatId);
      }
    };
    window.addEventListener("app:online", handleOnline);
    // Also process on mount if online
    if (navigator.onLine) {
      import("@/lib/sync").then(({ processSyncQueue }) => {
        processSyncQueue().then((synced: number) => {
          if (synced > 0) {
            toast(`Synced ${synced} change${synced !== 1 ? "s" : ""}`, "success");
            loadFolders();
            loadChats(search);
            if (activeChatId) loadMessages(activeChatId);
          }
        });
      });
    }
    return () => window.removeEventListener("app:online", handleOnline);
  }, [loadFolders, loadChats, loadMessages, activeChatId, search, toast]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadFolders();
      await loadChats();
      setLoading(false);
    })();
  }, [loadFolders, loadChats]);

  useEffect(() => {
    const t = setTimeout(() => loadChats(search), 250);
    return () => clearTimeout(t);
  }, [search, loadChats]);

  async function newChat() {
    setView("chats");
    if (!navigator.onLine) {
      const { addToSyncQueue } = await import("@/lib/sync");
      const tempId = `offline-${Date.now()}`;
      const newChat = { id: tempId, title: "New chat", folder_id: null, pinned: 0, created_at: Date.now(), updated_at: Date.now() };
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(tempId);
      setMessages([]);
      addToSyncQueue({ method: "POST", url: "/api/chats", body: { title: "New chat" } });
      toast("Chat created (offline - will sync)", "info");
      return;
    }
    const res = await fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New chat" }) });
    const chat: Chat = await res.json();
    await loadChats(search);
    setActiveChatId(chat.id);
    setMessages([]);
    toast("New chat created", "success");
  }

  async function newFolder() {
    const name = prompt("Folder name:");
    if (!name) return;
    await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    await loadFolders();
    toast("Folder created", "success");
  }

  async function selectChat(id: string) {
    setView("chats");
    setActiveChatId(id);
    await loadMessages(id);
    setMobileSidebarOpen(false);
  }

  async function renameChat(id: string, title: string) {
    await fetch(`/api/chats/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
    await loadChats(search);
  }

  async function deleteChat(id: string) {
    if (!confirm("Delete this chat?")) return;
    if (!navigator.onLine) {
      const { addToSyncQueue } = await import("@/lib/sync");
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
      addToSyncQueue({ method: "DELETE", url: `/api/chats/${id}` });
      toast("Chat deleted (offline - will sync)", "info");
      return;
    }
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
    await loadChats(search);
    toast("Chat deleted", "info");
  }

  async function pinChat(id: string, pinned: boolean) {
    await fetch(`/api/chats/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned }) });
    await loadChats(search);
    toast(pinned ? "Chat pinned" : "Chat unpinned", "info");
  }

  async function moveChat(id: string, folderId: string | null) {
    await fetch(`/api/chats/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: folderId }) });
    await loadChats(search);
  }

  async function renameFolder(id: string, name: string) {
    await fetch("/api/folders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name }) });
    await loadFolders();
  }

  async function deleteFolder(id: string) {
    if (!confirm("Delete folder? Chats inside will be unfiled.")) return;
    await fetch(`/api/folders?id=${id}`, { method: "DELETE" });
    await loadFolders();
    await loadChats(search);
    toast("Folder deleted", "info");
  }

  function changeBackend(b: string) {
    setBackend(b);
    localStorage.setItem("chat-backend", b);
    toast(`Backend: ${b}`, "info");
  }

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  async function send(text: string) {
    if (!activeChatId) return;
    setSending(true);
    // Optimistic user message for all backends
    const tempUserId = `temp-user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempUserId, chat_id: activeChatId, role: "user", content: text, created_at: Date.now() }]);
    try {
      const isCli = backend === "agy" || backend === "grok" || backend === "opencode" || backend === "qwen";

      if (!navigator.onLine) {
        // Offline: queue the message and add placeholder assistant message
        const { addToSyncQueue } = await import("@/lib/sync");
        const tempAssistantId = `temp-assistant-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          { id: tempAssistantId, chat_id: activeChatId, role: "assistant", content: "*(Offline - will sync when connected)*", created_at: Date.now() },
        ]);
        addToSyncQueue({ method: "POST", url: `/api/chats/${activeChatId}/reply`, body: { content: text, backend } });
        toast("Message queued (offline)", "info");
        const chat = chats.find((c) => c.id === activeChatId);
        if (chat && chat.title === "New chat") {
          const newTitle = text.slice(0, 40) + (text.length > 40 ? "…" : "");
          renameChat(activeChatId, newTitle);
        }
        return;
      }

      if (!isCli && backend === "openai") {
        // Streaming path for OpenAI (user message already added optimistically above)
        const res = await fetch(`/api/chats/${activeChatId}/reply-stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!res.ok || !res.body) throw new Error("Stream failed");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        // Add a placeholder assistant message
        const tempId = `temp-${Date.now()}`;
        setMessages((prev) => [...prev, { id: tempId, chat_id: activeChatId, role: "assistant", content: "", created_at: Date.now() }]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "chunk") {
                accumulated += parsed.text;
                setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content: accumulated } : m)));
              } else if (parsed.type === "error") {
                accumulated += `\n⚠️ ${parsed.text}`;
                setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, content: accumulated } : m)));
              }
            } catch {}
          }
        }
        // Reload to get real message IDs
        await loadMessages(activeChatId);
      } else {
        const endpoint = isCli
          ? `/api/chats/${activeChatId}/reply-cli`
          : `/api/chats/${activeChatId}/reply`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, backend }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        await loadMessages(activeChatId);
      }
      const chat = chats.find((c) => c.id === activeChatId);
      if (chat && chat.title === "New chat") {
        const newTitle = text.slice(0, 40) + (text.length > 40 ? "…" : "");
        await renameChat(activeChatId, newTitle);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to send message", "error");
    } finally {
      setSending(false);
    }
  }

  async function editMessage(msgId: string, content: string) {
    if (!activeChatId) return;
    await fetch(`/api/chats/${activeChatId}/messages/${msgId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    await loadMessages(activeChatId);
    toast("Message updated", "success");
  }

  async function regenerate() {
    if (!activeChatId || sending) return;
    // Find last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    // Delete last assistant message
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      await fetch(`/api/chats/${activeChatId}/messages/${lastAssistant.id}`, { method: "DELETE" });
    }
    await loadMessages(activeChatId);
    // Re-send
    await send(lastUserMsg.content);
  }

  async function handleExport() {
    const res = await fetch("/api/export");
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chats-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported successfully", "success");
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      await loadFolders();
      await loadChats(search);
      toast("Imported successfully", "success");
    } catch {
      toast("Import failed", "error");
    }
  }

  // Drag and drop handlers
  function handleDragStart(chatId: string) {
    setDraggedChatId(chatId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  async function handleDropOnFolder(folderId: string | null) {
    if (!draggedChatId) return;
    await moveChat(draggedChatId, folderId);
    setDraggedChatId(null);
    toast(folderId ? "Moved to folder" : "Moved to chats", "info");
  }

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden" style={{ background: "var(--bg)", color: "var(--text)" }}>
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
        )}
        <div className={`${mobileSidebarOpen ? "block" : "hidden"} md:block`}>
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            folders={folders}
            chats={chats}
            activeChatId={activeChatId}
            search={search}
            onSearch={setSearch}
            onSelectChat={selectChat}
            onNewChat={newChat}
            onNewFolder={newFolder}
            onRenameChat={renameChat}
            onDeleteChat={deleteChat}
            onPinChat={pinChat}
            onMoveChat={moveChat}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onExport={handleExport}
            onImport={handleImport}
            onOpenSettings={() => setView("settings")}
            draggedChatId={draggedChatId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDropOnFolder={handleDropOnFolder}
          />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <div className="h-10 border-b flex items-center justify-between px-4 shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="md:hidden text-lg"
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <div className="flex-1" />
            <button
              onClick={toggleTheme}
              className="text-xs px-3 py-1 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
          {view === "settings" ? (
            <SettingsView onBack={() => setView("chats")} />
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="space-y-3 w-64">
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-4 w-1/2" />
              </div>
            </div>
          ) : activeChat ? (
            <ChatView
              chatId={activeChat.id}
              chatTitle={activeChat.title}
              messages={messages}
              backend={backend}
              onBackendChange={changeBackend}
              onRenameTitle={(t) => renameChat(activeChat.id, t)}
              onDelete={() => deleteChat(activeChat.id)}
              onSend={send}
              onEditMessage={editMessage}
              onRegenerate={regenerate}
              sending={sending}
            />
          ) : (
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="text-6xl mb-4">💬</div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>Welcome to Chat Dashboard</h2>
                <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>Select a chat from the sidebar or start a new conversation. Use Ctrl+N to create a new chat, Ctrl+B to toggle the sidebar.</p>
                <button onClick={newChat} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-600/20">
                  + New chat
                </button>
              </div>
            </main>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}