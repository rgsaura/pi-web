import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePatterns,
  guessCategory,
  hourBand,
  HOUR_BANDS,
  parseQuickEntry,
  parseRetroLine,
  quickEntryTs,
  serializeRetroEvent,
  suggestForHour,
  toTimelineEvent,
} from "./timeline-retro.ts";

// Lunes 19 oct 2026, 12:00 locales (mismo convenio que timeline-data.test)
const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime();

function iso(y, m, d, h = 0, min = 0) {
  return new Date(y, m - 1, d, h, min).toISOString();
}

test("hourBand: franjas correctas y clamp", () => {
  assert.equal(hourBand(0).id, "madrugada");
  assert.equal(hourBand(5).id, "madrugada");
  assert.equal(hourBand(6).id, "manana");
  assert.equal(hourBand(11).id, "manana");
  assert.equal(hourBand(12).id, "mediodia");
  assert.equal(hourBand(15).id, "mediodia");
  assert.equal(hourBand(16).id, "tarde");
  assert.equal(hourBand(19).id, "tarde");
  assert.equal(hourBand(20).id, "noche");
  assert.equal(hourBand(23).id, "noche");
  assert.equal(hourBand(24).id, "madrugada"); // clamp modular
  assert.equal(HOUR_BANDS.length, 5);
});

test("parseQuickEntry: ayer/hoy con hora y separadores", () => {
  const cases = [
    ["ayer 18h cine con Agus", 18, 18, 0, "cine con Agus"],
    ["ayer a las 18:30 cine", 18, 18, 30, "cine"],
    ["hoy 9 gym", 19, 9, 0, "gym"],
    ["ayer 20:15 cena con Bere", 18, 20, 15, "cena con Bere"],
    ["el lunes 17h padel", 12, 17, 0, "padel"],
  ];
  for (const [text, day, hour, minute, title] of cases) {
    const parsed = parseQuickEntry(text, NOW);
    assert.ok(parsed.when, `${text} debería tener when`);
    assert.equal(parsed.when.date.getDate(), day, `${text} día`);
    assert.equal(parsed.when.hour, hour, `${text} hora`);
    assert.equal(parsed.when.minute, minute, `${text} minuto`);
    assert.equal(parsed.title, title, `${text} título`);
  }
});

test("parseQuickEntry: anteayer, ISO y numérico d/m", () => {
  const anteayer = parseQuickEntry("anteayer 22h fiesta", NOW);
  assert.equal(anteayer.when?.date.getDate(), 17);
  const antes = parseQuickEntry("antes de ayer 10 compras", NOW);
  assert.equal(antes.when?.date.getDate(), 17);
  assert.equal(antes.when?.hour, 10);

  const numeric = parseQuickEntry("20/10 19:30 cena", NOW);
  assert.equal(numeric.when?.date.getMonth(), 9);
  assert.equal(numeric.when?.date.getDate(), 20);
  assert.equal(numeric.when?.hour, 19);
  assert.equal(numeric.when?.minute, 30);

  const iso = parseQuickEntry("2026-10-05 8h deploy", NOW);
  assert.equal(iso.when?.date.getDate(), 5);
  assert.equal(iso.when?.hour, 8);

  // d/m futuro lejano → año anterior (heurística retroactiva)
  const stepped = parseQuickEntry("20/12 12h viaje", NOW);
  assert.equal(stepped.when?.date.getFullYear(), 2025);
});

test("quickEntryTs: zona Madrid en host UTC (CEST +2)", () => {
  // 19 oct 2026 18:38 UTC = 20:38 Madrid: "ayer 18h" → 18 oct 18:00 Madrid = 16:00Z
  const nowUtc = Date.UTC(2026, 9, 19, 18, 38);
  const resolved = quickEntryTs("ayer 18h cine", nowUtc, "Europe/Madrid");
  assert.equal(resolved?.ts, "2026-10-18T16:00:00.000Z");
  assert.equal(resolved?.title, "cine");
  // Sin zona: resolución local del proceso (UTC en CI) → 18:00Z
  const local = quickEntryTs("ayer 18h cine", nowUtc);
  assert.equal(local?.ts, "2026-10-18T18:00:00.000Z");
  // Invierno (CET +1): 15 ene 2026 → "ayer 20h" → 19:00Z
  const winter = quickEntryTs("ayer 20h cena", Date.UTC(2026, 0, 15, 12), "Europe/Madrid");
  assert.equal(winter?.ts, "2026-01-14T19:00:00.000Z");
  // Sin cláusula temporal → null
  assert.equal(quickEntryTs("paseo", nowUtc, "Europe/Madrid"), null);
});

