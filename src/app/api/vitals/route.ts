import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  // Ensure table exists
  db.exec(`CREATE TABLE IF NOT EXISTS web_vitals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT,
    delta REAL,
    metric_id TEXT,
    navigation_type TEXT,
    url TEXT,
    timestamp INTEGER NOT NULL
  )`);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  db.prepare("INSERT INTO web_vitals (id, name, value, rating, delta, metric_id, navigation_type, url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    id,
    body.name ?? "unknown",
    body.value ?? 0,
    body.rating ?? null,
    body.delta ?? null,
    body.id ?? null,
    body.navigationType ?? null,
    body.url ?? null,
    body.timestamp ?? Date.now()
  );
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS web_vitals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    rating TEXT,
    delta REAL,
    metric_id TEXT,
    navigation_type TEXT,
    url TEXT,
    timestamp INTEGER NOT NULL
  )`);
  const rows = db.prepare("SELECT * FROM web_vitals ORDER BY timestamp DESC LIMIT 100").all();
  // Aggregate by metric name
  const aggregated: Record<string, { values: number[]; ratings: Record<string, number> }> = {};
  for (const r of rows as any[]) {
    if (!aggregated[r.name]) aggregated[r.name] = { values: [], ratings: {} };
    aggregated[r.name].values.push(r.value);
    const rating = r.rating ?? "unknown";
    aggregated[r.name].ratings[rating] = (aggregated[r.name].ratings[rating] ?? 0) + 1;
  }
  const summary = Object.entries(aggregated).map(([name, data]) => ({
    name,
    count: data.values.length,
    avg: data.values.reduce((a, b) => a + b, 0) / data.values.length,
    min: Math.min(...data.values),
    max: Math.max(...data.values),
    ratings: data.ratings,
  }));
  return NextResponse.json({ summary, recent: rows });
}