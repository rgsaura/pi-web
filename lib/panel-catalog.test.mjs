import assert from "node:assert/strict";
import { test } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  NATIVE_PANELS,
  catalogPanelFromMeta,
  effectivePanelVisibility,
  filterCatalogPanelsByText,
  formatPanelExpiry,
  isPanelVisibility,
  mergeCatalogPanels,
  moveKey,
  nativePanelState,
  normalizePanelExpiry,
  normalizePanelVisibility,
  orderPinnedPanels,
  panelExpiryCountdown,
  panelExpiryInDays,
  panelExpiryState,
} = await jiti.import("./panel-catalog.ts");

/** 2026-10-21, 10:30 local — the fixed `now` of the date-sensitive tests. */
const NOW = new Date(2026, 9, 21, 10, 30).getTime();
const DAY = 86_400_000;

function meta(overrides = {}) {
  return {
    slug: "2026-10-16-surf-platano",
    titulo: "Surf Plátano",
    tipo: "base",
    fecha: "2026-10-16",
    resumen: "Imagen generada",
    estado: "activo",
    origen: "sesión",
    expira: null,
    sessions: [],
    mtime: "",
    ...overrides,
  };
}

test("normalizePanelVisibility: sólo fijado/archivado explícitos; activo y basura caen a demanda", () => {
  assert.equal(normalizePanelVisibility("fijado"), "fijado");
  assert.equal(normalizePanelVisibility("archivado"), "archivado");
  assert.equal(normalizePanelVisibility("activo"), "demanda");
  assert.equal(normalizePanelVisibility("demanda"), "demanda");
  assert.equal(normalizePanelVisibility(""), "demanda");
  assert.equal(normalizePanelVisibility(null), "demanda");
  assert.equal(normalizePanelVisibility(42), "demanda");
});

test("isPanelVisibility: los tres estados y nada más", () => {
  for (const value of ["fijado", "demanda", "archivado"]) assert.equal(isPanelVisibility(value), true);
  assert.equal(isPanelVisibility("activo"), false);
  assert.equal(isPanelVisibility("ACTIVO"), false);
});

test("normalizePanelExpiry: YYYY-MM-DD real; todo lo demás null", () => {
  assert.equal(normalizePanelExpiry("2026-12-01"), "2026-12-01");
  assert.equal(normalizePanelExpiry("2026-02-30"), null, "30 de febrero no existe");
  assert.equal(normalizePanelExpiry("2026-13-01"), null);
  assert.equal(normalizePanelExpiry("2026-12-1"), null);
  assert.equal(normalizePanelExpiry("hoy"), null);
  assert.equal(normalizePanelExpiry(null), null);
});

test("panelExpiryState: días de calendario hasta la fecha, con hoy y pasado", () => {
  const sameDay = panelExpiryState("2026-10-21", NOW);
  assert.equal(sameDay.daysLeft, 0);
  assert.equal(sameDay.expired, true, "caduca hoy = ya caducado");

  const tomorrow = panelExpiryState("2026-10-22", NOW);
  assert.equal(tomorrow.daysLeft, 1);
  assert.equal(tomorrow.expired, false);

  const past = panelExpiryState("2026-10-18", NOW);
  assert.equal(past.daysLeft, -3);
  assert.equal(past.expired, true);

  // La cuenta es por días de calendario, no por 24h exactas.
  const lateNight = panelExpiryState("2026-10-22", new Date(2026, 9, 21, 23, 50).getTime());
  assert.equal(lateNight.daysLeft, 1);

  assert.equal(panelExpiryState(null, NOW), null);
});

test("effectivePanelVisibility: un fijado caducado cae a demanda marcado caducado", () => {
  assert.deepEqual(effectivePanelVisibility("fijado", "2026-10-25", NOW), { visibility: "fijado", expired: false });
  assert.deepEqual(effectivePanelVisibility("fijado", "2026-10-21", NOW), { visibility: "demanda", expired: true });
  assert.deepEqual(effectivePanelVisibility("demanda", "2026-10-01", NOW), { visibility: "demanda", expired: true });
  assert.deepEqual(effectivePanelVisibility("archivado", null, NOW), { visibility: "archivado", expired: false });
  assert.deepEqual(effectivePanelVisibility("activo", null, NOW), { visibility: "demanda", expired: false });
});

test("panelExpiryInDays: fecha a N días de hoy, formato YYYY-MM-DD", () => {
  assert.equal(panelExpiryInDays(7, NOW), "2026-10-28");
  assert.equal(panelExpiryInDays(1, NOW), "2026-10-22");
  assert.equal(panelExpiryInDays(0, NOW), "2026-10-21");
  // Cruce de mes: 30 días desde 21 oct cae en noviembre.
  assert.equal(panelExpiryInDays(30, NOW), "2026-11-20");
});

test("panelExpiryCountdown: hoy, mañana, días y meses; y los caducados", () => {
  assert.equal(panelExpiryCountdown({ daysLeft: 0, expired: true }), "caducó hoy");
  assert.equal(panelExpiryCountdown({ daysLeft: -2, expired: true }), "caducó hace 2 d");
  assert.equal(panelExpiryCountdown({ daysLeft: 0, expired: false }), "caduca hoy");
  assert.equal(panelExpiryCountdown({ daysLeft: 1, expired: false }), "caduca mañana");
  assert.equal(panelExpiryCountdown({ daysLeft: 9, expired: false }), "9 días");
  assert.equal(panelExpiryCountdown({ daysLeft: 30, expired: false }), "30 días");
  assert.equal(panelExpiryCountdown({ daysLeft: 40, expired: false }), "1 mes");
  assert.equal(panelExpiryCountdown({ daysLeft: 45, expired: false }), "2 meses");
  assert.equal(panelExpiryCountdown({ daysLeft: 60, expired: false }), "2 meses");
});

