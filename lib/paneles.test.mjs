import assert from "node:assert/strict";
import { test } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  isPanelDirName,
  parsePanelMeta,
  parsePanelSessionIds,
  registeredSessionIds,
  sortPanels,
  isServablePanelSegment,
  panelesRoots,
  resolvePanelDirSync,
  listPanelsSync,
} = await jiti.import("./paneles.ts");

test("isPanelDirName: admite prefijo de 4 dígitos de año y rechaza plantillas e internos", () => {
  assert.equal(isPanelDirName("2026-10-16-surf-platano"), true);
  assert.equal(isPanelDirName("2026-01-01-foo"), true);
  assert.equal(isPanelDirName("_plantillas"), false);
  assert.equal(isPanelDirName(".git"), false);
  assert.equal(isPanelDirName("surf-platano"), false);
});

test("parsePanelMeta: usa los campos de panel.json y aplica fallbacks seguros", () => {
  const meta = parsePanelMeta("2026-10-16-surf-platano", {
    titulo: "Surf Plátano · Rodrigo García",
    tipo: "base",
    fecha: "2026-10-16",
    resumen: "Imagen de Rodrigo surfeando",
    estado: "activo",
  });
  assert.equal(meta.slug, "2026-10-16-surf-platano");
  assert.equal(meta.titulo, "Surf Plátano · Rodrigo García");
  assert.equal(meta.tipo, "base");
  assert.equal(meta.fecha, "2026-10-16");
  assert.equal(meta.resumen, "Imagen de Rodrigo surfeando");
  assert.equal(meta.estado, "activo");
  assert.equal(meta.mtime, "");
  assert.deepEqual(meta.sessions, []);

  // Fallbacks con panel.json vacío o nulo
  const fallback = parsePanelMeta("2026-10-16-sin-meta", null);
  assert.equal(fallback.titulo, "2026-10-16-sin-meta");
  assert.equal(fallback.tipo, "otro");
  assert.equal(fallback.fecha, "2026-10-16");
  assert.equal(fallback.resumen, "");
  assert.equal(fallback.estado, "activo");
  assert.deepEqual(fallback.sessions, []);
});

test("parsePanelMeta: recoge las sesiones registradas en panel.json", () => {
  const meta = parsePanelMeta("2026-10-20-demo", {
    sessions: ["abc-def0123456789", "zzz-9998887776665"],
  });
  assert.deepEqual(meta.sessions, ["abc-def0123456789", "zzz-9998887776665"]);
});

test("parsePanelSessionIds: valida, deduplica y limita como rg-panel", () => {
  assert.deepEqual(parsePanelSessionIds(undefined), []);
  assert.deepEqual(parsePanelSessionIds("no-un-array"), []);
  assert.deepEqual(parsePanelSessionIds([42, null, ""]), []);
  // ids de sesión válidos: 8–64 alfanuméricos/guiones
  assert.deepEqual(parsePanelSessionIds(["aaaaaaaa", "AAAA-9999", "corta", "con espacio", "x".repeat(65), "aaaaaaaa"]), [
    "aaaaaaaa",
    "AAAA-9999",
  ]);
  // tope de 20 como rg-panel link
  const many = Array.from({ length: 25 }, (_, i) => `sid000000000000${String(i).padStart(2, "0")}`);
  assert.equal(parsePanelSessionIds(many).length, 20);
});

test("registeredSessionIds: navega el panel.json completo hasta su sessions (regresión de la ruta)", () => {
  // La ruta /api/paneles/sessions lee el JSON completo del panel.json: el
  // objeto entero NO es un array de ids y debe registrar sus sessions.
  const meta = {
    titulo: "Fixture",
    tipo: "base",
    fecha: "2026-01-02",
    sessions: ["01a1519a-e8b2-75bb-9923-aa84056fa9ab", "zzzz-nonexistent-9999", "01a1519a-e8b2-75bb-9923-aa84056fa9ab"],
  };
  assert.deepEqual(registeredSessionIds(meta), [
    "01a1519a-e8b2-75bb-9923-aa84056fa9ab",
    "zzzz-nonexistent-9999",
  ]);
  assert.deepEqual(registeredSessionIds({ sessions: "no-array" }), []);
  assert.deepEqual(registeredSessionIds(["sid-12345678"]), []);
  assert.deepEqual(registeredSessionIds(null), []);
  assert.deepEqual(registeredSessionIds(JSON.parse("null")), []);
});

test("sortPanels: ordena descendente por fecha y desempata por slug", () => {
  const mk = (slug, fecha) => ({ slug, titulo: slug, tipo: "base", fecha, resumen: "", estado: "activo", mtime: "" });
  const p1 = mk("2026-10-15-a", "2026-10-15");
  const p2 = mk("2026-10-18-b", "2026-10-18");
  const p3 = mk("2026-10-18-c", "2026-10-18");
  const sorted = sortPanels([p1, p2, p3]);
  assert.deepEqual(sorted.map((p) => p.slug), [
    "2026-10-18-c",
    "2026-10-18-b",
    "2026-10-15-a",
  ]);
});

