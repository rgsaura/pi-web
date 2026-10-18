import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { NextResponse } from "next/server";
import {
  ACTIVITY_CHANNELS,
  parseHerdrAgents,
  parsePiSessions,
  parseSystemctlState,
  parseTimers,
  type ActivitySnapshot,
} from "@/lib/activity-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXEC_TIMEOUT_MS = 6_000;
const CACHE_MS = 10_000;

let cache: { data: ActivitySnapshot; readAt: number } | null = null;
let inFlight: Promise<ActivitySnapshot> | null = null;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    // systemd --user needs the session bus and runtime dir; a server started
    // from a bare shell (nohup) has neither in its environment, so the
    // per-user defaults are filled in for the children.
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const env = { ...process.env };
    env.DBUS_SESSION_BUS_ADDRESS ??= `unix:path=/run/user/${uid}/bus`;
    env.XDG_RUNTIME_DIR ??= `/run/user/${uid}`;
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, cwd: homedir(), env }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  });
}

function runJson(command: string, args: string[]): Promise<unknown> {
  return run(command, args).then((output) => {
    try {
      return JSON.parse(output) as unknown;
    } catch {
      return null;
    }
  });
}

/** One channel's state, read from systemd; anything unreadable is unknown. */
async function readChannel(channel: { id: string; label: string; unit: string }) {
  const output = await run("systemctl", ["--user", "is-active", channel.unit]);
  const state = parseSystemctlState(output);

  let activeSessionId: string | undefined;
  let activeSessionName: string | undefined;
  let messageCount: number | undefined;

  try {
    const { readdirSync, statSync, readFileSync } = await import("fs");
    let sessionDir = "";
    if (channel.id === "rot") {
      sessionDir = join(homedir(), ".local/state/routines/sessions/rot");
    } else if (channel.id === "facesearch") {
      sessionDir = join(homedir(), ".local/state/rg-facesearch-bot/sessions");
    }

    if (sessionDir) {
      const files = readdirSync(sessionDir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => ({ name: f, path: join(sessionDir, f), mtime: statSync(join(sessionDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        const latestFile = files[0];
        const content = readFileSync(latestFile.path, "utf8");
        const lines = content.split("\n").filter(Boolean);
        if (lines.length > 0) {
          const firstLine = JSON.parse(lines[0]) as { id?: string };
          activeSessionId = firstLine.id || latestFile.name.replace(/\.jsonl$/, "");
          activeSessionName = latestFile.name.replace(/\.jsonl$/, "");
          messageCount = lines.filter((l) => l.includes('"type":"message"')).length;
        }
      }
    }
  } catch {}

  return {
    id: channel.id,
    label: channel.label,
    unit: channel.unit,
    state,
    activeSessionId,
    activeSessionName,
    messageCount,
  };
}

async function readSnapshot(): Promise<ActivitySnapshot> {
  const [channels, psOutput, herdrJson, timersJson, governorState] = await Promise.all([
    Promise.all(ACTIVITY_CHANNELS.map(readChannel)),
    run("ps", ["-eo", "pid,pcpu,comm,args"]),
    runJson(join(homedir(), ".local/bin/herdr"), ["agent", "list"]),
    runJson("systemctl", ["--user", "list-timers", "--no-pager", "-o", "json"]),
    run("cat", [join(homedir(), ".local/state/routines/token-governor/state.json")]),
  ]);

  let governorMode: "turbo" | "normal" | "eco" | undefined;
  try {
    const gov = JSON.parse(governorState);
    if (gov.mode) governorMode = gov.mode;
  } catch {}

  const delegations: import("@/lib/activity-data").ActivityDelegation[] = [];
  try {
    const { readdirSync, readFileSync } = await import("fs");
    const subDir = join(homedir(), ".local/state/routines/sessions/rot/subagent-artifacts");
    const files = readdirSync(subDir).filter((f) => f.endsWith("_meta.json"));
    for (const file of files.slice(-15)) {
      try {
        const d = JSON.parse(readFileSync(join(subDir, file), "utf8"));
        delegations.push({
          id: d.runId || file.replace(/_meta\.json$/, ""),
          channel: "ROT",
          agent: d.agent || "subagent",
          status: d.exitCode === 0 ? "completado" : d.exitCode ? "fallido" : d.status || "en curso",
          timestamp: d.timestamp || null,
          task: d.task && d.task !== "[prompt redacted]" ? d.task : undefined,
          error: d.error ? d.error.slice(0, 100) : undefined,
        });
      } catch {}
    }
  } catch {}

  return {
    capturedAt: new Date().toISOString(),
    channels,
    piSessions: parsePiSessions(psOutput),
    herdrAgents: parseHerdrAgents(herdrJson),
    timers: parseTimers(timersJson),
    delegations: delegations.reverse(),
    governorMode,
  };
}

/** GET /api/system-map — the live system map's data (the rg-tui's sources). */
export async function GET() {
  if (cache && Date.now() - cache.readAt < CACHE_MS) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }
  if (!inFlight) {
    inFlight = readSnapshot().finally(() => {
      inFlight = null;
    });
  }
  let snapshot: ActivitySnapshot;
  try {
    snapshot = await inFlight;
  } catch {
    return NextResponse.json({ error: "Activity unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  cache = { data: snapshot, readAt: Date.now() };
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
