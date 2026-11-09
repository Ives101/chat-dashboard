import { NextResponse } from "next/server";
import { importData } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  importData(body ?? {});
  return NextResponse.json({ ok: true });
}