import { NextResponse } from "next/server";
import { quickEntryTs } from "@/lib/timeline-retro";
import {
  appendRetroEvent,
  deleteRetroEvent,
  readRetroEvents,
} from "@/lib/timeline-retro-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET: the manual retroactive ledger (newest first). */
export async function GET() {
  try {
    const events = readRetroEvents();
    return NextResponse.json({ capturedAt: new Date().toISOString(), events }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Retro ledger unavailable" }, { status: 502, headers: NO_STORE });
  }
}

/** Madrid is this system's home zone: the API's quick-entry fallback
 *  parses day words there even though the host runs in UTC. */
const HOME_TIME_ZONE = "Europe/Madrid";

/**
 * POST: add one past event. Either an explicit { title, ts } (the form's
 * authoritative fields) or a free { text } quick entry parsed here with the
 * same pure parser the client previews with.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Cuerpo no válido" }, { status: 400, headers: NO_STORE });
  }
  const input = body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

  let title = typeof input.title === "string" ? input.title : "";
  let ts = typeof input.ts === "string" ? input.ts : "";

  if (!ts && typeof input.text === "string") {
    const resolved = quickEntryTs(input.text, Date.now(), HOME_TIME_ZONE);
    if (resolved) {
      ts = resolved.ts;
      if (!title) title = resolved.title;
    } else if (!title) {
      // A title-only text still names the event; the missing part is the when.
      title = input.text.trim().slice(0, 160);
    }
  }

  if (!title.trim()) {
    return NextResponse.json({ ok: false, error: "Falta el título del evento" }, { status: 400, headers: NO_STORE });
  }
  if (!ts) {
    return NextResponse.json(
      { ok: false, error: "Falta cuándo pasó: p. ej. «ayer 18h …»" },
      { status: 400, headers: NO_STORE },
    );
  }

  const result = await appendRetroEvent({
    title,
    ts,
    endTs: typeof input.endTs === "string" ? input.endTs : undefined,
    category: typeof input.category === "string" ? input.category : undefined,
    detail: typeof input.detail === "string" ? input.detail : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, event: result.event }, { headers: NO_STORE });
}

/** DELETE ?id=: remove one manually logged event. */
export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const removed = await deleteRetroEvent(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Evento no encontrado" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
