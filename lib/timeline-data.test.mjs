import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCalendarText,
  mapEncargos,
  mapFailureLines,
  mapProposals,
  parseFailureLine,
  splitTimeline,
  formatDayLabel,
  dayKey,
} from "./timeline-data.ts";

const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime(); // 19 oct 2026, lunes

test("parseCalendarText: línea con hora y categoría", () => {
  const events = parseCalendarText("Mon Oct 20 12:00 [Deloitte] Documentos\n");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "calendario");
  assert.equal(events[0].title, "Documentos");
  assert.equal(events[0].category, "Deloitte");
  assert.equal(events[0].ts, new Date(2026, 9, 20, 12, 0).toISOString());
  assert.equal(events[0].status, undefined);
});

test("parseCalendarText: 00:00 es todo el día; ruido se ignora", () => {
  const events = parseCalendarText("Wed Oct 21 00:00 [Personal] 🎬 Cine\nSin próxima ejecución\n\nTue Oct 20 00:00 Fiesta del Cine");
  assert.equal(events.length, 2);
  assert.equal(events[0].status, "Todo el día");
  assert.equal(events[1].category, undefined);
  assert.equal(events[1].title, "Fiesta del Cine");
});

test("mapEncargos: creado siempre, completado solo con status done", () => {
  const ledger = {
    encargos: {
      "enc-1": {
        titulo: "Uno",
        descripcion: "desc uno",
        categoria: "ui",
        status: "done",
        creado: "2026-10-18T10:00:00.000Z",
        resuelto: "2026-10-18T11:00:00.000Z",
        session_id: "sess-1",
      },
      "enc-2": { titulo: "Dos", status: "pending", creado: "2026-10-19T09:00:00.000Z", resuelto: "no-fecha" },
    },
  };
  const events = mapEncargos(ledger);
  assert.equal(events.length, 3);
  const completado = events.find((e) => e.status === "completado");
  assert.equal(completado?.id, "enc-1-completado");
  assert.equal(completado?.sessionId, "sess-1");
  // El pendiente no genera evento de completado aunque tenga campo resuelto.
  assert.ok(!events.some((e) => e.id === "enc-2-completado"));
  // Ledger corrupto no explota.
  assert.deepEqual(mapEncargos(null), []);
});

test("mapProposals: creada, decidida y caduca solo si es futura", () => {
  const ledger = {
    version: 1,
    proposals: {
      "prop-1": {
        title: "Plan",
        summary: "resumen",
        category: "ocio",
        status: "resolved",
        created_at: "2026-10-17T08:00:00.000Z",
        resolution: { resolved_at: "2026-10-17T09:00:00.000Z" },
        expires_at: "2026-10-25T00:00:00.000Z",
      },
      "prop-2": { title: "Vieja", created_at: "2026-10-10T08:00:00.000Z", expires_at: "2026-10-11T00:00:00.000Z" },
    },
  };
  const events = mapProposals(ledger, NOW);
  const ids = events.map((e) => e.id).sort();
  assert.deepEqual(ids, ["prop-1-caduca", "prop-1-decidida", "prop-1-propuesta", "prop-2-propuesta"]);
  const caduca = events.find((e) => e.id === "prop-1-caduca");
  assert.equal(caduca?.kind, "decision");
  assert.match(caduca?.title ?? "", /caduca/);
});

test("parseFailureLine: entrada válida, JSON roto y sin ts", () => {
  const ok = parseFailureLine('{"ts":"2026-10-19T07:23:21.574Z","kind":"pi-empty","detail":"sin salida","fix":"reanudar"}');
  assert.equal(ok?.kind, "fallo");
  assert.equal(ok?.title, "pi-empty: sin salida");
  assert.equal(ok?.detail, "reanudar");
  assert.equal(parseFailureLine("no json"), null);
  assert.equal(parseFailureLine('{"kind":"x"}'), null);
});

