import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sandboxesDir(): string {
  return join(homedir(), ".local", "state", "exploration", "sandboxes");
}

export interface SandboxSummary {
  name: string;
  title: string;
  port: number;
  worktree: string;
  branch: string;
  url: string;
  status: "running" | "stopped" | "created";
  created_at: string;
  feedback?: string | null;
}

export async function GET() {
  const dir = sandboxesDir();
  const sandboxes: SandboxSummary[] = [];
  try {
    const files = readdirSync(dir);
    for (const f of files) {
      if (f.endsWith(".json")) {
        const fullPath = join(dir, f);
        try {
          const content = JSON.parse(readFileSync(fullPath, "utf8"));
          sandboxes.push(content);
        } catch {}
      }
    }
  } catch {}

  // Sort by created_at desc
  sandboxes.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ sandboxes });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, feedback } = body;
    if (!name || feedback === undefined) {
      return NextResponse.json({ error: "Faltan parámetros 'name' o 'feedback'" }, { status: 400 });
    }

    const dir = sandboxesDir();
    const filePath = join(dir, `${name}.json`);
    const content = JSON.parse(readFileSync(filePath, "utf8"));
    content.feedback = feedback;
    writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");

    return NextResponse.json({ success: true, sandbox: content });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Error guardando feedback" }, { status: 500 });
  }
}
