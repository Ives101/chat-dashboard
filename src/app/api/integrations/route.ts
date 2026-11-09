import { NextResponse } from "next/server";
import { listIntegrations, upsertIntegration } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listIntegrations());
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const app = (body?.app ?? "").toString().trim();
  if (!app) return NextResponse.json({ error: "app required" }, { status: 400 });
  const integration = upsertIntegration(app, {
    connected: body?.connected,
    config: body?.config,
  });
  return NextResponse.json(integration);
}