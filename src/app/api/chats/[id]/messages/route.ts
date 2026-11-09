import { NextResponse } from "next/server";
import { listMessages, addMessage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json(listMessages(id));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const role = body?.role ?? "user";
  const content = (body?.content ?? "").toString();
  if (!content.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });
  const msg = addMessage(id, role, content);
  return NextResponse.json(msg, { status: 201 });
}