test("parseQuickEntry: weekday estrictamente pasado", () => {
  // NOW es lunes 19; "lunes" resuelve al lunes anterior (12), "domingo" al 18
  const lunes = parseQuickEntry("lunes 17h padel", NOW);
  assert.equal(lunes.when?.date.getDate(), 12);
  const domingo = parseQuickEntry("domingo 11h ruta", NOW);
  assert.equal(domingo.when?.date.getDate(), 18);
  const sabado = parseQuickEntry("sábado 10h gym", NOW);
  assert.equal(sabado.when?.date.getDate(), 17);
});

test("parseQuickEntry: hora explícita sin fecha → hoy, o ayer si aún no llegó", () => {
  const morning = parseQuickEntry("café con cliente a las 9", NOW);
  assert.equal(morning.when?.date.getDate(), 19); // 9:00 ya pasó hoy (12:00)
  assert.equal(morning.when?.hour, 9);
  assert.equal(morning.title, "café con cliente");

  const evening = parseQuickEntry("cine a las 22", NOW);
  assert.equal(evening.when?.date.getDate(), 18); // 22:00 no llegó → ayer
  assert.equal(evening.when?.hour, 22);
});

test("parseQuickEntry: sin cuándo → sólo título", () => {
  const parsed = parseQuickEntry("paseo por el retiro", NOW);
  assert.equal(parsed.when, null);
  assert.equal(parsed.title, "paseo por el retiro");
  assert.deepEqual(parseQuickEntry("", NOW), { title: "", when: null });
});

test("parseQuickEntry: horas imposibles no cuentan como when", () => {
  const parsed = parseQuickEntry("ayer 25 grados hacía", NOW);
  assert.equal(parsed.when?.date.getDate(), 18);
  assert.equal(parsed.when?.hour, null);
});

test("parseQuickEntry: mañana/pasado mañana resuelven futuro", () => {
  const manana = parseQuickEntry("mañana 9h dentista", NOW);
  assert.equal(manana.when?.date.getDate(), 20);
  const pasado = parseQuickEntry("pasado mañana 18h cena", NOW);
  assert.equal(pasado.when?.date.getDate(), 21);
});

test("guessCategory: palabras clave con y sin acentos", () => {
  assert.equal(guessCategory("Cine con Agus"), "Ocio");
  assert.equal(guessCategory("gimnasio piernas"), "Deporte");
  assert.equal(guessCategory("cena japonesa"), "Comida");
  assert.equal(guessCategory("deploy de producción"), "Trabajo");
  assert.equal(guessCategory("Padel con Stef"), "Deporte"); // sin acento
  assert.equal(guessCategory("reunión Deloitte"), "Trabajo");
  assert.equal(guessCategory("cosas varias"), null);
});

function retro(id, ts, category, title = "evento") {
  return { id, ts, title, category, createdAt: ts };
}