test("isServablePanelSegment: bloquea traversal, dotfiles y plantillas", () => {
  assert.equal(isServablePanelSegment("2026-10-16-surf-platano"), true);
  assert.equal(isServablePanelSegment("index.html"), true);
  assert.equal(isServablePanelSegment("surf.png"), true);
  assert.equal(isServablePanelSegment(".git"), false);
  assert.equal(isServablePanelSegment(".."), false);
  assert.equal(isServablePanelSegment("_plantillas"), false);
  assert.equal(isServablePanelSegment(""), false);
});

test("parsePanelMeta: estado crudo conservado y visibilidad efectiva derivada (catálogo)", () => {
  // El legado "activo" sigue legible tal cual pero ya no ocupa el lateral.
  const legacy = parsePanelMeta("2026-10-15-herradura", { estado: "activo" });
  assert.equal(legacy.estado, "activo");
  assert.equal(legacy.visibilidad, "demanda");
  assert.equal(legacy.caducado, false);
  assert.equal(legacy.expira, null);
  assert.equal(legacy.origen, "sesión", "origen por defecto");

  // Un fijado con caducidad pasada cae a demanda marcado caducado.
  const expired = parsePanelMeta("2026-10-15-x", { estado: "fijado", expira: "2026-01-01" });
  assert.equal(expired.estado, "fijado");
  assert.equal(expired.visibilidad, "demanda");
  assert.equal(expired.caducado, true);

  // Caducidad futura: el pin sigue vivo y la fecha viaja entera.
  const pinned = parsePanelMeta("2026-10-15-y", { estado: "fijado", expira: "2999-01-01", origen: "plan" });
  assert.equal(pinned.visibilidad, "fijado");
  assert.equal(pinned.caducado, false);
  assert.equal(pinned.expira, "2999-01-01");
  assert.equal(pinned.origen, "plan");

  // Fechas imposibles no cuentan como caducidad.
  const junk = parsePanelMeta("2026-10-15-z", { estado: "fijado", expira: "2026-02-30" });
  assert.equal(junk.expira, null);
  assert.equal(junk.visibilidad, "fijado");
});

test("raíces duales: canónica + staging, dedupe y resolución", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const canonical = mkdtempSync(join(tmpdir(), "paneles-canonical-"));
  const staging = mkdtempSync(join(tmpdir(), "paneles-staging-"));
  const panel = (root, slug, titulo) => {
    mkdirSync(join(root, slug));
    writeFileSync(join(root, slug, "index.html"), `<h1>${titulo}</h1>`);
    writeFileSync(join(root, slug, "panel.json"), JSON.stringify({ titulo, tipo: "base", fecha: slug.slice(0, 10) }));
  };
  try {
    // Promoted panel in canonical; drafts only in staging; one slug in both.
    panel(canonical, "2026-10-20-promovido", "Promovido");
    panel(canonical, "2026-10-22-ambos", "Canónico");
    panel(staging, "2026-10-22-ambos", "Borrador");
    panel(staging, "2026-10-23-staging", "Staging");

    process.env.PANELES_ROOT = canonical;
    process.env.PANELES_STAGING_ROOT = staging;
    try {
      // Roots ordered canonical-first and deduped when configured equal.
      assert.deepEqual(panelesRoots(), [canonical, staging]);
      process.env.PANELES_STAGING_ROOT = canonical;
      assert.deepEqual(panelesRoots(), [canonical]);
      process.env.PANELES_STAGING_ROOT = staging;

      // A slug in both roots resolves to the canonical copy (promotion wins).
      assert.equal(resolvePanelDirSync("2026-10-22-ambos"), join(canonical, "2026-10-22-ambos"));
      // Staging-only and canonical-only panels resolve in their own root.
      assert.equal(resolvePanelDirSync("2026-10-23-staging"), join(staging, "2026-10-23-staging"));
      assert.equal(resolvePanelDirSync("2026-10-20-promovido"), join(canonical, "2026-10-20-promovido"));
      assert.equal(resolvePanelDirSync("2026-01-01-inexistente"), null);

      // The merged list carries staging panels without losing promoted ones,
      // and the canonical copy wins the duplicated slug.
      const listed = listPanelsSync();
      assert.deepEqual(listed.map((p) => `${p.slug}:${p.titulo}`), [
        "2026-10-23-staging:Staging",
        "2026-10-22-ambos:Canónico",
        "2026-10-20-promovido:Promovido",
      ]);
    } finally {
      delete process.env.PANELES_ROOT;
      delete process.env.PANELES_STAGING_ROOT;
    }
  } finally {
    rmSync(canonical, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
});
