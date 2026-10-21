/**
 * The retroactive timeline's model: manual past events entered by hour
 * ("ayer 18h cine con Agus"), their ledger row format, the hour-band
 * aggregation (madrugada…noche) and the learned suggestions. Pure functions
 * shared by the API routes and the client's live preview; no IO here.
 *
 * Dates resolve in the caller's local zone by default; the API fallback
 * path passes Europe/Madrid explicitly because the host runs in UTC.
 */

import type { TimelineEvent } from "./timeline-data";

/** One manually-logged past thing, stored at hour granularity. */
export interface RetroEvent {
  id: string;
  /** ISO timestamp of when it happened (hour precision). */
  ts: string;
  /** ISO end, when a duration was given. */
  endTs?: string;
  title: string;
  category?: string;
  detail?: string;
  createdAt: string;
}

/** The "when" half of a quick entry, already resolved to a concrete moment. */
export interface ParsedWhen {
  /** Resolved day at midnight in the working zone. */
  date: Date;
  hour: number | null;
  minute: number | null;
  /** The original text span that produced this ("ayer 18h"). */
  matched: string;
}

export interface QuickEntryParse {
  title: string;
  when: ParsedWhen | null;
}

export type HourBandId = "madrugada" | "manana" | "mediodia" | "tarde" | "noche";

export interface HourBandMeta {
  id: HourBandId;
  label: string;
  icon: string;
  color: string;
  from: number;
  to: number;
}

/** Spanish day bands. `to` is inclusive (0–5, 6–11, 12–15, 16–19, 20–23). */
export const HOUR_BANDS: HourBandMeta[] = [
  { id: "madrugada", label: "Madrugada", icon: "🌙", color: "#6366f1", from: 0, to: 5 },
  { id: "manana", label: "Mañana", icon: "☀️", color: "#f59e0b", from: 6, to: 11 },
  { id: "mediodia", label: "Mediodía", icon: "🍽️", color: "#22c55e", from: 12, to: 15 },
  { id: "tarde", label: "Tarde", icon: "🌤️", color: "#38bdf8", from: 16, to: 19 },
  { id: "noche", label: "Noche", icon: "🌃", color: "#a855f7", from: 20, to: 23 },
];

export function hourBand(hour: number): HourBandMeta {
  const clamped = ((Math.trunc(hour) % 24) + 24) % 24;
  return HOUR_BANDS.find((band) => clamped >= band.from && clamped <= band.to) ?? HOUR_BANDS[0];
}

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, miércoles: 3,
  jueves: 4, viernes: 5, sabado: 6, sábado: 6,
};

// Date token: "ayer", "anteayer", "hoy", weekday, d/m, d-m-y, ISO. Leading only.
const DATE_TOKEN =
  /^(?:el\s+|la\s+)?(antes\s+de\s+ayer|anteayer|ayer|pasado\s+mañana|hoy|(?:lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)|(?:\d{4}-\d{2}-\d{2})|(?:\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)|mañana)(?=\s|$|[,.;:!?])/i;

// Time after a date token: a bare number already means the hour ("ayer 18 cine").
const TIME_AFTER_DATE =
  /^(?:a\s+las?\s+|sobre\s+las?\s+|@\s*)?(\d{1,2})(?::(\d{2}))?(?:\s*(?:h|hrs|horas))?(?=\s|$|[,.;:!?])/i;

