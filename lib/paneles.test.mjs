import assert from "node:assert/strict";
import { test } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  isPanelDirName,
  parsePanelMeta,
  sortPanels,
  isServablePanelSegment,
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

  // Fallbacks con panel.json vacío o nulo
  const fallback = parsePanelMeta("2026-10-16-sin-meta", null);
  assert.equal(fallback.titulo, "2026-10-16-sin-meta");
  assert.equal(fallback.tipo, "otro");
  assert.equal(fallback.fecha, "2026-10-16");
  assert.equal(fallback.resumen, "");
  assert.equal(fallback.estado, "activo");
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
