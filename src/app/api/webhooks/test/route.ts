import { NextResponse } from "next/server";
import { listWebhooks } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url = (body?.url ?? "").toString().trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "test", message: "Hello from chat-dashboard", timestamp: Date.now() }),
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}