test("formatPanelExpiry: día y mes cortos; el año sólo si no es el actual", () => {
  assert.ok(formatPanelExpiry("2026-10-28").includes("28"), "incluye el día");
  assert.ok(!formatPanelExpiry("2026-10-28").includes("2026"), "sin año en el año actual");
  assert.ok(formatPanelExpiry("2027-01-15").includes("2027"), "año cuando difiere");
});

test("nativePanelState: defaults del def, guardado válido y basura ignorada", () => {
  const def = NATIVE_PANELS[0];
  assert.equal(def.id, "post-studio");
  assert.deepEqual(nativePanelState(def, undefined), { visibilidad: def.defaultVisibility, expira: null });
  assert.deepEqual(nativePanelState(def, { visibilidad: "fijado", expira: "2026-10-28" }), {
    visibilidad: "fijado",
    expira: "2026-10-28",
  });
  assert.deepEqual(nativePanelState(def, { visibilidad: "x", expira: "2026-02-30" }), {
    visibilidad: "demanda",
    expira: null,
  });
});

test("mergeCatalogPanels: nativos primero, html después; visibilidad efectiva aplicada", () => {
  const merged = mergeCatalogPanels(
    [meta(), meta({ slug: "2026-10-18-mockups", estado: "archivado", tipo: "comparativa" })],
    { "post-studio": { visibilidad: "fijado", expira: "2026-10-25" } },
    NOW,
  );
  assert.equal(merged.length, 3);
  assert.equal(merged[0].kind, "native");
  assert.equal(merged[0].nativeId, "post-studio");
  assert.equal(merged[0].visibility, "fijado");
  assert.equal(merged[0].key, "native:post-studio");
  assert.equal(merged[1].slug, "2026-10-16-surf-platano");
  assert.equal(merged[1].visibility, "demanda", "activo legacy = bajo demanda");
  assert.equal(merged[1].key, "html:2026-10-16-surf-platano");
  assert.equal(merged[2].visibility, "archivado");
});

test("orderPinnedPanels: el orden guardado manda; los nuevos van detrás en orden de catálogo", () => {
  const panels = mergeCatalogPanels(
    [meta(), meta({ slug: "2026-10-17-a" }), meta({ slug: "2026-10-18-b", estado: "archivado" })],
    {},
    NOW,
  ).map((panel) => ({ ...panel, visibility: "fijado" }));
  const ordered = orderPinnedPanels(panels, ["html:2026-10-17-a", "native:post-studio"]);
  assert.deepEqual(
    ordered.map((panel) => panel.key),
    ["html:2026-10-17-a", "native:post-studio", "html:2026-10-16-surf-platano", "html:2026-10-18-b"],
  );
  // Sin orden guardado: el orden relativo del catálogo se conserva (estable).
  const unordered = orderPinnedPanels(panels, []);
  assert.deepEqual(
    unordered.map((panel) => panel.key),
    panels.map((panel) => panel.key),
  );
});

test("moveKey: mueve dentro del array y tolera índices fuera de rango", () => {
  assert.deepEqual(moveKey(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveKey(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveKey(["a", "b"], 0, 0), ["a", "b"]);
  assert.deepEqual(moveKey(["a", "b"], 4, 0), ["a", "b"], "from fuera de rango: sin cambio");
  assert.deepEqual(moveKey(["a", "b"], 0, 9), ["a", "b"], "to fuera de rango: sin cambio");
  assert.deepEqual(moveKey([], 0, 0), []);
});

test("filterCatalogPanelsByText: título, resumen, tipo y slug; vacío lo devuelve todo", () => {
  const panels = mergeCatalogPanels([meta(), meta({ slug: "2026-10-17-x", titulo: "Auditoría", tipo: "informe", resumen: "Estructura del vault" })], {}, NOW);
  assert.equal(filterCatalogPanelsByText(panels, "surf").length, 1);
  assert.equal(filterCatalogPanelsByText(panels, "AUDITORÍA").length, 1, "insensible a mayúsculas");
  assert.equal(filterCatalogPanelsByText(panels, "post studio").length, 1);
  assert.equal(filterCatalogPanelsByText(panels, "imagen generada").length, 1, "busca en el resumen");
  assert.equal(filterCatalogPanelsByText(panels, "base").length, 1, "busca por tipo");
  assert.equal(filterCatalogPanelsByText(panels, "").length, panels.length);
  assert.equal(filterCatalogPanelsByText(panels, "zzz").length, 0);
});

test("catalogPanelFromMeta: caducado señalizado aunque la visibilidad efectiva caiga a demanda", () => {
  const panel = catalogPanelFromMeta(meta({ estado: "fijado", expira: "2026-10-20" }), NOW);
  assert.equal(panel.visibility, "demanda");
  assert.equal(panel.expired, true);
  assert.equal(panel.expira, "2026-10-20", "la fecha se conserva para el watcher");
});

test("NATIVE_PANELS: post-studio bajo demanda por defecto (visible sólo cuando se usa)", () => {
  const post = NATIVE_PANELS.find((panel) => panel.id === "post-studio");
  assert.ok(post, "post-studio registrado");
  assert.equal(post.defaultVisibility, "demanda");
  assert.equal(post.tipo, "studio");
});
