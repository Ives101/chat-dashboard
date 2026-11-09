import { NextResponse } from "next/server";
import { listWebhooks, createWebhook, updateWebhook, deleteWebhook } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listWebhooks());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name ?? "Webhook").toString().trim() || "Webhook";
  const url = (body?.url ?? "").toString().trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const events = Array.isArray(body?.events) ? body.events.map((e: any) => String(e)) : [];
  const secret = body?.secret ? String(body.secret) : null;
  const w = createWebhook({ name, url, events, secret });
  return NextResponse.json(w, { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const w = updateWebhook(body.id, {
    name: body.name,
    url: body.url,
    events: Array.isArray(body.events) ? body.events.map((e: any) => String(e)) : undefined,
    secret: body.secret,
    enabled: body.enabled,
  });
  if (!w) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(w);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteWebhook(id);
  return NextResponse.json({ ok: true });
}