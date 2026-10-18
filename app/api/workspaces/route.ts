import { readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { NextResponse } from "next/server";
import { normalizeWorkspace, type WorkspaceSummary } from "@/lib/workspaces-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where EXO keeps one workspace.json per active workspace. */
function workspacesDir(): string {
  return process.env.PI_WORKSPACES_DIR ?? join(homedir(), ".local", "state", "workspaces-active");
}

/** An ISO date of the file's last write, without following links. */
function modifiedAt(path: string): string | null {
  try {
    return new Date(statSync(path).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * GET /api/workspaces — every workspace.json under
 * ~/.local/state/workspaces-active, normalized for the sidebar's Workspaces
 * tab. Unreadable entries are skipped, not fatal: the view shows the rest.
 */
export async function GET() {
  const dir = workspacesDir();
  const workspaces: WorkspaceSummary[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return NextResponse.json({ workspaces, dir });
  }
  for (const entry of entries.sort()) {
    const recordPath = join(dir, entry, "workspace.json");
    try {
      const raw: unknown = JSON.parse(readFileSync(recordPath, "utf8"));
      const record = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
      // ~/workspaces/<id> is this fork's convention for a workspace's code:
      // a known place to start a session when the record names none itself.
      const conventionCwd = join(homedir(), "workspaces", entry);
      workspaces.push(normalizeWorkspace(
        entry,
        record,
        modifiedAt(recordPath),
        isDirectory(conventionCwd) ? conventionCwd : null,
      ));
    } catch {
      // No workspace.json (an _artifacts folder) or an unreadable one: skipped.
    }
  }
  return NextResponse.json({ workspaces, dir });
}
