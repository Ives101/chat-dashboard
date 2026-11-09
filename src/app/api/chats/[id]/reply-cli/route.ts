import { NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { addMessage, listMessages, getDb } from "@/lib/db";

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 180_000;
const MAX_BUFFER = 10 * 1024 * 1024;

function spawnAndCollect(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      cwd: opts.cwd,
      env: opts.env,
    });
    let stdout = "";
    let stderr = "";
    let resolved = false;
    let graceTimer: NodeJS.Timeout | null = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (graceTimer) clearTimeout(graceTimer);
      try { proc.kill(); } catch {}
      resolve({ stdout, stderr });
    };

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(finish, 2000);
    });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", () => {
      if (graceTimer) clearTimeout(graceTimer);
      if (!resolved) {
        resolved = true;
        resolve({ stdout, stderr });
      }
    });
    proc.on("error", (err) => {
      if (graceTimer) clearTimeout(graceTimer);
      if (!resolved) {
        resolved = true;
        resolve({ stdout, stderr: stderr + (err?.message ?? "") });
      }
    });
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (graceTimer) clearTimeout(graceTimer);
        try { proc.kill(); } catch {}
        resolve({ stdout, stderr });
      }
    }, TIMEOUT_MS);
  });
}

const AGY_PATH = process.env.AGY_PATH ?? "C:\\Users\\user\\AppData\\Local\\agy\\bin\\agy.exe";
const QWEN_PATH = process.env.QWEN_PATH ?? "C:\\Users\\user\\AppData\\Roaming\\npm\\qwen.cmd";
const GROK_PATH = process.env.GROK_PATH ?? "C:\\Users\\user\\.grok\\bin\\grok.exe";
const OPENCODE_PATH = process.env.OPENCODE_PATH ?? "C:\\Users\\user\\AppData\\Roaming\\npm\\node_modules\\@opencode\\cli\\bin\\opencode.exe";

function buildPrompt(history: { role: string; content: string }[], content: string): string {
  const lines: string[] = [];
  lines.push("You are a helpful assistant. Reply to the user's latest message.");
  lines.push("Conversation so far:");
  for (const m of history.slice(-12)) {
    lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
  }
  lines.push(`User: ${content}`);
  lines.push("Assistant:");
  return lines.join("\n");
}

async function runAgy(prompt: string, model?: string): Promise<string> {
  const args = ["--print", prompt, "--output-format", "text"];
  if (model) args.push("--model", model);
  const { stdout, stderr } = await execFileAsync(AGY_PATH, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  const out = (stdout || "").trim();
  if (!out && stderr) throw new Error(stderr.trim());
  return out || "(No response from agy)";
}

async function runGrok(prompt: string, model?: string): Promise<string> {
  const args = ["-p", prompt, "--output-format", "plain", "--max-turns", "1", "--permission-mode", "bypassPermissions"];
  if (model) args.push("-m", model);
  const { stdout, stderr } = await execFileAsync(GROK_PATH, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
  });
  const out = (stdout || "").trim();
  if (!out && stderr) throw new Error(stderr.trim());
  return out || "(No response from grok)";
}

async function runOpencode(prompt: string, model?: string): Promise<string> {
  const selectedModel = model ?? process.env.OPENCODE_MODEL ?? "opencode/beam-free";
  const args = ["run", prompt, "--auto", "--model", selectedModel];
  const { stdout, stderr } = await spawnAndCollect(OPENCODE_PATH, args, { cwd: process.cwd() });
  const out = (stdout || "").trim();
  if (!out && stderr) throw new Error(stderr.trim());
  return out || "(No response from opencode)";
}

async function runQwen(prompt: string, model?: string): Promise<string> {
  const args = ["--bare", "--approval-mode", "auto", "--max-tool-calls", "0", "-o", "text"];
  const authType = process.env.QWEN_AUTH_TYPE;
  const apiKey = process.env.QWEN_API_KEY ?? process.env.OPENAI_API_KEY;
  const baseUrl = process.env.QWEN_BASE_URL ?? process.env.OPENAI_BASE_URL;
  if (authType) args.push("--auth-type", authType);
  if (apiKey) args.push("--openai-api-key", apiKey);
  if (baseUrl) args.push("--openai-base-url", baseUrl);
  if (model) args.push("-m", model);
  args.push(prompt);
  const { stdout, stderr } = await execFileAsync(QWEN_PATH, args, {
    timeout: TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    shell: true,
  });
  const out = (stdout || "").trim();
  if (!out && stderr) throw new Error(stderr.trim());
  return out || "(No response from qwen)";
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const content = (body?.content ?? "").toString().trim();
  const backend = (body?.backend ?? "agy").toString();
  const model = body?.model ? String(body.model) : undefined;
  if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

  addMessage(id, "user", content);

  // Link any pending (unlinked) attachments to this user message
  const db = getDb();
  const unlinked = db.prepare("SELECT id FROM attachments WHERE chat_id = ? AND message_id IS NULL").all(id) as { id: string }[];
  for (const a of unlinked) {
    db.prepare("UPDATE attachments SET message_id = (SELECT id FROM messages WHERE chat_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1) WHERE id = ?").run(id, a.id);
  }

  let reply = "";
  try {
    const history = listMessages(id);
    const prompt = buildPrompt(history, content);
    switch (backend) {
      case "grok":
        reply = await runGrok(prompt, model);
        break;
      case "opencode":
        reply = await runOpencode(prompt, model);
        break;
      case "qwen":
        reply = await runQwen(prompt, model);
        break;
      default:
        reply = await runAgy(prompt, model);
    }
  } catch (e) {
    reply = `⚠️ ${backend} failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  const assistantMsg = addMessage(id, "assistant", reply);
  return NextResponse.json({ assistant: assistantMsg });
}