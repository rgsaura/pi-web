/**
 * The Activity view's model: the same live signals the rg-tui's system map
 * reads (channels, Pi sessions, Herdr agents, routines), parsed from the
 * host's own sources. Pure parsers; the route runs the commands.
 */

/** A monitored channel (a systemd --user service). */
export interface ActivityChannel {
  id: string;
  label: string;
  unit: string;
  state: "active" | "inactive" | "failed" | "unknown";
  activeSessionId?: string;
  activeSessionName?: string;
  messageCount?: number;
}

/** A Pi session process running right now with rich context. */
export interface ActivityPiSession {
  pid: string;
  /** CPU percent as ps reported it. */
  cpu: string;
  profile: string;
  sessionId: string;
  /** Concrete title or task description. */
  title?: string;
  /** Encargo ID if launched from rg-encargo/task-dispatcher. */
  encargoId?: string;
  /** High-level category name (e.g. "UI / Frontend", "Infra & Sistema"). */
  category?: string;
  /** Thematic category icon. */
  icon?: string;
  /** Accent badge color for category. */
  color?: string;
  /** Working directory of the session. */
  cwd?: string;
  /** Real-time status / latest action snippet. */
  currentAction?: string;
  /** Timestamp of last activity in ms. */
  lastActiveMs?: number;
  /** Work session (encargo, interactive) vs background routine (ROT, triage, watchers). */
  kind?: "work" | "routine";
}

/**
 * Work session (an encargo or interactive chat) vs background routine (ROT,
 * triage, watchers). Routine jsonl lives under routines/sessions; detached or
 * interactive runs are classified by their own words (enc-aca74f1f).
 */
export function classifySessionKind(source: {
  path?: string;
  cwd?: string;
  title?: string;
  firstUserText?: string;
}): "work" | "routine" {
  if (source.path && source.path.includes("/routines/")) return "routine";
  const text = `${source.cwd ?? ""} ${source.title ?? ""} ${source.firstUserText ?? ""}`.toLowerCase();
  if (/\brutina\b|briefing matinal|brief-morning|triage de correo|triage de llamadas/.test(text)) return "routine";
  return "work";
}

/** A Herdr agent. */
export interface ActivityHerdrAgent {
  name: string;
  status: string;
  cwd: string;
}

/** A routine timer (an rg- or rot- unit) with its schedule. */
export interface ActivityTimer {
  unit: string;
  cleanName: string;
  title: string;
  category: "comunicaciones" | "infra" | "sistema" | "proyectos" | "planes" | "otros";
  pilar: string;
  icon: string;
  activates: string;
  enabled: boolean;
  /** ISO date, when the timer has one scheduled. */
  next: string | null;
  /** ISO date of the last trigger, when there was one. */
  last: string | null;
}

