import { NextResponse } from "next/server";
import { listFolders, createFolder, renameFolder, deleteFolder } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listFolders());
}

export async function POST(req: Request) {
  const body = await req.json();
  const name = (body?.name ?? "New folder").toString().trim() || "New folder";
  return NextResponse.json(createFolder(name), { status: 201 });
}

export async function PUT(req: Request) {
  const body = await req.json();
  if (!body?.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  renameFolder(body.id, (body.name ?? "").toString().trim() || "Untitled");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  deleteFolder(id);
  return NextResponse.json({ ok: true });
}