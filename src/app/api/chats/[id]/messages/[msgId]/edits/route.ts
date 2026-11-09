import { NextResponse } from "next/server";
import { getMessageEdits } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; msgId: string }> }) {
  const { msgId } = await ctx.params;
  const edits = getMessageEdits(msgId);
  return NextResponse.json(edits);
}