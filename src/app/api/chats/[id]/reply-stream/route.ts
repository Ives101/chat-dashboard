import { NextResponse } from "next/server";
import { addMessage, listMessages, listAttachments, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const content = (body?.content ?? "").toString().trim();
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  addMessage(id, "user", content);

  // Link pending attachments
  const db = getDb();
  const unlinked = db.prepare("SELECT id FROM attachments WHERE chat_id = ? AND message_id IS NULL").all(id) as { id: string }[];
  for (const a of unlinked) {
    db.prepare("UPDATE attachments SET message_id = (SELECT id FROM messages WHERE chat_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1) WHERE id = ?").run(id, a.id);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = "";

      if (!apiKey) {
        const reply = `You said: "${content}"\n\n_(Set OPENAI_API_KEY to enable real AI replies.)_`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: reply })}\n\n`));
        addMessage(id, "assistant", reply);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
        return;
      }

      try {
        const history = listMessages(id).map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ model, messages: history, stream: true }),
        });

        if (!res.ok) {
          const errText = await res.text();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: `API error: ${res.status} ${errText}` })}\n\n`));
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: "No response body" })}\n\n`));
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                fullReply += delta;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: delta })}\n\n`));
              }
            } catch {}
          }
        }

        if (fullReply) addMessage(id, "assistant", fullReply);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", text: msg })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}