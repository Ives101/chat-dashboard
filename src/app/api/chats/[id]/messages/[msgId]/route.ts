import { NextResponse } from "next/server";
import { updateMessage, deleteMessage, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string; msgId: string }> }) {
  const { id, msgId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (body?.reaction !== undefined) {
    // Update reaction
    const db = getDb();
    const reaction = body.reaction; // "up", "down", or null
    db.prepare("UPDATE messages SET reactions = ? WHERE id = ? AND chat_id = ?").run(
      JSON.stringify(reaction ? { type: reaction } : {}),
      msgId,
      id
    );
    return NextResponse.json({ ok: true });
  }
  const content = (body?.content ?? "").toString();
  if (!content.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });
  updateMessage(msgId, id, content);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; msgId: string }> }) {
  const { id, msgId } = await ctx.params;
  deleteMessage(msgId, id);
  return NextResponse.json({ ok: true });
}