test("computePatterns: histograma, bandas, categorías y frases", () => {
  const events = [
    retro("a", iso(2026, 10, 17, 18), "Ocio", "cine"),
    retro("b", iso(2026, 10, 16, 18), "Ocio", "serie"),
    retro("c", iso(2026, 10, 16, 20), "Ocio", "documental"),
    retro("d", iso(2026, 10, 15, 8), "Deporte", "gym"),
    retro("e", iso(2026, 10, 15, 9), "Deporte", "running"),
    retro("f", iso(2026, 10, 14, 22), "Social", "cumple"),
    retro("h", iso(2026, 10, 14, 23), "Ocio", "serie"),
    retro("g", iso(2026, 10, 15, 10), "Estudio", "leer"),
  ];
  const patterns = computePatterns(events);
  assert.equal(patterns.total, 8);
  assert.equal(patterns.histogram[18], 2);
  assert.equal(patterns.histogram[8], 1);
  assert.equal(patterns.peakHour, 18);
  const noche = patterns.bands.find((b) => b.band.id === "noche");
  assert.equal(noche?.count, 3);
  assert.equal(noche?.topCategories[0]?.name, "Ocio");
  const manana = patterns.bands.find((b) => b.band.id === "manana");
  assert.equal(manana?.count, 3);
  assert.equal(manana?.topCategories[0]?.name, "Deporte");
  assert.equal(manana?.days, 1);
  assert.ok(patterns.categories.length >= 3);
  assert.ok(patterns.patterns.some((phrase) => phrase.includes("18:00")));
  assert.ok(patterns.patterns.some((phrase) => phrase.toLowerCase().includes("noche")));
  assert.ok(patterns.patterns.some((phrase) => phrase.toLowerCase().includes("deporte")));
  // Eventos con ts corrupto no cuentan
  assert.equal(computePatterns([{ ...retro("x", "no-fecha", "Ocio") }]).total, 0);
});

test("computePatterns: sin datos no inventa picos ni frases", () => {
  const patterns = computePatterns([]);
  assert.equal(patterns.total, 0);
  assert.equal(patterns.peakHour, null);
  assert.deepEqual(patterns.patterns, []);
});

test("suggestForHour: peso 3/1 para hora exacta/adyacente y repeticiones", () => {
  const events = [
    retro("a", iso(2026, 10, 18, 18), "Ocio", "cine"),
    retro("b", iso(2026, 10, 17, 18), "Ocio", "cine"),
    retro("c", iso(2026, 10, 16, 18), "Ocio", "cine"),
    retro("d", iso(2026, 10, 16, 19), "Comida", "cena"),
    retro("e", iso(2026, 10, 15, 8), "Deporte", "gym"), // lejos de 18
  ];
  const suggestions = suggestForHour(events, 18);
  assert.equal(suggestions.categories[0]?.name, "Ocio");
  // Ocio = 3×3 exactas; Comida = 1 adyacente → Ocio gana y Deporte queda fuera
  assert.ok(!suggestions.categories.some((c) => c.name === "Deporte"));
  const repeat = suggestions.repeats.find((r) => r.title.includes("cine"));
  assert.equal(repeat?.count, 3);
  // 5:00 (madrugada) no arrastra el gym de las 8:00
  assert.deepEqual(suggestForHour(events, 5).categories.map((c) => c.name), []);
});

test("parseRetroLine/serializeRetroEvent: roundtrip y tolerancia a basura", () => {
  const event = {
    id: "retro-abc",
    ts: iso(2026, 10, 18, 18),
    endTs: iso(2026, 10, 18, 20),
    title: "cine",
    category: "Ocio",
    detail: "con Agus",
    createdAt: iso(2026, 10, 19, 12),
  };
  const line = serializeRetroEvent(event);
  assert.deepEqual(parseRetroLine(line), event);

  assert.equal(parseRetroLine("no json"), null);
  assert.equal(parseRetroLine("null"), null);
  assert.equal(parseRetroLine(JSON.stringify({ id: "x", ts: "malo", title: "t" })), null);
  assert.equal(parseRetroLine(JSON.stringify({ id: "x", ts: iso(2026, 10, 18), title: "" })), null);
  // endTs anterior a ts se descarta; campos extra se ignoran
  const tolerant = parseRetroLine(
    JSON.stringify({ id: "x", ts: iso(2026, 10, 18, 18), title: "t", endTs: iso(2026, 10, 18, 17), extra: 1 }),
  );
  assert.equal(tolerant?.endTs, undefined);
  // createdAt inválido cae al ts
  assert.equal(parseRetroLine(JSON.stringify({ id: "x", ts: iso(2026, 10, 18), title: "t" }))?.createdAt, iso(2026, 10, 18));
});

test("toTimelineEvent: mapa al kind manual con estado retro", () => {
  const event = toTimelineEvent(retro("retro-1", iso(2026, 10, 18, 18), "Ocio", "cine"));
  assert.equal(event.kind, "manual");
  assert.equal(event.id, "retro-1");
  assert.equal(event.status, "retro");
  assert.equal(event.category, "Ocio");
});