test("mapFailureLines: kinds benignos fuera, ráfagas colapsadas (enc-2c9ac33b)", () => {
  const burst = Array.from({ length: 42 }, (_, i) =>
    JSON.stringify({ ts: new Date(2026, 9, 21, 22, 22, 17 * i).toISOString(), kind: "tg-api", detail: "Bad Gateway", fix: "reintento 2s" }));
  const benign = [
    JSON.stringify({ ts: "2026-10-21T22:40:00.000Z", kind: "session-rotate", detail: "autochequeo", fix: "contexto reiniciado" }),
    JSON.stringify({ ts: "2026-10-21T22:41:00.000Z", kind: "recovered", detail: "timeout", fix: "entregado" }),
    JSON.stringify({ ts: "2026-10-21T22:42:00.000Z", kind: "lesson", detail: "nota", fix: "n/a" }),
  ];
  const one = [JSON.stringify({ ts: "2026-10-21T23:05:00.000Z", kind: "pi-timeout", detail: ">180s", fix: "reanudación" })];
  const events = mapFailureLines([...burst, ...benign, ...one, "basura"]);
  assert.equal(events.length, 2); // ráfaga colapsada + el pi-timeout suelto
  const [rafaga, suelto] = events;
  assert.match(rafaga.title, /tg-api: Bad Gateway ×42 \(12 min\)/);
  assert.equal(rafaga.ts, burst[0] && JSON.parse(burst[0]).ts); // al inicio de la ráfaga
  assert.match(rafaga.detail ?? "", /reintentos del mismo incidente/);
  assert.equal(suelto.title, "pi-timeout: >180s");
  assert.equal(suelto.detail, "reanudación");
  // Ningún evento benigno pasa el filtro.
  assert.ok(!events.some((e) => /session-rotate|recovered|lesson/.test(e.title)));
});

test("mapFailureLines: kinds distintos alternados no se fusionan", () => {
  const lines = [
    JSON.stringify({ ts: "2026-10-21T22:35:00.000Z", kind: "poll-loop", detail: "ETIMEDOUT", fix: "reintento 1s" }),
    JSON.stringify({ ts: "2026-10-21T22:35:20.000Z", kind: "audio-intake", detail: "Timeout Telegram", fix: "reintento" }),
    JSON.stringify({ ts: "2026-10-21T22:35:40.000Z", kind: "poll-loop", detail: "ETIMEDOUT", fix: "reintento 1s" }),
  ];
  const events = mapFailureLines(lines);
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => !/×\d+/.test(e.title)));
});

test("mapFailureLines: misma clase tras >15 min abre ráfaga nueva", () => {
  const lines = [
    JSON.stringify({ ts: "2026-10-21T10:00:00.000Z", kind: "tg-api", detail: "Bad Gateway", fix: "r" }),
    JSON.stringify({ ts: "2026-10-21T10:14:00.000Z", kind: "tg-api", detail: "Bad Gateway", fix: "r" }),
    JSON.stringify({ ts: "2026-10-21T11:00:00.000Z", kind: "tg-api", detail: "Bad Gateway", fix: "r" }),
  ];
  const events = mapFailureLines(lines);
  assert.equal(events.length, 2);
  assert.match(events[0].title, /×2/);
  assert.equal(events[1].title, "tg-api: Bad Gateway");
});

test("splitTimeline: hoy queda aparte, pasado desc y futuro asc", () => {
  const events = [
    { id: "a", kind: "encargo", title: "Ayer tarde", ts: "2026-10-18T20:00:00.000Z" },
    { id: "b", kind: "encargo", title: "Ayer mañana", ts: "2026-10-18T06:00:00.000Z" },
    { id: "c", kind: "sesion", title: "Ayer tarde", ts: "2026-10-18T22:00:00.000Z" },
    { id: "d", kind: "calendario", title: "Hoy", ts: "2026-10-19T09:30:00.000Z" },
    { id: "e", kind: "calendario", title: "Hoy temprano", ts: "2026-10-19T07:00:00.000Z" },
    { id: "f", kind: "rutina", title: "Mañana lejano", ts: "2026-10-22T08:00:00.000Z" },
    { id: "g", kind: "rutina", title: "Mañana cercano", ts: "2026-10-20T08:00:00.000Z" },
    { id: "x", kind: "fallo", title: "Sin fecha", ts: "no-validez" },
  ];
  const split = splitTimeline(events, NOW);
  assert.deepEqual(split.past.map((e) => e.id), ["c", "a", "b"]);
  assert.deepEqual(split.today.map((e) => e.id), ["e", "d"]);
  assert.deepEqual(split.future.map((e) => e.id), ["g", "f"]);
});

test("formatDayLabel: hoy, ayer y fecha corta es-ES", () => {
  const now = new Date(2026, 9, 19, 15, 0).getTime();
  assert.equal(formatDayLabel(dayKey(new Date(now)), now), "Hoy");
  assert.equal(formatDayLabel(dayKey(new Date(2026, 9, 18)), now), "Ayer");
  assert.equal(formatDayLabel(dayKey(new Date(2026, 9, 21)), now), "mié 21 oct");
  assert.equal(formatDayLabel("clave-invalida", now), "clave-invalida");
});
