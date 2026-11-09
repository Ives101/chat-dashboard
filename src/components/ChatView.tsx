"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useToast } from "@/components/Toast";

export type Message = { id: string; chat_id: string; role: string; content: string; created_at: number; reactions?: Record<string, "up" | "down"> | null };
export type Attachment = { id: string; message_id: string | null; chat_id: string; filename: string; mime_type: string; size: number; data: string; created_at: number };

type Props = {
  chatId: string;
  chatTitle: string;
  messages: Message[];
  backend: string;
  onBackendChange: (b: string) => void;
  onRenameTitle: (title: string) => void;
  onDelete: () => void;
  onSend: (text: string) => Promise<void>;
  onEditMessage: (msgId: string, content: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  sending: boolean;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatView({ chatId, chatTitle, messages, backend, onBackendChange, onRenameTitle, onDelete, onSend, onEditMessage, onRegenerate, sending }: Props) {
  const { toast } = useToast();
  // State hooks
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(chatTitle);
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [reactions, setReactions] = useState<Record<string, "up" | "down" | null>>({});
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [editHistory, setEditHistory] = useState<{ id: string; message_id: string; content: string; edited_at: number }[] | null>(null);
  const [historyMsgId, setHistoryMsgId] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Virtualizer hook
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  // Effects
  useEffect(() => { setTitle(chatTitle); }, [chatTitle]);
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "smooth" });
    }
  }, [messages.length, virtualizer]);

  useEffect(() => {
    fetch(`/api/chats/${chatId}/attachments`)
      .then((r) => r.json())
      .then((data) => setAttachments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [chatId, messages]);

  useEffect(() => {
    const fromDb: Record<string, "up" | "down" | null> = {};
    for (const m of messages) {
      const r = m.reactions;
      if (r && typeof r === "object" && "type" in r) {
        fromDb[m.id] = r.type as "up" | "down";
      }
    }
    try {
      const saved = localStorage.getItem("msg-reactions");
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(fromDb, parsed);
      }
    } catch {}
    setReactions(fromDb);
  }, [messages]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => { autoResize(); }, [input, autoResize]);

  async function submit() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    await onSend(text);
  }

  function copyMessage(id: string, content: string) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  function startEdit(msg: Message) {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
  }

  async function saveEdit(msgId: string) {
    if (!editContent.trim()) return;
    await onEditMessage(msgId, editContent.trim());
    setEditingMsgId(null);
    setEditContent("");
  }

  function toggleReaction(msgId: string, type: "up" | "down") {
    setReactions((prev) => {
      const current = prev[msgId];
      const next = current === type ? null : type;
      const updated = { ...prev, [msgId]: next };
      localStorage.setItem("msg-reactions", JSON.stringify(updated));
      fetch(`/api/chats/${chatId}/messages/${msgId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction: next }),
      }).catch(() => {});
      return updated;
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch(`/api/chats/${chatId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            size: file.size,
            data: base64,
          }),
        });
        if (res.ok) {
          const att = await res.json();
          setAttachments((prev) => [...prev, att]);
          toast(`Attached: ${file.name}`, "success");
        } else {
          toast(`Failed to attach: ${file.name}`, "error");
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }

  function removeAttachment(id: string) {
    fetch(`/api/chats/${chatId}/attachments?id=${id}`, { method: "DELETE" }).catch(() => {});
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function loadEditHistory(msgId: string) {
    if (historyMsgId === msgId) {
      setHistoryMsgId(null);
      setEditHistory(null);
      return;
    }
    try {
      const res = await fetch(`/api/chats/${chatId}/messages/${msgId}/edits`);
      const data = await res.json();
      setEditHistory(data);
      setHistoryMsgId(msgId);
    } catch {
      toast("Failed to load edit history", "error");
    }
  }

  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === "assistant" ? i : acc), -1);

  return (
    <main className="flex-1 flex flex-col h-full" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0 gap-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title.trim()) onRenameTitle(title.trim()); setEditing(false); }}
            onKeyDown={(e) => e.key === "Enter" && (onRenameTitle(title.trim()), setEditing(false))}
            className="bg-gray-800 px-3 py-1.5 rounded-lg text-lg font-medium outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <h1
            onClick={() => setEditing(true)}
            className="text-lg font-semibold cursor-pointer hover:text-blue-400 truncate"
            title="Click to rename"
            role="button"
            tabIndex={0}
            aria-label="Chat title, click to rename"
          >
            {chatTitle}
          </h1>
        )}
        <div className="flex items-center gap-2">
          <select
            value={backend}
            onChange={(e) => onBackendChange(e.target.value)}
            className="bg-gray-800 text-xs px-3 py-1.5 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            title="Reply backend"
            aria-label="Select reply backend"
          >
            <option value="openai">OpenAI (default)</option>
            <option value="agy">agy CLI</option>
            <option value="grok">grok CLI</option>
            <option value="opencode">opencode CLI</option>
            <option value="qwen">qwen CLI</option>
          </select>
          <button
            onClick={() => {
              const md = messages.map((m) => `**${m.role === "user" ? "You" : "Assistant"}:** ${m.content}`).join("\n\n---\n\n");
              navigator.clipboard.writeText(`# ${chatTitle}\n\n${md}`);
              toast("Conversation copied to clipboard", "success");
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 transition-colors"
            title="Copy conversation as Markdown"
            aria-label="Share conversation"
          >
            📋 Share
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/30 text-red-300 transition-colors"
            aria-label="Delete chat"
          >
            Delete
          </button>
        </div>
      </header>

      {/* Messages - Virtual Scrolled */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {messages.length === 0 && !sending && (
            <div className="text-center mt-24 absolute top-0 left-0 right-0" style={{ color: "var(--text-secondary)" }}>
              <div className="text-4xl mb-3">💬</div>
              <p className="text-base font-medium" style={{ color: "var(--text)" }}>Start a conversation</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Messages are saved automatically</p>
            </div>
          )}
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const m = messages[virtualItem.index];
            if (!m) return null;
            const idx = virtualItem.index;
            const isLastAssistant = m.role === "assistant" && idx === messages.reduce((acc, msg, i) => (msg.role === "assistant" ? i : acc), -1);
            return (
              <div
                key={m.id}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: 20,
                }}
              >
                <div className="max-w-3xl mx-auto">
                  <div className={`group flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[85%] flex flex-col gap-1">
                      {editingMsgId === m.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            ref={editTextareaRef}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-gray-800 text-sm px-4 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-700/50 min-h-[60px]"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingMsgId(null); setEditContent(""); }}
                              className="text-xs px-3 py-1 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(m.id)}
                              className="text-xs px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                              m.role === "user"
                                ? "bg-blue-600 text-white rounded-br-md"
                                : "bg-gray-800/80 text-gray-100 rounded-bl-md border border-gray-700/50"
                            }`}
                          >
                            {m.role === "assistant" ? (
                              <div className="prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
                                  {m.content}
                                </ReactMarkdown>
                              </div>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">{m.content}</span>
                            )}
                            {/* Attachments for this message */}
                            {attachments.filter((a) => a.message_id === m.id).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {attachments.filter((a) => a.message_id === m.id).map((a) => (
                                  <div key={a.id} className="rounded-lg overflow-hidden border border-gray-700/50">
                                    {a.mime_type.startsWith("image/") ? (
                                      <img src={`data:${a.mime_type};base64,${a.data}`} alt={a.filename} className="max-w-[200px] max-h-[200px] object-cover" />
                                    ) : (
                                      <div className="px-3 py-2 bg-gray-900/50 text-xs flex items-center gap-2">
                                        <span>📄</span>
                                        <span className="truncate max-w-[150px]">{a.filename}</span>
                                        <span className="text-gray-500">({Math.round(a.size / 1024)}KB)</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Edit history */}
                          {historyMsgId === m.id && editHistory && editHistory.length > 0 && (
                            <div className="mt-1 p-2 rounded-lg bg-gray-900/80 border border-gray-700/50 text-xs space-y-1">
                              <div className="text-gray-400 font-medium">Previous versions:</div>
                              {editHistory.map((e) => (
                                <div key={e.id} className="text-gray-300 pl-2 border-l-2 border-gray-700">
                                  <div className="text-[10px] text-gray-500 flex items-center justify-between">
                                    <span>{new Date(e.edited_at).toLocaleString()}</span>
                                    <button
                                      onClick={async () => {
                                        await onEditMessage(m.id, e.content);
                                        setHistoryMsgId(null);
                                        setEditHistory(null);
                                        toast("Restored previous version", "success");
                                      }}
                                      className="text-blue-400 hover:text-blue-300 text-[10px]"
                                    >
                                      Restore
                                    </button>
                                  </div>
                                  <div className="whitespace-pre-wrap">{e.content}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={`flex items-center gap-2 text-[10px] text-gray-500 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                            <span>{formatTime(m.created_at)}</span>
                            <button
                              onClick={() => copyMessage(m.id, m.content)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-300"
                              title="Copy"
                              aria-label="Copy message"
                            >
                              {copiedId === m.id ? "✓ Copied" : "Copy"}
                            </button>
                            {m.role === "user" && (
                              <>
                                <button
                                  onClick={() => startEdit(m)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-300"
                                  title="Edit"
                                  aria-label="Edit message"
                                >
                                  ✎ Edit
                                </button>
                                <button
                                  onClick={() => loadEditHistory(m.id)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-300"
                                  title="Edit history"
                                  aria-label="View edit history"
                                >
                                  📜 History
                                </button>
                              </>
                            )}
                            {m.role === "assistant" && isLastAssistant && (
                              <button
                                onClick={onRegenerate}
                                disabled={sending}
                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-300 disabled:opacity-50"
                                title="Regenerate"
                                aria-label="Regenerate response"
                              >
                                🔄 Regenerate
                              </button>
                            )}
                            {m.role === "assistant" && (
                              <span className="flex gap-1 ml-1">
                                <button
                                  onClick={() => toggleReaction(m.id, "up")}
                                  className={`transition-colors ${reactions[m.id] === "up" ? "text-green-400" : "opacity-0 group-hover:opacity-100 hover:text-gray-300"}`}
                                  title="Good response"
                                  aria-label="Thumbs up"
                                >
                                  👍
                                </button>
                                <button
                                  onClick={() => toggleReaction(m.id, "down")}
                                  className={`transition-colors ${reactions[m.id] === "down" ? "text-red-400" : "opacity-0 group-hover:opacity-100 hover:text-gray-300"}`}
                                  title="Bad response"
                                  aria-label="Thumbs down"
                                >
                                  👎
                                </button>
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {sending && (
            <div style={{ position: "absolute", top: virtualizer.getTotalSize(), left: 0, width: "100%" }}>
              <div className="max-w-3xl mx-auto">
                <div className="bg-gray-800/80 text-gray-400 px-4 py-3 rounded-2xl rounded-bl-md border border-gray-700/50 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} style={{ position: "absolute", top: virtualizer.getTotalSize(), left: 0, width: "100%", height: 1 }} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}>
        {/* Pending attachments */}
        {attachments.filter((a) => !a.message_id).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 max-w-3xl mx-auto">
            {attachments.filter((a) => !a.message_id).map((a) => (
              <div key={a.id} className="flex items-center gap-1.5 bg-gray-800/60 rounded-lg px-2 py-1 text-xs">
                {a.mime_type.startsWith("image/") ? (
                  <img src={`data:${a.mime_type};base64,${a.data}`} alt={a.filename} className="w-8 h-8 object-cover rounded" />
                ) : (
                  <span>📄</span>
                )}
                <span className="truncate max-w-[120px]">{a.filename}</span>
                <button onClick={() => removeAttachment(a.id)} className="text-red-400 hover:text-red-300 ml-1">×</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-3 rounded-xl bg-gray-800/80 hover:bg-gray-700 transition-colors text-lg"
            title="Attach file"
            aria-label="Attach file"
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Send a message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none bg-gray-800/80 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 max-h-48 border border-gray-700/50 placeholder:text-gray-500"
            aria-label="Message input"
          />
          <button
            onClick={submit}
            disabled={sending || !input.trim()}
            className="px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}