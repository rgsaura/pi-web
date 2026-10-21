import { execFile } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, join } from "path";
import { NextResponse } from "next/server";
import {
  mapEncargos,
  mapProposals,
  parseCalendarText,
  parseFailureLine,
  splitTimeline,
  type TimelineEvent,
} from "@/lib/timeline-data";
import { readRetroEvents } from "@/lib/timeline-retro-store";
import { toTimelineEvent } from "@/lib/timeline-retro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXEC_TIMEOUT_MS = 6_000;
const CACHE_MS = 15_000;

let cache: { data: TimelineEvent[]; readAt: number } | null = null;
let inFlight: Promise<TimelineEvent[]> | null = null;

const home = homedir();

function run(command: string, args: string[], timeoutMs = EXEC_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve) => {
    // systemd --user needs the session bus and runtime dir; a server started
    // from a bare shell (nohup) has neither in its environment, so the
    // per-user defaults are filled in for the children (same fix as
    // /api/system-map).
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const env = { ...process.env };
    env.DBUS_SESSION_BUS_ADDRESS ??= `unix:path=/run/user/${uid}/bus`;
    env.XDG_RUNTIME_DIR ??= `/run/user/${uid}`;
    execFile(command, args, { timeout: timeoutMs, cwd: home, env }, (error, stdout) => {
      resolve(error ? "" : stdout);
    });
  });
}

function readJsonSync(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Encargos + propuestas (ledgers JSON locales). */
function readLedgerEvents(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const encargos = readJsonSync(join(home, ".local/state/encargos/ledger.json"));
  if (encargos) events.push(...mapEncargos(encargos));
  const proposals = readJsonSync(join(home, ".local/state/proposals/ledger.json"));
  if (proposals) events.push(...mapProposals(proposals));
  return events;
}

/** Últimas líneas del failure-ledger de rutinas. */
function readFailures(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  try {
    const path = join(home, ".local/state/routines/failure-ledger.jsonl");
    const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).slice(-40);
    for (const line of lines) {
      const event = parseFailureLine(line);
      if (event) events.push(event);
    }
  } catch {}
  return events;
}

/** Informes de rutinas y recibos: un evento por archivo (mtime). */
function readArtifacts(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const sources: { dir: string; kind: "informe" | "recibo" }[] = [
    { dir: join(home, ".local/state/routines/reports"), kind: "informe" },
    { dir: join(home, ".local/state/recibos"), kind: "recibo" },
  ];
  for (const { dir, kind } of sources) {
    try {
      const names = readdirSync(dir).filter((name) => {
        try {
          return statSync(join(dir, name)).isFile();
        } catch {
          return false;
        }
      });
      for (const name of names.slice(-30)) {
        try {
          const stat = statSync(join(dir, name));
          events.push({
            id: `${kind}-${name}`,
            kind,
            title: name.replace(/\.(md|png|json)$/i, "").replace(/[-_]/g, " ").slice(0, 80),
            ts: stat.mtime.toISOString(),
            status: kind,
          });
        } catch {}
      }
    } catch {}
  }
  return events;
}

/** Sesiones Pi recientes: primeras 60 + últimas 8 líneas, nunca el archivo entero. */
function readSessionEvents(): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  const files: { path: string; mtime: number }[] = [];
  const walk = (dir: string) => {
    try {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, item.name);
        if (item.isDirectory()) walk(full);
        else if (item.isFile() && item.name.endsWith(".jsonl")) {
          let stat;
          try {
            stat = statSync(full);
          } catch {
            continue;
          }
          if (stat.mtimeMs >= cutoff && stat.size <= 2 * 1024 * 1024) {
            files.push({ path: full, mtime: stat.mtimeMs });
          }
        }
      }
    } catch {}
  };
  walk(join(home, ".pi/agent/sessions"));
  walk(join(home, ".local/state/routines/sessions"));
  files.sort((a, b) => b.mtime - a.mtime);

  for (const { path, mtime } of files.slice(0, 12)) {
    try {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      const sample = lines.slice(0, 60).concat(lines.slice(-8));
      let id = "";
      let title = "";
      let cwd = "";
      for (const line of sample) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "session" && !id) {
            id = String(parsed.id ?? "");
            cwd = String(parsed.cwd ?? "");
          }
          if (!title && parsed.type === "message" && parsed.message?.role === "user") {
            const text = (parsed.message.content ?? [])
              .map((c: { text?: string }) => (typeof c?.text === "string" ? c.text : ""))
              .join(" ")
              .trim();
            if (text && !text.startsWith("<")) title = text.slice(0, 120);
          }
        } catch {}
      }
      if (!title) title = basename(path).replace(/\.jsonl$/, "").slice(0, 60);
      events.push({
        id: `sesion-${id || basename(path)}`,
        kind: "sesion",
        title,
        detail: cwd ? cwd.replace(home, "~") : undefined,
        ts: new Date(mtime).toISOString(),
        sessionId: id || undefined,
        status: "sesión",
      });
    } catch {}
  }
  return events;
}

/** Eventos retroactivos manuales (ledger propio, ya ordenados desc). */
function readRetroEventsAsTimeline(): TimelineEvent[] {
  try {
    return readRetroEvents().map(toTimelineEvent);
  } catch {
    return [];
  }
}

/** Timers systemd --user (unidades rg- y rot-): próximos disparos. */
async function readTimers(): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const output = await run("systemctl", ["--user", "list-timers", "--no-pager", "--plain"]);
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w{3})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+.*?\s((?:rg|rot)-[\w.-]+)\.timer/);
    if (!match) continue;
    const ts = new Date(`${match[2].replace(" ", "T")}Z`);
    if (Number.isNaN(ts.getTime())) continue;
    const unit = match[3];
    events.push({
      id: `rutina-${unit}`,
      kind: "rutina",
      title: `Rutina: ${unit}`,
      ts: ts.toISOString(),
      status: "programada",
    });
  }
  return events;
}

/** Calendario personal vía exo-control (best effort, 4s). */
async function readCalendar(): Promise<TimelineEvent[]> {
  const output = await run(join(home, ".local/bin/exo-control"), ["read", "personal.calendar"], 4_000);
  if (!output) return [];
  return parseCalendarText(output);
}

async function readAllEvents(): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  // Cada fuente es best-effort: una caída nunca tumba la respuesta.
  for (const source of [readLedgerEvents, readFailures, readArtifacts, readSessionEvents, readRetroEventsAsTimeline]) {
    try {
      events.push(...source());
    } catch {}
  }
  for (const source of [readTimers, readCalendar]) {
    try {
      events.push(...(await source()));
    } catch {}
  }
  const { past, today, future } = splitTimeline(events, Date.now());
  // Orden global descendente (mismo contrato que la vista: newest-first).
  return [...future].reverse().concat(today).concat(past);
}

export async function GET() {
  if (cache && Date.now() - cache.readAt < CACHE_MS) {
    return NextResponse.json(
      { capturedAt: new Date(cache.readAt).toISOString(), events: cache.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!inFlight) {
    inFlight = readAllEvents()
      .then((data) => {
        cache = { data, readAt: Date.now() };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  try {
    const data = await inFlight;
    return NextResponse.json(
      { capturedAt: new Date().toISOString(), events: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Timeline unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