export function categorizeTimer(unit: string): { cleanName: string; title: string; category: ActivityTimer["category"]; pilar: string; icon: string } {
  let clean = unit.replace(/\.timer$/, "").replace(/\.service$/, "");
  if (clean.startsWith("rg-")) clean = clean.slice(3);
  else if (clean.startsWith("rot-")) clean = clean.slice(4);

  let category: ActivityTimer["category"] = "otros";
  let pilar = "General";
  let icon = "⚡";

  if (/(?:triage|messages|mail|call|rot|bere|notif)/i.test(clean)) {
    category = "comunicaciones";
    pilar = "Comunicaciones";
    icon = "💬";
  } else if (/(?:infra|backup|snapshot|clean|fstrim|pve|storage)/i.test(clean)) {
    category = "infra";
    pilar = "Infraestructura";
    icon = "🖥️";
  } else if (/(?:heal|reconcile|reflection|token|governor|hygiene|health)/i.test(clean)) {
    category = "sistema";
    pilar = "Sistema";
    icon = "⚙️";
  } else if (/(?:facesearch|storylater|wallapop|vender|mercadona)/i.test(clean)) {
    category = "proyectos";
    pilar = "Proyectos";
    icon = "📦";
  } else if (/(?:social|research|planes|calendar|ocio|evento)/i.test(clean)) {
    category = "planes";
    pilar = "Planes & Agenda";
    icon = "🗓️";
  }

  const nameMap: Record<string, string> = {
    "triage-mail": "Triage de Correo",
    "triage-call": "Triage de Llamadas",
    "proactive-messages": "Vigilante de Mensajes Proactivo",
    "token-governor": "Gobernador de Tokens & Pacing",
    "heal-reconcile": "Reconciliador de Salud & Rutinas",
    "watch-calendar": "Vigilante de Calendario",
    "watch-wallapop": "Vigilante Wallapop",
    "watch-infra": "Watchdog de Infraestructura",
    "hygiene-herdr": "Higiene de Herdr",
    "watch-vender": "Vigilante Grupo VENDER",
    "session-proactive": "Sesión de Mejora Proactiva",
    "snapshot-config": "Backup de Configuración",
    "heal-reflection": "Auto-Reflexión Diaria",
    "brief-morning": "Briefing Matinal",
    "heal-health": "Evaluador de Salud EXO",
    "brief-facesearch": "Reporte FaceSearch",
    "research-social": "Exploración de Planes (Madrid)",
  };

  const title = nameMap[clean] ?? clean.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { cleanName: clean, title, category, pilar, icon };
}

export interface ActivityDelegation {
  id: string;
  channel: string;
  agent: string;
  status: string;
  timestamp: number | null;
  task?: string;
  error?: string;
}

export interface ActivitySnapshot {
  capturedAt: string;
  channels: ActivityChannel[];
  piSessions: ActivityPiSession[];
  herdrAgents: ActivityHerdrAgent[];
  timers: ActivityTimer[];
  delegations?: ActivityDelegation[];
  governorMode?: "turbo" | "normal" | "eco";
  tokenBudget?: {
    remaining: number;
    limit: number;
    usedPct: number;
    periodLabel: string;
    daysRemaining: number;
    resetLabel: string;
    surplusLabel: string;
    surplusPp: number;
    isOffPeak: boolean;
    offPeakDiscount: string;
    preferredProvider: string;
    fiveHour?: {
      remaining: number;
      limit: number;
      usedPct: number;
    };
  };
}

/** The channels the map watches, in display order. */
export const ACTIVITY_CHANNELS: readonly { id: string; label: string; unit: string }[] = [
  { id: "rot", label: "ROT", unit: "rot-assistant.service" },
  { id: "voz", label: "Voz", unit: "rg-voice-live.service" },
  { id: "facesearch", label: "FaceSearch", unit: "rg-facesearch-sentinel.service" },
];

/** `systemctl is-active` words → the three states the dot shows. */
export function parseSystemctlState(output: string): ActivityChannel["state"] {
  const value = output.trim();
  if (value === "active") return "active";
  if (value === "inactive" || value === "deactivated") return "inactive";
  if (value === "failed") return "failed";
  return "unknown";
}

/**
 * Pi session processes from `ps aux` output: the lines that name a pi
 * process with a profile or session flag (the rg-tui's rule), as
 * {pid, cpu, profile, sessionId}. CPU is the column ps printed.
 */
