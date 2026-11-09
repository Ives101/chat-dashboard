import { NextResponse } from "next/server";
import { addAttachment, listAttachments, deleteAttachment } from "@/lib/db";
import { readFileSync } from "fs";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json(listAttachments(id));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { filename, mime_type, size, data, message_id } = body;
  if (!filename || !data) {
    return NextResponse.json({ error: "filename and data required" }, { status: 400 });
  }
  const attachment = addAttachment(id, filename, mime_type ?? "application/octet-stream", size ?? 0, data, message_id);
  return NextResponse.json(attachment, { status: 201 });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteAttachment(id);
  return NextResponse.json({ ok: true });
}