import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import { createJiti } from "jiti";

/** writePanelState against a fixture root: PANELES_ROOT and the expiry
 *  registry both point at a temp dir, so the test never touches the real
 *  paneles root or the watcher's registry. */
const root = mkdtempSync(join(tmpdir(), "paneles-state-"));
process.env.PANELES_ROOT = root;
process.env.EXO_EXPIRY_REGISTRY = join(root, "registry.json");

const jiti = createJiti(import.meta.url);
const { writePanelState, readPanelMetaSync } = await jiti.import("./panel-state.ts");
const { serializeByKey } = await jiti.import("./key-serializer.ts");

function makePanel(slug, json) {
  const dir = join(root, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html><body>panel</body></html>");
  writeFileSync(join(dir, "panel.json"), `${JSON.stringify(json, null, 2)}\n`);
  return dir;
}

/** syncPanelExpiryRegistry is fire-and-forget under the registry lock;
 *  queueing onto the same key waits for the write to land. */
async function settleRegistry() {
  await serializeByKey(Symbol.for("pi-web.expiry-registry"), "registry", async () => null);
}

function readRegistry() {
  if (!existsSync(process.env.EXO_EXPIRY_REGISTRY)) return { entries: [] };
  return JSON.parse(readFileSync(process.env.EXO_EXPIRY_REGISTRY, "utf8"));
}

before(() => {
  makePanel("2026-10-16-surf-platano", {
    titulo: "Surf Plátano",
    tipo: "base",
    fecha: "2026-10-16",
    resumen: "Imagen generada",
    estado: "activo",
    sessions: ["sid-12345678"],
  });
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

test("writePanelState: fija con caducidad y conserva el resto de panel.json", async () => {
  const result = await writePanelState("2026-10-16-surf-platano", { visibilidad: "fijado", expira: "2999-01-15" });
  assert.equal(result.ok, true);
  assert.equal(result.panel.estado, "fijado");
  assert.equal(result.panel.expira, "2999-01-15");
  const raw = JSON.parse(readFileSync(join(root, "2026-10-16-surf-platano", "panel.json"), "utf8"));
  assert.equal(raw.titulo, "Surf Plátano", "el título sigue");
  assert.equal(raw.sessions[0], "sid-12345678", "las sesiones siguen");
  await settleRegistry();
  const registry = readRegistry();
  const entry = registry.entries.find((entry) => entry.id === "panel:2026-10-16-surf-platano");
  assert.ok(entry, "el registro de caducidad tiene la entrada");
  assert.equal(entry.expires, "2999-01-15");
});

test("writePanelState: re-fijar sin caducidad limpia expira y la entrada del registro", async () => {
  const result = await writePanelState("2026-10-16-surf-platano", { visibilidad: "fijado", expira: null });
  assert.equal(result.ok, true);
  assert.equal(result.panel.expira, null);
  const raw = JSON.parse(readFileSync(join(root, "2026-10-16-surf-platano", "panel.json"), "utf8"));
  assert.equal("expira" in raw, false, "expira desaparece del JSON");
  await settleRegistry();
  const registry = readRegistry();
  assert.equal(registry.entries.some((entry) => entry.id === "panel:2026-10-16-surf-platano"), false);
});

test("writePanelState: archivar quita la entrada del registro aunque quedara expira", async () => {
  await writePanelState("2026-10-16-surf-platano", { visibilidad: "fijado", expira: "2999-02-02" });
  await settleRegistry();
  const result = await writePanelState("2026-10-16-surf-platano", { visibilidad: "archivado" });
  assert.equal(result.ok, true);
  assert.equal(result.panel.estado, "archivado");
  await settleRegistry();
  const registry = readRegistry();
  assert.equal(registry.entries.some((entry) => entry.id === "panel:2026-10-16-surf-platano"), false);
});

test("writePanelState: volver a demanda limpia expira y la entrada del registro", async () => {
  await writePanelState("2026-10-16-surf-platano", { visibilidad: "fijado", expira: "2999-03-03" });
  await settleRegistry();
  const result = await writePanelState("2026-10-16-surf-platano", { visibilidad: "demanda" });
  assert.equal(result.ok, true);
  assert.equal(result.panel.expira, null, "la caducidad sólo significa algo fijado");
  const raw = JSON.parse(readFileSync(join(root, "2026-10-16-surf-platano", "panel.json"), "utf8"));
  assert.equal("expira" in raw, false);
  await settleRegistry();
  const registry = readRegistry();
  assert.equal(registry.entries.some((entry) => entry.id === "panel:2026-10-16-surf-platano"), false);
  // Un expira que llegue junto a demanda se ignora igualmente.
  const ignored = await writePanelState("2026-10-16-surf-platano", { visibilidad: "demanda", expira: "2999-04-04" });
  assert.equal(ignored.ok, true);
  assert.equal(ignored.panel.expira, null);
});

test("writePanelState: rechaza slug inválido, panel inexistente y fecha imposible", async () => {
  const badSlug = await writePanelState("../escape", { visibilidad: "fijado" });
  assert.equal(badSlug.ok, false);
  assert.equal(badSlug.status, 400);
  const missing = await writePanelState("2026-10-16-no-existe", { visibilidad: "fijado" });
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 404);
  const badDate = await writePanelState("2026-10-16-surf-platano", { visibilidad: "fijado", expira: "2026-02-30" });
  assert.equal(badDate.ok, false);
  assert.equal(badDate.status, 400);
  const badVisibility = await writePanelState("2026-10-16-surf-platano", { visibilidad: "activo" });
  assert.equal(badVisibility.ok, false);
  assert.equal(badVisibility.status, 400);
});

test("readPanelMetaSync: lee el meta fresco y null fuera del root", () => {
  const meta = readPanelMetaSync("2026-10-16-surf-platano");
  assert.ok(meta);
  assert.equal(meta.estado, "demanda");
  assert.equal(readPanelMetaSync("2026-10-16-nada"), null);
});
