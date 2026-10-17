/**
 * Client-safe formatting for the Exo panel: Spanish labels for the observed
 * states, wall-clock times in the snapshot's time zone, and a small cron
 * humanizer. Pure functions; the display never changes the captured values.
 */

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function decisionStateLabel(value?: string): string {
  switch (value) {
    case "open": return "Por decidir";
    case "accepted": return "Aceptada";
    case "rejected": return "Descartada";
    case "expired": return "Caducada";
    case "responded": return "Respondida";
    default: return value ?? "—";
  }
}

export function attentionStateLabel(value?: string): string {
  switch (value) {
    case "new": return "Nueva";
    case "seen": return "Vista";
    case "dismissed": return "Descartada";
    default: return value ?? "—";
  }
}

export function executionStateLabel(value?: string): string {
  switch (value) {
    case "none": return "Sin ejecución";
    case "prepared": return "Preparada";
    case "running": return "En ejecución";
    case "done": return "Ejecutada";
    case "failed": return "Fallida";
    default: return value ?? "—";
  }
}

export function routineStatusLabel(value?: string): string {
  switch (value) {
    case "backlog": return "Pendiente";
    case "todo": return "Programada";
    case "running": return "Ejecutando";
    case "done": return "Hecha";
    case "failed": return "Fallida";
    default: return value ?? "—";
  }
}

export function executionResultLabel(value?: string | null): string {
  switch (value) {
    case "succeeded": return "Correcta";
    case "failed": return "Fallo";
    case "cancelled": return "Cancelada";
    case null: case undefined: case "": return "Sin resultado";
    default: return value;
  }
}

export function sessionStatusLabel(value?: string): string {
  switch (value) {
    case "completed": return "Completada";
    case "empty": return "Vacía";
    case "running": return "En curso";
    case "failed": return "Fallida";
    default: return value ?? "—";
  }
}

/** Theme token per observed decision state; `--text-dim` for the rest. */
export function decisionStateColor(value?: string): string {
  switch (value) {
    case "open": return "var(--accent)";
    case "accepted": return "#16a34a";
    case "rejected": return "#ef4444";
    case "expired": return "#f59e0b";
    case "responded": return "#2563eb";
    default: return "var(--text-dim)";
  }
}

export function executionResultColor(value?: string | null): string {
  switch (value) {
    case "succeeded": return "#16a34a";
    case "failed": return "#dc2626";
    case "cancelled": return "var(--text-dim)";
    default: return "var(--text-dim)";
  }
}

/** "5 oct 2026, 06:30" in the snapshot's time zone. */
export function formatDateTimeEs(iso?: string | null, timeZone?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: timeZone || undefined,
    }).format(date).replace(",", "");
  } catch {
    return date.toISOString();
  }
}

/** "hace 3 h" / "en 2 días"; falls back to the absolute date. */
export function formatRelativeEs(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = (date.getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

/** Duration between two instants: "4 min", "1 h 23 min". */
export function formatDurationEs(startedAt?: string, endedAt?: string): string {
  if (!startedAt || !endedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/**
 * Wall time elapsed from `fromIso` to `toIso` (or now): "3 min", "5 h",
 * "2 d 4 h". The panel reads it as the time an item has been in progress.
 */
export function formatElapsedEs(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso) return "—";
  const start = new Date(fromIso).getTime();
  const end = toIso ? new Date(toIso).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const minutes = Math.floor((end - start) / 60000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hoursTotal = Math.floor(minutes / 60);
  if (hoursTotal < 24) {
    const rest = minutes % 60;
    return rest ? `${hoursTotal} h ${rest} min` : `${hoursTotal} h`;
  }
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;
  return hours ? `${days} d ${hours} h` : `${days} d`;
}

function weekdaysPhrase(dowField: string): string | null {
  const names: string[] = [];
  for (const part of dowField.split(",")) {
    const token = part.trim().toLowerCase();
    let index: number | null = null;
    if (/^[0-6]$/.test(token)) index = Number(token);
    else {
      const found = WEEKDAYS_ES.indexOf(token.slice(0, 3));
      if (found >= 0) index = found;
      else {
        const full = WEEKDAYS_ES.indexOf(token);
        if (full >= 0) index = full;
      }
    }
    if (index === null) return null;
    names.push(WEEKDAYS_ES[index]);
  }
  if (names.length === 0) return null;
  const last = names.pop() as string;
  return names.length ? `${names.join(", ")} y ${last}` : last;
}

/**
 * A short Spanish reading of a five-field cron expression, always beside the
 * literal expression in the UI. Times are wall-clock in the snapshot's zone;
 * the panel never computes future occurrences from the expression itself.
 */
export function formatCronEs(expr: string): string {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return expr;
  const [minute, hour, dom, month, dow] = fields;

  const everyMinutes = /^\*\/(\d+)$/.exec(minute);
  if (everyMinutes && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Cada ${everyMinutes[1]} minutos`;
  }
  if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `Cada hora a las :${String(minute).padStart(2, "0")}`;
  }
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour)) return expr;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  if (dow !== "*" && dom === "*") {
    const days = weekdaysPhrase(dow);
    if (days) return `Los ${days} a las ${time}`;
    return expr;
  }
  if (dom !== "*" && month === "*") {
    if (!/^\d+$/.test(dom)) return expr;
    const days = dow !== "*" ? weekdaysPhrase(dow) : null;
    const base = `El día ${Number(dom)} de cada mes`;
    return days ? `${base} (los ${days})` : `${base} a las ${time}`;
  }
  if (dom !== "*" && month !== "*") {
    if (!/^\d+$/.test(dom) || !/^\d+$/.test(month)) return expr;
    const monthName = MONTHS_ES[Number(month) - 1];
    if (!monthName) return expr;
    return `El ${Number(dom)} de ${monthName} a las ${time}`;
  }
  return `Todos los días a las ${time}`;
}
