import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const name = getSetting("account.name") ?? "";
  const email = getSetting("account.email") ?? "";
  return NextResponse.json({ name, email });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.name !== undefined) setSetting("account.name", String(body.name));
  if (body?.email !== undefined) setSetting("account.email", String(body.email));
  const name = getSetting("account.name") ?? "";
  const email = getSetting("account.email") ?? "";
  return NextResponse.json({ name, email });
}