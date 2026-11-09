import { NextResponse } from "next/server";
import { addMessage, listMessages, listAttachments, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const userContent = (body?.content ?? "").toString().trim();
  if (!userContent) return NextResponse.json({ error: "content required" }, { status: 400 });

  // Include attachment context in the prompt
  const attachments = listAttachments(id);
  let fullContent = userContent;
  if (attachments.length > 0) {
    const attachmentContext = attachments.map((a) => {
      if (a.mime_type.startsWith("text/") || a.mime_type === "application/json") {
        try {
          const text = Buffer.from(a.data, "base64").toString("utf-8");
          return `[Attached file: ${a.filename}]\n\`\`\`\n${text}\n\`\`\``;
        } catch {
          return `[Attached file: ${a.filename}]`;
        }
      }
      return `[Attached file: ${a.filename} (${a.mime_type})]`;
    }).join("\n\n");
    fullContent = `${attachmentContext}\n\n${userContent}`;
  }

  // Store user message
  addMessage(id, "user", userContent);

  // Link any pending (unlinked) attachments to this user message
  const db = getDb();
  const unlinked = db.prepare("SELECT id FROM attachments WHERE chat_id = ? AND message_id IS NULL").all(id) as { id: string }[];
  for (const a of unlinked) {
    db.prepare("UPDATE attachments SET message_id = (SELECT id FROM messages WHERE chat_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1) WHERE id = ?").run(id, a.id);
  }

  // Generate assistant reply
  let reply = "";
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  if (apiKey) {
    try {
      const history = listMessages(id).map((m) => ({ role: m.role, content: m.content }));
      if (history.length > 0 && history[history.length - 1].role === "user") {
        history[history.length - 1].content = fullContent;
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, messages: history, stream: false }),
      });
      const data = await res.json();
      reply = data?.choices?.[0]?.message?.content ?? "";
      if (!reply) reply = "(No response from model)";
    } catch (e) {
      reply = `⚠️ LLM request failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    reply = `You said: "${userContent}"\n\n_(Set OPENAI_API_KEY to enable real AI replies.)_`;
    if (attachments.length > 0) {
      reply += `\n\n📎 ${attachments.length} file(s) attached: ${attachments.map((a) => a.filename).join(", ")}`;
    }
  }

  const assistantMsg = addMessage(id, "assistant", reply);
  return NextResponse.json({ user: null, assistant: assistantMsg });
}