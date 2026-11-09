import { NextResponse } from "next/server";
import { createSharedLink, listSharedLinks, deleteSharedLink, getSharedChat } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const chatId = body?.chat_id;
  if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
  const link = createSharedLink(chatId, body?.expires_in_ms);
  const url = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/share/${link.token}`;
  return NextResponse.json({ ...link, url }, { status: 201 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chat_id");
  if (!chatId) return NextResponse.json({ error: "chat_id required" }, { status: 400 });
  return NextResponse.json(listSharedLinks(chatId));
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteSharedLink(id);
  return NextResponse.json({ ok: true });
}