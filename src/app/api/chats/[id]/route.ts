import { NextResponse } from "next/server";
import { getChat, updateChat, deleteChat, listMessages } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const chat = getChat(id);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ chat, messages: listMessages(id) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const updated = updateChat(id, {
    title: body?.title,
    folder_id: body?.folder_id,
    pinned: body?.pinned,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteChat(id);
  return NextResponse.json({ ok: true });
}