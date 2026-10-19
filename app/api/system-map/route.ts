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
  let tokenBudget: ActivitySnapshot["tokenBudget"] | undefined;
  try {
    const gov = JSON.parse(governorState);
    if (gov.mode) governorMode = gov.mode;

    const weekly = gov.zai?.weekly;
    if (weekly && weekly.limit > 0) {
      const remaining = weekly.remaining ?? 0;
      const limit = weekly.limit;
      const usedPct = weekly.used_pct ?? Math.round(((limit - remaining) / limit) * 100);
      const resetEpochMs = weekly.reset_epoch_ms ?? 0;
      const msLeft = Math.max(0, resetEpochMs - Date.now());
      const daysRemaining = Math.max(0, Math.round(msLeft / (1000 * 60 * 60 * 24)));

      let resetLabel = "En pocos días";
      if (resetEpochMs > 0) {
        const d = new Date(resetEpochMs);
        const dayNames = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
        const day = dayNames[d.getDay()];
        const hours = String(d.getHours()).padStart(2, "0");
        const mins = String(d.getMinutes()).padStart(2, "0");
        resetLabel = `${day} ${hours}:${mins}`;
      }

      const pacing = gov.pacing ?? {};
      const surplusPp = pacing.surplus_pp ?? 0;
      let surplusLabel = "En ritmo";
      if (surplusPp >= 10) surplusLabel = `Holgura +${Math.round(surplusPp)}%`;
      else if (surplusPp <= -10) surplusLabel = `Ajustado ${Math.round(surplusPp)}%`;

      tokenBudget = {
        remaining,
        limit,
        usedPct,
        periodLabel: "semana",
        daysRemaining,
        resetLabel,
        surplusLabel,
        surplusPp,
        isOffPeak: Boolean(gov.off_peak?.off_peak),
        offPeakDiscount: gov.off_peak?.discount || "50% off",
        preferredProvider: gov.preferred_provider || "zai",
        fiveHour: gov.zai?.five_hour ? {
          remaining: gov.zai.five_hour.remaining ?? 0,
          limit: gov.zai.five_hour.limit ?? 0,
          usedPct: gov.zai.five_hour.used_pct ?? 0,
        } : undefined,
      };
    }
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

  // Gather active and recent Pi sessions with full titles and categories
  const resolvedPiSessions: import("@/lib/activity-data").ActivityPiSession[] = [];
  try {
    const { readdirSync, statSync, readFileSync, existsSync } = await import("fs");
    const baseDir = join(homedir(), ".pi/agent/sessions");
    const sessionFiles: { path: string; mtime: number }[] = [];

    const walk = (d: string) => {
      try {
        for (const item of readdirSync(d, { withFileTypes: true })) {
          const full = join(d, item.name);
          if (item.isDirectory()) walk(full);
          else if (item.isFile() && item.name.endsWith(".jsonl")) {
            const mtime = statSync(full).mtimeMs;
            // Only sessions modified in the last 2 hours
            if (Date.now() - mtime < 2 * 3600 * 1000) {
              sessionFiles.push({ path: full, mtime });
            }
          }
        }
      } catch {}
    };

    if (existsSync(baseDir)) walk(baseDir);
    sessionFiles.sort((a, b) => b.mtime - a.mtime);

    // Also include routines sessions if recently active
    const routinesDir = join(homedir(), ".local/state/routines/sessions");
    if (existsSync(routinesDir)) walk(routinesDir);
    sessionFiles.sort((a, b) => b.mtime - a.mtime);

    const basePsSessions = parsePiSessions(psOutput);

    // Map files into rich session descriptors
    const fileSessionMap = new Map<string, {
      title: string;
      encargoId?: string;
      category: string;
      icon: string;
      color: string;
      cwd: string;
      currentAction: string;
      lastActiveMs: number;
    }>();

    for (const sf of sessionFiles.slice(0, 15)) {
      try {
        const content = readFileSync(sf.path, "utf8");
        const lines = content.split("\n").filter(Boolean);
        let id = "";
        let cwd = "";
        let firstUser = "";
        let lastTool = "";
        let lastAssistant = "";
        let sessionInfoName = "";

        let isFinished = false;
        for (const line of lines) {
          try {
            const p = JSON.parse(line);
            if (p.type === "session") { id = p.id; cwd = p.cwd; }
            if (p.type === "session_info") { sessionInfoName = p.name; }
            if (p.type === "message") {
              if (p.message?.role === "user" && !firstUser) {
                firstUser = (p.message.content || []).map((c: any) => c.text || "").join(" ").trim();
              }
              if (p.message?.role === "assistant") {
                const t = (p.message.content || []).find((c: any) => c.type === "text");
                if (t?.text) lastAssistant = t.text.trim();
                const tool = (p.message.content || []).find((c: any) => c.type === "toolCall");
                if (tool) {
                  lastTool = tool.name;
                  isFinished = false;
                }
                const stopReason = p.stopReason || p.message?.stopReason;
                if ((stopReason === "stop" || stopReason === "endTurn") && !tool) {
                  isFinished = true;
                }
              }
            }
          } catch {}
        }

        if (!id || isFinished) continue;

        
        let encargoId = "";
        let title = "";
        let category = "General";
        let icon = "⚡";
        let color = "#38bdf8";

        const encMatch = firstUser.match(/ENCARGO OFICIAL(?:\s*\(([a-z0-9-]+)\))?:\s*([^\n]+)/i);
        const voiceMatch = firstUser.match(/\[Nota de voz(?:[^\]]*)\]\s*([^\n]+)/i);

        if (encMatch) {
          encargoId = encMatch[1] || "";
        }

        if (voiceMatch && voiceMatch[1].trim().length > 8) {
          title = voiceMatch[1].trim().replace(/^["'\s]+|["'\s]+$/g, "");
        } else if (encMatch && encMatch[2].trim().length > 5) {
          title = encMatch[2].trim();
        } else if (sessionInfoName && sessionInfoName !== "Asistente") {
          title = sessionInfoName;
        } else if (firstUser) {
          const firstLine = firstUser.split("\n")[0].replace(/^#+\s*/, "").trim();
          title = firstLine;
        } else {
          title = "Sesión interactiva";
        }

        const combinedText = `${cwd} ${title} ${firstUser}`.toLowerCase();
        if (combinedText.includes("facesearch")) {
          category = "FaceSearch"; icon = "🔍"; color = "#38bdf8";
        } else if (combinedText.includes("exohuman-ui") || combinedText.includes("piweb") || combinedText.includes("ui") || combinedText.includes("frontend")) {
          category = "UI / Frontend"; icon = "🎨"; color = "#a855f7";
        } else if (combinedText.includes("exohuman") || combinedText.includes("memoria") || combinedText.includes("exo")) {
          category = "ExoHuman OS"; icon = "🧠"; color = "#ec4899";
        } else if (combinedText.includes("comms") || combinedText.includes("beeper") || combinedText.includes("telegram") || combinedText.includes("correo") || combinedText.includes("rot")) {
          category = "Comunicaciones"; icon = "💬"; color = "#10b981";
        } else if (combinedText.includes("infra") || combinedText.includes("pve") || combinedText.includes("proxmox") || combinedText.includes("token") || combinedText.includes("governor")) {
          category = "Infra & Sistema"; icon = "⚙️"; color = "#eab308";
        } else if (combinedText.includes("planes") || combinedText.includes("ocio") || combinedText.includes("concierto") || combinedText.includes("agenda")) {
          category = "Planes & Agenda"; icon = "🗓️"; color = "#f97316";
        } else if (combinedText.includes("wallapop") || combinedText.includes("vender")) {
          category = "Wallapop"; icon = "📦"; color = "#06b6d4";
        } else if (combinedText.includes("rutina") || combinedText.includes("brief") || sf.path.includes("/routines/")) {
          category = "Rutinas"; icon = "⏱️"; color = "#14b8a6";
        }

        let currentAction = "";
        if (lastTool) {
          currentAction = `Ejecutando ${lastTool}`;
        } else if (lastAssistant) {
          currentAction = lastAssistant.slice(0, 75).replace(/\n/g, " ");
        } else {
          currentAction = "Procesando encargo";
        }

        fileSessionMap.set(id, {
          title,
          encargoId,
          category,
          icon,
          color,
          cwd,
          currentAction,
          lastActiveMs: sf.mtime,
        });
      } catch {}
    }

    // Merge with currently running processes
    const seenSessionIds = new Set<string>();

    // First: insert all actual active/working sessions from files and recent runs
    for (const [id, meta] of fileSessionMap.entries()) {
      // Check if session has recent activity (last 30 minutes)
      if (Date.now() - meta.lastActiveMs < 30 * 60 * 1000) {
        seenSessionIds.add(id);
        resolvedPiSessions.push({
          pid: "pi",
          cpu: "0.0",
          profile: "asistente",
          sessionId: id,
          title: meta.title,
          encargoId: meta.encargoId,
          category: meta.category,
          icon: meta.icon,
          color: meta.color,
          cwd: meta.cwd,
          currentAction: meta.currentAction,
          lastActiveMs: meta.lastActiveMs,
        });
      }
    }

    // Second: if any psRow had an actual UUID session that was missed, include it
    for (const psRow of basePsSessions) {
      if (psRow.sessionId && psRow.sessionId.startsWith("01a1") && !seenSessionIds.has(psRow.sessionId)) {
        seenSessionIds.add(psRow.sessionId);
        const match = fileSessionMap.get(psRow.sessionId);
        resolvedPiSessions.push({
          pid: psRow.pid,
          cpu: psRow.cpu,
          profile: psRow.profile,
          sessionId: psRow.sessionId,
          title: match?.title || `Sesión de ${psRow.profile}`,
          encargoId: match?.encargoId,
          category: match?.category || "General",
          icon: match?.icon || "⚡",
          color: match?.color || "#38bdf8",
          cwd: match?.cwd,
          currentAction: match?.currentAction || "En ejecución activa",
          lastActiveMs: match?.lastActiveMs || Date.now(),
        });
      }
    }
  } catch {}

  return {
    capturedAt: new Date().toISOString(),
    channels,
    piSessions: resolvedPiSessions.length > 0 ? resolvedPiSessions : parsePiSessions(psOutput),
    herdrAgents: parseHerdrAgents(herdrJson),
    timers: parseTimers(timersJson),
    delegations: delegations.reverse(),
    governorMode,
    tokenBudget,
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