// Explicit time anywhere (no date token needed): "a las 18", "18:30", "18h".
const TIME_EXPLICIT =
  /(?:a\s+las?\s+|sobre\s+las?\s+)(\d{1,2})(?::(\d{2}))?(?:\s*(?:h|hrs|horas)?)?\b|(\d{1,2}):(\d{2})\b|(\d{1,2})\s*(?:h|hrs|horas)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validIso(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

/** Calendar day tuple; day math happens on it, timezone-agnostic. */
interface DayTuple {
  year: number;
  month: number; // 1-12
  day: number;
}

function tupleFromUtcMs(ms: number): DayTuple {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function tupleAtOffset(tuple: DayTuple, offsetDays: number): DayTuple {
  return tupleFromUtcMs(Date.UTC(tuple.year, tuple.month - 1, tuple.day + offsetDays));
}

function tupleMs(tuple: DayTuple): number {
  return Date.UTC(tuple.year, tuple.month - 1, tuple.day);
}

/** The calendar day an instant falls on, in `timeZone`. */
function dayTupleInZone(date: Date, timeZone: string): DayTuple {
  return tupleFromUtcMs(date.getTime() + zoneOffsetMs(date, timeZone));
}

/** Offset (ms) of `timeZone` at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const zoneAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return zoneAsUtc - date.getTime();
}

/** A wall-clock datetime of `timeZone` → the matching Date (DST-safe). */
function zonedTimeToUtc(tuple: DayTuple, hour: number, minute: number, timeZone: string): Date {
  const naive = Date.UTC(tuple.year, tuple.month - 1, tuple.day, hour, minute);
  let guess = naive - zoneOffsetMs(new Date(naive), timeZone);
  guess = naive - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess);
}

/** "Now" broken into the working zone's calendar parts. */
interface NowParts {
  today: DayTuple;
  weekday: number;
  nowMs: number;
}

function nowPartsFor(nowMs: number, timeZone?: string): NowParts {
  const date = new Date(nowMs);
  if (!timeZone) {
    return {
      today: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
      weekday: date.getDay(),
      nowMs,
    };
  }
  const zoned = new Date(nowMs + zoneOffsetMs(date, timeZone));
  return {
    today: tupleFromUtcMs(zoned.getTime()),
    weekday: zoned.getUTCDay(),
    nowMs,
  };
}

/** Weekday tokens resolve to the most recent strictly-past occurrence. */
function lastWeekday(now: NowParts, target: number): DayTuple {
  const diff = (((now.weekday - target) % 7) + 7) % 7;
  return tupleAtOffset(now.today, diff === 0 ? -7 : -diff);
}

/** d/m or d-m(-y): current year, stepping back a year when it lands far ahead. */
function numericDay(now: NowParts, day: number, month: number, year: number): DayTuple | null {
  const tuple: DayTuple = { year, month, day };
  if (tupleMs(tuple) - now.nowMs > 45 * 24 * 3600 * 1000) {
    return { ...tuple, year: year - 1 };
  }
  return tuple;
}

function resolveDateToken(token: string, now: NowParts): DayTuple | null {
  const key = token.toLowerCase().replace(/\s+/g, " ");
  if (key === "hoy") return now.today;
  if (key === "ayer") return tupleAtOffset(now.today, -1);
  if (key === "anteayer" || key === "antes de ayer") return tupleAtOffset(now.today, -2);
  if (key === "mañana" || key === "manana") return tupleAtOffset(now.today, 1);
  if (key === "pasado mañana" || key === "pasado manana") return tupleAtOffset(now.today, 2);
  if (WEEKDAYS[key] !== undefined) return lastWeekday(now, WEEKDAYS[key]);

  const iso = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  }
  const numeric = key.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = now.today.year;
    if (numeric[3]) {
      const raw = Number(numeric[3]);
      year = numeric[3].length <= 2 ? 2000 + raw : raw;
    }
    return numericDay(now, day, month, year);
  }
  return null;
}