export function parsePiSessions(psOutput: string): ActivityPiSession[] {
  const rows: ActivityPiSession[] = [];
  for (const line of psOutput.split("\n")) {
    if (!line.trim() || /grep|ps aux|ps -eo/.test(line)) continue;

    // Ignorar si es el propio servidor pi-web
    if (line.includes("pi-web.js") || line.includes("piweb.js")) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    // Check if output is standard `ps aux` (where parts[0] is USER, parts[1] is PID, parts[2] is %CPU)
    // or `ps -eo pid,%cpu,comm,args` (where parts[0] is PID, parts[1] is %CPU, parts[2] is COMM)
    const isAux = parts[0] !== "PID" && isNaN(Number(parts[0])) && !isNaN(Number(parts[1]));
    const pid = isAux ? parts[1] : parts[0];
    const cpu = isAux ? parts[2] : parts[1];
    const comm = isAux ? parts[10] || parts[parts.length - 1] : parts[2];
    const args = isAux ? parts.slice(10).join(" ") : parts.slice(3).join(" ");

    const isPiProcess = comm === "pi" ||
      /(?:^|\s)(?:node\s+.*bin\/pi|pi|\S*\/pi)(?:\s|$)/.test(args) ||
      /\/opt\/exohuman\/.*\/node\s+.*pi/.test(args);

    if (!isPiProcess) continue;

    let profile = "";
    let sessionId = "";

    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "--profile") profile = parts[i + 1];
      if (parts[i] === "--session-id" || parts[i] === "--session") sessionId = parts[i + 1];
    }
    const envMatch = line.match(/PI_PROFILE=(\S+)/);
    if (!profile && envMatch) profile = envMatch[1];

    rows.push({
      pid,
      cpu,
      profile: profile || "default",
      sessionId: sessionId.slice(0, 30) || `sesión #${pid}`,
    });
  }
  return rows;
}

/** Herdr agents from `herdr agent list` JSON. */
export function parseHerdrAgents(json: unknown): ActivityHerdrAgent[] {
  const root = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  const result = root.result && typeof root.result === "object" && !Array.isArray(root.result) ? root.result as Record<string, unknown> : {};
  const agents = Array.isArray(result.agents) ? result.agents : [];
  return agents.flatMap((agent) => {
    if (!agent || typeof agent !== "object" || Array.isArray(agent)) return [];
    const row = agent as Record<string, unknown>;
    const cwd = typeof row.cwd === "string" ? row.cwd : "";
    const title = typeof row.terminal_title_stripped === "string" && row.terminal_title_stripped.trim()
      ? row.terminal_title_stripped
      : typeof row.agent === "string" ? row.agent : "agente";
    return [{ name: title, status: typeof row.agent_status === "string" ? row.agent_status : "?", cwd }];
  });
}

/** µs since epoch, as systemctl's JSON prints them, → ISO date. */
export function microsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value / 1000).toISOString();
}

/**
 * The rg- and rot- timers from `systemctl --user list-timers -o json` output,
 * soonest first.
 */
export function parseTimers(json: unknown): ActivityTimer[] {
  const rows = Array.isArray(json) ? json : [];
  const timers = rows.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const unit = typeof (row as Record<string, unknown>).unit === "string" ? (row as Record<string, unknown>).unit as string : "";
    if (!/^(rg|rot)-.*\.timer$/.test(unit)) return [];
    const meta = categorizeTimer(unit);
    return [{
      unit,
      cleanName: meta.cleanName,
      title: meta.title,
      category: meta.category,
      pilar: meta.pilar,
      icon: meta.icon,
      activates: typeof (row as Record<string, unknown>).activates === "string" ? (row as Record<string, unknown>).activates as string : "",
      enabled: true,
      next: microsToIso((row as Record<string, unknown>).next),
      last: microsToIso((row as Record<string, unknown>).last),
    }];
  });
  timers.sort((a, b) => {
    const aTime = a.next ? Date.parse(a.next) : Number.POSITIVE_INFINITY;
    const bTime = b.next ? Date.parse(b.next) : Number.POSITIVE_INFINITY;
    return aTime - bTime || a.unit.localeCompare(b.unit);
  });
  return timers;
}

/** A short Spanish "en 3 min / hace 2 min" for a future or past instant. */
export function formatCountdownEs(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const seconds = Math.round((time - now) / 1000);
  const abs = Math.abs(seconds);
  let value: string;
  if (abs < 60) value = `${abs} s`;
  else if (abs < 3600) value = `${Math.floor(abs / 60)} min`;
  else if (abs < 86_400) value = `${Math.floor(abs / 3600)} h`;
  else value = `${Math.floor(abs / 86_400)} d`;
  return seconds >= 0 ? `en ${value}` : `hace ${value}`;
}
