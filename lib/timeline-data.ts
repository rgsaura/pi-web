/**
 * The Timeline view's model: events from every EXOHUMAN ledger/source
 * (encargos, propuestas, fallos, informes, recibos, sesiones Pi, rutinas,
 * calendario). Pure parsers; the route does the IO.
 */

export type TimelineKind =
  | "encargo"
  | "decision"
  | "fallo"
  | "informe"
  | "recibo"
  | "sesion"
  | "rutina"
  | "calendario"
  | "manual";

/** One thing that happened, or will happen, on a date. */
export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  detail?: string;
  /** ISO date the event happened (or starts). */
  ts: string;
  /** ISO end, when the source has a duration. */
  endTs?: string;
  sessionId?: string;
  category?: string;
  status?: string;
}

/** Events split around "now": history, the current day, and what's coming. */
export interface TimelineSplit {
  past: TimelineEvent[];
  today: TimelineEvent[];
  future: TimelineEvent[];
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validIso(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

/**
 * `exo-control read personal.calendar` lines like
 * "Mon Oct 20 12:00 [Deloitte] Documentos" → calendario events (current
 * year). Tolerant: a 00:00 time means a whole-day event; lines that don't
 * match (headers, noise) are skipped.
 */
export function parseCalendarText(text: string): TimelineEvent[] {
  const year = new Date().getFullYear();
  const events: TimelineEvent[] = [];
  const lines = String(text ?? "").split("\n");
  lines.forEach((line, index) => {
    const match = line.trim().match(
      /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}):(\d{2})\s+(.*)$/,
    );
    if (!match) return;
    const [, monthName, dayText, hourText, minuteText, rest] = match;
    const month = MONTHS[monthName];
    if (month === undefined) return;
    const date = new Date(year, month, Number(dayText), Number(hourText), Number(minuteText));
    if (Number.isNaN(date.getTime())) return;

    let title = rest.trim();
    let category: string | undefined;
    const categoryMatch = title.match(/^\[([^\]]+)\]\s*/);
    if (categoryMatch) {
      category = categoryMatch[1];
      title = title.slice(categoryMatch[0].length).trim();
    }
    if (!title) return;

    const allDay = hourText === "00" && minuteText === "00";
    events.push({
      id: `cal-${index}-${date.getTime()}`,
      kind: "calendario",
      title,
      ts: date.toISOString(),
      category,
      status: allDay ? "Todo el día" : undefined,
    });
  });
  return events;
}

/**
 * The encargos ledger ({encargos: {id: {descripcion, categoria, status,
 * creado, resuelto, titulo, session_id}}}) → one "creado" event per encargo
 * and one "completado" event per resolved (status done) encargo.
 */
export function mapEncargos(ledger: unknown): TimelineEvent[] {
  const root = isRecord(ledger) ? ledger : {};
  const rows = isRecord(root.encargos) ? root.encargos : {};
  const events: TimelineEvent[] = [];
  for (const [id, raw] of Object.entries(rows)) {
    if (!isRecord(raw)) continue;
    const row = raw as Record<string, unknown>;
    const label = str(row.titulo) || str(row.descripcion).slice(0, 60) || id;
    const category = str(row.categoria) || undefined;
    const sessionId = str(row.session_id) || undefined;
    const detail = str(row.descripcion) || undefined;

    const creado = str(row.creado);
    if (validIso(creado)) {
      events.push({
        id: `${id}-creado`,
        kind: "encargo",
        title: `Encargo creado: ${label}`,
        detail,
        ts: creado,
        sessionId,
        category,
        status: "creado",
      });
    }

    if (str(row.status) === "done") {
      const resuelto = str(row.resuelto);
      if (validIso(resuelto)) {
        events.push({
          id: `${id}-completado`,
          kind: "encargo",
          title: `Encargo completado: ${label}`,
          ts: resuelto,
          sessionId,
          category,
          status: "completado",
        });
      }
    }
  }
  return events;
}

