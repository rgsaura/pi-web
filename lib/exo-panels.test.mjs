import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { resolveOptionPanelSrc, optionPanelsFor, PANEL_SLUG_RE } = await jiti.import("./exo-panels.ts");

test("panel entries resolve to the same-origin paneles route", () => {
  assert.equal(
    resolveOptionPanelSrc("paneles/2026-10-22-variaciones-interactivas-ui"),
    "/api/paneles/2026-10-22-variaciones-interactivas-ui/",
    "a bare panel gets the directory form (base tag + relative assets)",
  );
  assert.equal(
    resolveOptionPanelSrc("paneles/2026-10-22-variaciones-interactivas-ui/"),
    "/api/paneles/2026-10-22-variaciones-interactivas-ui/",
    "the trailing slash normalizes to the same directory URL",
  );
  assert.equal(
    resolveOptionPanelSrc("paneles/2026-10-22-variaciones-interactivas-ui/lateral.html"),
    "/api/paneles/2026-10-22-variaciones-interactivas-ui/lateral.html",
    "one page of a multi-variant panel embeds that page",
  );
});

test("external origins and dev ports are refused — same origin only", () => {
  assert.equal(resolveOptionPanelSrc("http://exohuman.tail08ecb.ts.net:30152/api/paneles/2026-10-22-x/"), null);
  assert.equal(resolveOptionPanelSrc("https://ejemplo.com/preview"), null);
  assert.equal(resolveOptionPanelSrc("//evil.example/panel"), null);
  assert.equal(resolveOptionPanelSrc("javascript:alert(1)"), null);
  assert.equal(resolveOptionPanelSrc("data:text/html,<b>hola</b>"), null);
});

test("malformed and traversal entries are refused", () => {
  assert.equal(resolveOptionPanelSrc("paneles/"), null);
  assert.equal(resolveOptionPanelSrc("paneles/variaciones-interactivas-ui"), null, "slug must be dated (4-digit year prefix)");
  assert.equal(resolveOptionPanelSrc("paneles/2026-10-22-../ledger"), null);
  assert.equal(resolveOptionPanelSrc("paneles/2026-10-22-x/.hidden.html"), null);
  assert.equal(resolveOptionPanelSrc("paneles/2026-10-22-x/_plantillas/tpl.html"), null);
  assert.equal(resolveOptionPanelSrc("paneles/2026-10-22-x/a/../../b"), null, "traversal in the subpath");
  assert.equal(resolveOptionPanelSrc("media/2026-10-22-x.png"), null, "media entries are images, not panels");
  assert.equal(resolveOptionPanelSrc(""), null);
  assert.equal(resolveOptionPanelSrc(null), null);
  assert.equal(resolveOptionPanelSrc(42), null);
  assert.equal(resolveOptionPanelSrc("paneles/2026-10-22-x/a/b/c/d/e/f/g"), null, "unreasonably deep subpaths");
});

test("optionPanelsFor aligns previews with options and pads with nulls", () => {
  const panels = optionPanelsFor(3, [
    "paneles/2026-10-22-a",
    "paneles/2026-10-22-b/b.html",
    "https://externo.example/x",
  ]);
  assert.deepEqual(panels, [
    "/api/paneles/2026-10-22-a/",
    "/api/paneles/2026-10-22-b/b.html",
    null,
  ]);
  assert.deepEqual(optionPanelsFor(2, undefined), [null, null]);
  assert.deepEqual(optionPanelsFor(1, "paneles/2026-10-22-solo"), ["/api/paneles/2026-10-22-solo/"]);
  assert.deepEqual(optionPanelsFor(2, ["mal/entry", "paneles/2026-10-22-b"]), [null, "/api/paneles/2026-10-22-b/"], "bad entries do not shift alignment");
});

test("the slug pattern matches dated panel directories only", () => {
  assert.equal(PANEL_SLUG_RE.test("2026-10-22-dashboard-inicio-preview"), true);
  assert.equal(PANEL_SLUG_RE.test("2026-01-01-x"), true);
  assert.equal(PANEL_SLUG_RE.test("dashboard-inicio-preview"), false);
  assert.equal(PANEL_SLUG_RE.test("2026-10-22-"), false);
  assert.equal(PANEL_SLUG_RE.test("2026-10-22-x/"), false);
});
