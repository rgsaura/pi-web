/**
 * Server-only store for the retroactive timeline: an append-only JSONL
 * ledger of manually logged past events (~/.local/state/timeline/
 * retro-events.jsonl, TIMELINE_RETRO_LEDGER overrides it for tests).
 * Writes run under a per-path promise chain; the delete rewrites the file
 * atomically. Rows are validated by the pure parser in timeline-retro.ts.
 */

import { randomUUID } from "crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { serializeByKey } from "./key-serializer";
import { writePrivateFileAtomicSync } from "./atomic-file";
import {
  parseRetroLine,
  serializeRetroEvent,
  type RetroEvent,
} from "./timeline-retro";

const WRITE_LOCK = Symbol.for("exohuman.timeline-retro.write");
const MAX_EVENTS = 5_000;
const MIN_AGE_MS = 400 * 24 * 3600 * 1000; // ~13 months back
const FUTURE_TOLERANCE_MS = 2 * 3600 * 1000; // "just happened" edge

export function retroLedgerPath(): string {
  const override = process.env.TIMELINE_RETRO_LEDGER;
  if (override && override.startsWith("/")) return override;
  return join(homedir(), ".local/state/timeline/retro-events.jsonl");
}

/** Every valid ledger row, newest first (corrupt lines are skipped). */
export function readRetroEvents(): RetroEvent[] {
  let text: string;
  try {
    text = readFileSync(retroLedgerPath(), "utf8");
  } catch {
    return [];
  }
  const events: RetroEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const event = parseRetroLine(trimmed);
    if (event) events.push(event);
  }
  events.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  return events.slice(0, MAX_EVENTS);
}

export type RetroAppendInput = {
  title: string;
  ts: string;
  endTs?: string;
  category?: string;
  detail?: string;
};

export type RetroAppendResult =
  | { ok: true; event: RetroEvent }
  | { ok: false; error: string };

/** Append one validated past event to the ledger. */
export async function appendRetroEvent(input: RetroAppendInput): Promise<RetroAppendResult> {
  const title = String(input.title ?? "").trim().slice(0, 160);
  if (!title) return { ok: false, error: "Falta el título del evento" };

  const ts = String(input.ts ?? "");
  const tsTime = Date.parse(ts);
  if (!Number.isFinite(tsTime)) return { ok: false, error: "Fecha no válida" };
  const now = Date.now();
  if (tsTime > now + FUTURE_TOLERANCE_MS) {
    return { ok: false, error: "La timeline retroactiva es para cosas del pasado" };
  }
  if (tsTime < now - MIN_AGE_MS) return { ok: false, error: "Demasiado antiguo (máx. ~13 meses)" };

  const event: RetroEvent = {
    id: `retro-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
    ts: new Date(tsTime).toISOString(),
    title,
    createdAt: new Date(now).toISOString(),
  };

  const endTs = String(input.endTs ?? "");
  const endTime = Date.parse(endTs);
  if (endTs && Number.isFinite(endTime) && endTime > tsTime) {
    event.endTs = new Date(endTime).toISOString();
  }

  const category = String(input.category ?? "").trim().slice(0, 40);
  if (category) event.category = category;
  const detail = String(input.detail ?? "").trim().slice(0, 300);
  if (detail) event.detail = detail;

  await serializeByKey(WRITE_LOCK, retroLedgerPath(), async () => {
    const path = retroLedgerPath();
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${serializeRetroEvent(event)}\n`, "utf8");
  });
  return { ok: true, event };
}

/** Remove one event by id (atomic rewrite); false when it was not there. */
export async function deleteRetroEvent(id: string): Promise<boolean> {
  const target = String(id ?? "").trim();
  if (!target || !/^retro-[a-z0-9-]{1,64}$/i.test(target)) return false;
  return serializeByKey(WRITE_LOCK, retroLedgerPath(), async () => {
    const path = retroLedgerPath();
    if (!existsSync(path)) return false;
    const events = readRetroEvents();
    const kept = events.filter((event) => event.id !== target);
    if (kept.length === events.length) return false;
    const body = kept
      .slice()
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .map((event) => serializeRetroEvent(event))
      .join("\n");
    mkdirSync(dirname(path), { recursive: true });
    writePrivateFileAtomicSync(path, body ? `${body}\n` : "");
    return true;
  });
}
