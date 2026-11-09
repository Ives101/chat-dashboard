"use client";
import { useState, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export type Folder = { id: string; name: string; created_at: number };
export type Chat = { id: string; title: string; folder_id: string | null; pinned: number; created_at: number; updated_at: number };

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  folders: Folder[];
  chats: Chat[];
  activeChatId: string | null;
  search: string;
  onSearch: (q: string) => void;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onNewFolder: () => void;
  onRenameChat: (id: string, title: string) => void;
  onDeleteChat: (id: string) => void;
  onPinChat: (id: string, pinned: boolean) => void;
  onMoveChat: (id: string, folderId: string | null) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenSettings?: () => void;
  draggedChatId?: string | null;
  onDragStart?: (chatId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDropOnFolder?: (folderId: string | null) => void;
};

type FlatItem =
  | { type: "header"; key: string; label: string }
  | { type: "chat"; key: string; chat: Chat }
  | { type: "empty"; key: string; text: string }
  | { type: "folder-header"; key: string; folder: Folder };

export default function Sidebar(props: Props) {
  const {
    collapsed, onToggle, folders, chats, activeChatId, search, onSearch, onSelectChat, onNewChat, onNewFolder,
    onRenameChat, onDeleteChat, onPinChat, onMoveChat, onRenameFolder, onDeleteFolder,
    onExport, onImport, onOpenSettings, draggedChatId, onDragStart, onDragOver, onDropOnFolder,
  } = props;

  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");

  const pinned = chats.filter((c) => c.pinned === 1);
  const unfoldered = chats.filter((c) => !c.folder_id && c.pinned !== 1);

  const parentRef = useRef<HTMLDivElement>(null);

  // Build a flat list of items for virtualization
  const flatItems: FlatItem[] = useMemo(() => {
    const items: FlatItem[] = [];
    if (pinned.length > 0) {
      items.push({ type: "header", key: "hdr-pinned", label: "Pinned" });
      for (const c of pinned) items.push({ type: "chat", key: `chat-${c.id}`, chat: c });
    }
    for (const f of folders) {
      const folderChats = chats.filter((c) => c.folder_id === f.id && c.pinned !== 1);
      items.push({ type: "folder-header", key: `folder-${f.id}`, folder: f });
      if (folderChats.length === 0) {
        items.push({ type: "empty", key: `empty-${f.id}`, text: "Empty folder" });
      } else {
        for (const c of folderChats) items.push({ type: "chat", key: `chat-${c.id}`, chat: c });
      }
    }
    if (unfoldered.length > 0) {
      items.push({ type: "header", key: "hdr-chats", label: "Chats" });
      for (const c of unfoldered) items.push({ type: "chat", key: `chat-${c.id}`, chat: c });
    }
    if (chats.length === 0) {
      items.push({ type: "empty", key: "empty-all", text: "No chats yet" });
    }
    return items;
  }, [pinned, folders, chats, unfoldered]);

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const item = flatItems[i];
      if (!item) return 32;
      if (item.type === "header" || item.type === "folder-header") return 24;
      if (item.type === "empty") return 24;
      return 34;
    },
    overscan: 8,
  });

  function startRenameChat(c: Chat) { setEditingChat(c.id); setEditTitle(c.title); }
  function commitRenameChat(id: string) { if (editTitle.trim()) onRenameChat(id, editTitle.trim()); setEditingChat(null); }
  function startRenameFolder(f: Folder) { setEditingFolder(f.id); setEditFolderName(f.name); }
  function commitRenameFolder(id: string) { if (editFolderName.trim()) onRenameFolder(id, editFolderName.trim()); setEditingFolder(null); }

  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 h-full flex flex-col items-center py-4 border-r gap-1 transition-all duration-200" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}>
        <button onClick={onToggle} title="Expand sidebar (Ctrl+B)" className="w-9 h-9 rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center justify-center transition-colors" style={{ color: "var(--text)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <div className="w-6 h-px my-1" style={{ background: "var(--border)" }} />
        <button onClick={onNewChat} title="New chat" className="w-9 h-9 rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center justify-center transition-colors" style={{ color: "var(--text)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button onClick={onNewFolder} title="New folder" className="w-9 h-9 rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center justify-center transition-colors" style={{ color: "var(--text)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 h-full flex flex-col border-r transition-all duration-200" style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text)" }}>
      {/* Header */}
      <div className="px-3 py-3 flex items-center justify-between">
        <span className="font-semibold text-base tracking-tight">Chats</span>
        <div className="flex gap-0.5">
          <button onClick={onNewFolder} title="New folder" className="w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] flex items-center justify-center transition-colors" style={{ color: "var(--text-secondary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
          </button>
          <button onClick={onNewChat} title="New chat (Ctrl+N)" className="w-7 h-7 rounded-md hover:bg-[var(--bg-tertiary)] flex items-center justify-center transition-colors" style={{ color: "var(--text-secondary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </span>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-gray-500 border transition-colors"
            style={{ background: "var(--bg-tertiary)", borderColor: "transparent", color: "var(--text)" }}
          />
        </div>
      </div>

      {/* Virtualized scrollable list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto px-2 py-1">
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = flatItems[virtualItem.index];
            if (!item) return null;
            return (
              <div
                key={item.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === "header" && (
                  <div className="text-[10px] uppercase tracking-wider px-2 py-1" style={{ color: "var(--text-muted)" }}>{item.label}</div>
                )}
                {item.type === "folder-header" && (
                  <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}
                    onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
                    onDrop={() => onDropOnFolder?.(item.folder.id)}
                  >
                    {editingFolder === item.folder.id ? (
                      <input
                        autoFocus
                        value={editFolderName}
                        onChange={(e) => setEditFolderName(e.target.value)}
                        onBlur={() => commitRenameFolder(item.folder.id)}
                        onKeyDown={(e) => e.key === "Enter" && commitRenameFolder(item.folder.id)}
                        className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-xs normal-case"
                        style={{ color: "var(--text)" }}
                      />
                    ) : (
                      <span onDoubleClick={() => startRenameFolder(item.folder)} className="truncate cursor-pointer hover:text-[var(--text)]">{item.folder.name}</span>
                    )}
                    <button onClick={() => onDeleteFolder(item.folder.id)} title="Delete folder" className="hover:text-red-400 opacity-60 hover:opacity-100 transition-opacity">×</button>
                  </div>
                )}
                {item.type === "empty" && (
                  <div className="text-xs px-2 py-1 italic" style={{ color: "var(--text-muted)" }}>{item.text}</div>
                )}
                {item.type === "chat" && renderChat(item.chat)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 border-t space-y-1" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={onToggle}
          title="Collapse sidebar (Ctrl+B)"
          className="w-full text-left text-xs py-1.5 px-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Collapse
        </button>
        <button
          onClick={() => onOpenSettings?.()}
          className="w-full text-left text-xs py-1.5 px-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </button>
        <div className="flex gap-1.5">
          <button onClick={onExport} className="flex-1 text-xs py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors flex items-center justify-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <label className="flex-1 text-xs py-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-center cursor-pointer flex items-center justify-center gap-1" style={{ color: "var(--text-secondary)" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import
            <input type="file" accept="application/json" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }} />
          </label>
        </div>
      </div>
    </aside>
  );

  function renderChat(c: Chat) {
    const isActive = c.id === activeChatId;
    return (
      <div
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart?.(c.id); }}
        onClick={() => onSelectChat(c.id)}
        className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
          isActive ? "bg-[var(--bg-tertiary)]" : "hover:bg-[var(--bg-tertiary)]"
        } ${draggedChatId === c.id ? "opacity-50" : ""}`}
        style={{ color: isActive ? "var(--text)" : "var(--text-secondary)" }}
      >
        {editingChat === c.id ? (
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => commitRenameChat(c.id)}
            onKeyDown={(e) => e.key === "Enter" && commitRenameChat(c.id)}
            className="flex-1 bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            style={{ color: "var(--text)" }}
          />
        ) : (
          <>
            <span className="truncate flex-1">{c.pinned === 1 ? "📌 " : ""}{c.title}</span>
            <div className="hidden group-hover:flex gap-0.5 items-center">
              <button onClick={(e) => { e.stopPropagation(); onPinChat(c.id, c.pinned !== 1); }} title="Pin" className="w-5 h-5 rounded hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-xs transition-colors">📌</button>
              <button onClick={(e) => { e.stopPropagation(); startRenameChat(c); }} title="Rename" className="w-5 h-5 rounded hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-xs transition-colors">✎</button>
              <select
                value={c.folder_id ?? ""}
                onChange={(e) => { e.stopPropagation(); onMoveChat(c.id, e.target.value || null); }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[var(--bg-tertiary)] text-[10px] rounded border-none"
                style={{ color: "var(--text)" }}
                title="Move to folder"
              >
                <option value="">—</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this chat?")) onDeleteChat(c.id); }} title="Delete" className="w-5 h-5 rounded hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-xs transition-colors" style={{ color: "var(--danger)" }}>×</button>
            </div>
          </>
        )}
      </div>
    );
  }
}