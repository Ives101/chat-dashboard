import { NextResponse } from "next/server";
import { listChats, createChat } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  return NextResponse.json(listChats(q));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = (body?.title ?? "New chat").toString();
  const folder_id = body?.folder_id ?? null;
  return NextResponse.json(createChat(title, folder_id), { status: 201 });
}