/**
 * The proposals ledger ({version, proposals: {id: {title, summary, status,
 * created_at, expires_at, resolution: {resolved_at}}}}) → propuesta creada,
 * decisión tomada, and a future "⏳ caduca" reminder per proposal.
 */
export function mapProposals(ledger: unknown, nowMs: number = Date.now()): TimelineEvent[] {
  const root = isRecord(ledger) ? ledger : {};
  const rows = isRecord(root.proposals) ? root.proposals : {};
  const events: TimelineEvent[] = [];
  for (const [id, raw] of Object.entries(rows)) {
    if (!isRecord(raw)) continue;
    const row = raw as Record<string, unknown>;
    const label = str(row.title) || str(row.summary).slice(0, 60) || id;
    const category = str(row.category) || undefined;
    const detail = str(row.summary) || undefined;

    const createdAt = str(row.created_at);
    if (validIso(createdAt)) {
      events.push({
        id: `${id}-propuesta`,
        kind: "decision",
        title: `Propuesta: ${label}`,
        detail,
        ts: createdAt,
        category,
        status: "creada",
      });
    }

    const resolution = isRecord(row.resolution) ? row.resolution : {};
    const resolvedAt = str(resolution.resolved_at);
    if (validIso(resolvedAt)) {
      events.push({
        id: `${id}-decidida`,
        kind: "decision",
        title: `Decisión: ${label}`,
        ts: resolvedAt,
        category,
        status: "decidida",
      });
    }

    const expiresAt = str(row.expires_at);
    if (validIso(expiresAt) && Date.parse(expiresAt) > nowMs) {
      events.push({
        id: `${id}-caduca`,
        kind: "decision",
        title: `⏳ caduca: ${label}`,
        detail,
        ts: expiresAt,
        category,
        status: "pendiente",
      });
    }
  }
  return events;
}

/**
 * One failure-ledger JSONL line ({ts, kind, detail, fix}) → a fallo event;
 * null for anything that isn't a valid entry.
 */
export function parseFailureLine(line: string): TimelineEvent | null {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(entry)) return null;
  const ts = str(entry.ts);
  if (!validIso(ts)) return null;
  const kind = str(entry.kind) || "fallo";
  const detail = str(entry.detail);
  return {
    id: `fallo-${ts}-${kind}`,
    kind: "fallo",
    title: detail ? `${kind}: ${detail}` : kind,
    detail: str(entry.fix) || undefined,
    ts,
  };
}

/** Local YYYY-MM-DD key for a date (the timeline's grouping unit). */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Split events around nowMs's day: past days (newest first), the current
 * day (chronological), and future days (soonest first). Events without a
 * parseable date are dropped.
 */
export function splitTimeline(events: TimelineEvent[], nowMs: number): TimelineSplit {
  const nowDay = dayKey(new Date(nowMs));
  const past: TimelineEvent[] = [];
  const today: TimelineEvent[] = [];
  const future: TimelineEvent[] = [];
  for (const event of events) {
    const time = Date.parse(event.ts);
    if (!Number.isFinite(time)) continue;
    const key = dayKey(new Date(time));
    if (key === nowDay) today.push(event);
    else if (time < nowMs) past.push(event);
    else future.push(event);
  }
  const ascending = (a: TimelineEvent, b: TimelineEvent) => Date.parse(a.ts) - Date.parse(b.ts);
  const descending = (a: TimelineEvent, b: TimelineEvent) => Date.parse(b.ts) - Date.parse(a.ts);
  past.sort(descending);
  today.sort(ascending);
  future.sort(ascending);
  return { past, today, future };
}

const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** 'Hoy' | 'Ayer' | 'lun 20 oct' (es-ES style, no locale-data dependency). */
export function formatDayLabel(dateKey: string, nowMs: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  const now = new Date(nowMs);
  if (dateKey === dayKey(now)) return "Hoy";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dateKey === dayKey(yesterday)) return "Ayer";
  return `${WEEKDAYS_SHORT[date.getDay()]} ${day} ${MONTHS_SHORT[month - 1]}`;
}