function cleanTitle(text: string): string {
  return text
    .replace(/^[\s,–—\-:;.]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse a quick retro entry: "ayer 18h cine con Agus" → when + title.
 * The when-clause may lead ("ayer 18h cine") or be an explicit time inside
 * the text ("cine a las 18"). Without any when, only the title comes back
 * and the caller falls back to its date/time pickers. With `timeZone` set
 * (the API's fallback path, on a UTC host), day words resolve in that zone.
 */
export function parseQuickEntry(text: string, nowMs: number = Date.now(), timeZone?: string): QuickEntryParse {
  const source = String(text ?? "").trim();
  if (!source) return { title: "", when: null };

  const now = nowPartsFor(nowMs, timeZone);
  const tupleToDate = (tuple: DayTuple, h: number, m: number): Date =>
    timeZone ? zonedTimeToUtc(tuple, h, m, timeZone) : new Date(tuple.year, tuple.month - 1, tuple.day, h, m);

  let rest = source;
  let day: DayTuple | null = null;
  let hour: number | null = null;
  let minute: number | null = null;
  const matchedParts: string[] = [];

  const dateMatch = rest.match(DATE_TOKEN);
  if (dateMatch) {
    const resolved = resolveDateToken(dateMatch[1], now);
    if (resolved) {
      day = resolved;
      matchedParts.push(dateMatch[0].trim());
      // Separators between the date and its time ("ayer — 18h") drop off so
      // the time token anchors cleanly at the start of what remains.
      rest = rest.slice(dateMatch[0].length).replace(/^[\s,;:\u2013\u2014-]+/, "");
      // A time right after the date: "ayer 18", "ayer a las 18:30", "ayer 18h".
      const timeMatch = rest.match(TIME_AFTER_DATE);
      if (timeMatch) {
        const h = Number(timeMatch[1]);
        const m = timeMatch[2] ? Number(timeMatch[2]) : 0;
        if (h <= 23 && m <= 59) {
          hour = h;
          minute = m;
          matchedParts.push(timeMatch[0].trim());
          rest = rest.slice(timeMatch[0].length);
        }
      }
    }
  }

  if (!day) {
    // No date token: an explicit time anywhere pins "today", or yesterday
    // when that hour has not happened yet (this ledger is about the past).
    const timeMatch = rest.match(TIME_EXPLICIT);
    if (timeMatch) {
      const h = Number(timeMatch[1] ?? timeMatch[3] ?? timeMatch[5]);
      const m = Number(timeMatch[2] ?? timeMatch[4] ?? 0);
      if (h <= 23 && m <= 59) {
        hour = h;
        minute = m;
        const candidate = tupleToDate(now.today, h, m);
        day = candidate.getTime() > now.nowMs ? tupleAtOffset(now.today, -1) : now.today;
        matchedParts.push(timeMatch[0].trim());
        rest = rest.replace(timeMatch[0], " ");
      }
    }
  }

  const title = cleanTitle(rest);
  if (!day) return { title: cleanTitle(source), when: null };

  return {
    title,
    when: {
      date: tupleToDate(day, 0, 0),
      hour,
      minute,
      matched: matchedParts.join(" ").trim(),
    },
  };
}

/** Diacritics-off copy of a title, for keyword matching and repeat grouping. */
function normalizeText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Full resolution of a quick entry into the ISO timestamp to store: the
 * API's fallback path uses it so "ayer 18h" lands on Madrid's 18:00 even
 * on the UTC host. Returns null when no when-clause was found.
 */
export function quickEntryTs(text: string, nowMs: number = Date.now(), timeZone?: string): { ts: string; title: string } | null {
  const parsed = parseQuickEntry(text, nowMs, timeZone);
  if (!parsed.when) return null;
  const hour = parsed.when.hour ?? 12;
  const minute = parsed.when.minute ?? 0;
  const ts = timeZone
    ? zonedTimeToUtc(dayTupleInZone(parsed.when.date, timeZone), hour, minute, timeZone).toISOString()
    : new Date(
        parsed.when.date.getFullYear(),
        parsed.when.date.getMonth(),
        parsed.when.date.getDate(),
        hour,
        minute,
      ).toISOString();
  return { ts, title: parsed.title };
}

const CATEGORY_KEYWORDS: { category: string; words: string[] }[] = [
  { category: "Ocio", words: ["cine", "pelicula", "peli", "netflix", "serie", "series", "teatro", "concierto", "museo", "videojuego", "partido"] },
  { category: "Deporte", words: ["gym", "gimnasio", "entreno", "entrenar", "correr", "running", "padel", "futbol", "futbolin", "natacion", "nadando", "basket", "escalada", "ciclismo", "ruta", "senderismo"] },
  { category: "Comida", words: ["comer", "cena", "cenar", "desayuno", "comida", "restaurante", "tapeo", "tapas", "caña", "canas", "vermut", "brunch", "cafe", "coffee"] },
  { category: "Trabajo", words: ["trabajo", "reunion", "oficina", "deploy", "codigo", "curro", "cliente", "llamada", "standup", "bug", "incidencia"] },
  { category: "Social", words: ["amigos", "quedada", "party", "fiesta", "cumple", "cumpleaños", "agarrao", "borrachera", "copeo"] },
  { category: "Salud", words: ["medico", "dentista", "fisio", "farmacia", "analitica", "cita sanitaria", "psicologo"] },
  { category: "Compras", words: ["compras", "comprar", "mercadona", "amazon", "tienda", "centro comercial", "wallapop"] },
  { category: "Viaje", words: ["viaje", "tren", "vuelo", "aeropuerto", "ave", "carretera", "roadtrip", "hotel"] },
  { category: "Descanso", words: ["dormir", "siesta", "sueno", "descansar", "cama"] },
  { category: "Estudio", words: ["estudiar", "estudio", "clase", "curso", "leer", "lectura", "libro", "aprender"] },
  { category: "Casa", words: ["casa", "limpieza", "ordenar", "cocinar", "lavadora", "bricolaje", "jardin"] },
];

/** Seed category from the title's keywords; learned history refines it. */
export function guessCategory(title: string): string | null {
  const normalized = normalizeText(title);
  if (!normalized) return null;
  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.some((word) => normalized.includes(word))) return category;
  }
  return null;
}

export interface CategoryCount {
  name: string;
  count: number;
}

export interface BandStat {
  band: HourBandMeta;
  count: number;
  days: number;
  topCategories: CategoryCount[];
}

export interface RetroPatterns {
  total: number;
  histogram: number[];
  peakHour: number | null;
  bands: BandStat[];
  categories: CategoryCount[];
  patterns: string[];
}

function retroTime(event: RetroEvent): number | null {
  const time = Date.parse(event.ts);
  return Number.isFinite(time) ? time : null;
}

/**
 * Aggregate the manual ledger into hour bands, a 24-slot histogram and
 * human-readable patterns ("Por la noche suele haber Ocio…"). The more the
 * ledger grows, the better the next entry's suggestions get.
 */
export function computePatterns(events: RetroEvent[]): RetroPatterns {
  const histogram = new Array<number>(24).fill(0);
  const bandStats = new Map<HourBandId, { count: number; days: Set<string>; categories: Map<string, number> }>();
  for (const band of HOUR_BANDS) bandStats.set(band.id, { count: 0, days: new Set(), categories: new Map() });
  const categories = new Map<string, number>();

  let total = 0;
  for (const event of events) {
    const time = retroTime(event);
    if (time === null) continue;
    const date = new Date(time);
    const hour = date.getHours();
    histogram[hour] += 1;
    total += 1;
    const band = hourBand(hour);
    const stat = bandStats.get(band.id);
    if (stat) {
      stat.count += 1;
      stat.days.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);
      if (event.category) stat.categories.set(event.category, (stat.categories.get(event.category) ?? 0) + 1);
    }
    if (event.category) categories.set(event.category, (categories.get(event.category) ?? 0) + 1);
  }

  const bands: BandStat[] = HOUR_BANDS.map((band) => {
    const stat = bandStats.get(band.id) ?? { count: 0, days: new Set<string>(), categories: new Map() };
    return {
      band,
      count: stat.count,
      days: stat.days.size,
      topCategories: [...stat.categories.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5),
    };
  });

  const peakHour = histogram.reduce((best, count, hour) => (count > histogram[best] ? hour : best), 0);
  const categoryList: CategoryCount[] = [...categories.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const patterns: string[] = [];
  if (total >= 3 && histogram[peakHour] >= 2) {
    patterns.push(`⏰ Hora punta: ${String(peakHour).padStart(2, "0")}:00 · ${histogram[peakHour]} eventos`);
  }
  for (const stat of bands) {
    const top = stat.topCategories[0];
    if (top && top.count >= 2 && stat.count >= 3) {
      patterns.push(
        `${stat.band.icon} Por la ${stat.band.label.toLowerCase()} suele haber ${top.name.toLowerCase()} (${top.count} de ${stat.count})`,
      );
    }
  }
  const overall = categoryList[0];
  if (overall && overall.count >= 3) {
    patterns.push(`📌 Lo más frecuente: ${overall.name} (${overall.count} veces)`);
  }

  return {
    total,
    histogram,
    peakHour: total >= 3 ? peakHour : null,
    bands,
    categories: categoryList,
    patterns,
  };
}

export interface HourSuggestions {
  categories: CategoryCount[];
  repeats: { title: string; count: number; ts: string }[];
}

/**
 * What usually happens around an hour: categories seen at hour-1, hour and
 * hour+1 (weighted 1/3/1), plus the exact-hour titles worth repeating.
 */
export function suggestForHour(events: RetroEvent[], hour: number): HourSuggestions {
  const clamped = ((Math.trunc(hour) % 24) + 24) % 24;
  const scores = new Map<string, number>();
  const repeats = new Map<string, { count: number; ts: string }>();

  for (const event of events) {
    const time = retroTime(event);
    if (time === null) continue;
    const eventHour = new Date(time).getHours();
    const distance = Math.min(Math.abs(eventHour - clamped), Math.abs(eventHour - clamped + 24), Math.abs(eventHour - clamped - 24));
    if (distance > 1) continue;
    const weight = distance === 0 ? 3 : 1;
    if (event.category) scores.set(event.category, (scores.get(event.category) ?? 0) + weight);
    if (eventHour === clamped) {
      const key = normalizeText(event.title).slice(0, 60);
      const existing = repeats.get(key);
      if (existing) {
        existing.count += 1;
        if (time > Date.parse(existing.ts)) existing.ts = event.ts;
      } else {
        repeats.set(key, { count: 1, ts: event.ts });
      }
    }
  }

  return {
    categories: [...scores.entries()]
      .map(([name, score]) => ({ name, count: score }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 4),
    repeats: [...repeats.entries()]
      .map(([key, value]) => ({ title: key, count: value.count, ts: value.ts }))
      .filter((item) => item.title)
      .sort((a, b) => b.count - a.count || Date.parse(b.ts) - Date.parse(a.ts))
      .slice(0, 3),
  };
}

/** One ledger JSONL row → RetroEvent; null for anything invalid. */
export function parseRetroLine(line: string): RetroEvent | null {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(entry)) return null;
  const id = str(entry.id);
  const ts = str(entry.ts);
  const title = str(entry.title).trim();
  if (!id || !validIso(ts) || !title) return null;

  const event: RetroEvent = {
    id: id.slice(0, 64),
    ts,
    title: title.slice(0, 160),
    createdAt: validIso(str(entry.createdAt)) ? str(entry.createdAt) : ts,
  };
  const endTs = str(entry.endTs);
  if (validIso(endTs) && Date.parse(endTs) > Date.parse(ts)) event.endTs = endTs;
  const category = str(entry.category).trim();
  if (category) event.category = category.slice(0, 40);
  const detail = str(entry.detail).trim();
  if (detail) event.detail = detail.slice(0, 300);
  return event;
}

/** RetroEvent → one ledger JSONL row (stable field order, no extras). */
export function serializeRetroEvent(event: RetroEvent): string {
  const row: Record<string, string> = { id: event.id, ts: event.ts };
  if (event.endTs) row.endTs = event.endTs;
  row.title = event.title;
  if (event.category) row.category = event.category;
  if (event.detail) row.detail = event.detail;
  row.createdAt = event.createdAt;
  return JSON.stringify(row);
}

/** A ledger event as the merged timeline's "manual" kind. */
export function toTimelineEvent(retro: RetroEvent): TimelineEvent {
  return {
    id: retro.id,
    kind: "manual",
    title: retro.title,
    detail: retro.detail,
    ts: retro.ts,
    endTs: retro.endTs,
    category: retro.category,
    status: "retro",
  };
}
