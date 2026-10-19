import assert from "node:assert/strict";
import { test } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { mergePanelSessions, panelSessionNeedle } = await jiti.import("./paneles-sessions.ts");

function session(id, { name, firstMessage = "primer mensaje", modified = "2026-10-20T10:00:00Z" } = {}) {
  return {
    path: `/home/x/.pi/agent/sessions/enc/${id}.jsonl`,
    id,
    cwd: "/home/x/work",
    ...(name ? { name } : {}),
    created: modified,
    modified,
    messageCount: 2,
    firstMessage,
  };
}

test("panelSessionNeedle: quita el prefijo de fecha y cae al nombre completo si queda corto", () => {
  assert.equal(panelSessionNeedle("2026-10-16-surf-platano"), "surf-platano");
  assert.equal(panelSessionNeedle("2026-10-16-abc"), "abc");
  // sin fecha: el nombre tal cual
  assert.equal(panelSessionNeedle("comparativa-camaras"), "comparativa-camaras");
  // tras quitar la fecha queda demasiado corto: nombre completo
  assert.equal(panelSessionNeedle("2026-10-16-ab"), "2026-10-16-ab");
});

test("mergePanelSessions: registradas primero (orden de panel.json), luego menciones", () => {
  const registered = ["sid-registrada-01", "sid-registrada-02"];
  const catalog = [
    session("sid-registrada-01", { name: "Creadora del panel", modified: "2026-10-16T09:00:00Z" }),
    session("sid-registrada-02", { firstMessage: "encargo del panel", modified: "2026-10-15T09:00:00Z" }),
    session("sid-mencion-01", { firstMessage: "revisemos el entregable", modified: "2026-10-18T09:00:00Z" }),
  ];
  const mentions = [
    {
      session: session("sid-mencion-01", { firstMessage: "revisemos el entregable" }),
      entryId: "abcd1234",
      before: "el panel está en ",
      match: "surf-platano",
      after: " para revisión",
    },
  ];
  const { sessions, missing } = mergePanelSessions(registered, catalog, mentions);
  assert.deepEqual(missing, []);
  assert.deepEqual(sessions.map((s) => s.id), ["sid-registrada-01", "sid-registrada-02", "sid-mencion-01"]);
  // la primera viene del catálogo, sin snippet (no apareció en el escaneo)
  assert.equal(sessions[0].source, "panel.json");
  assert.equal(sessions[0].snippet, undefined);
  assert.equal(sessions[0].title, "Creadora del panel");
  // la mencionada lleva su snippet y entry para el deep link
  assert.equal(sessions[2].source, "mencion");
  assert.deepEqual(sessions[2].snippet, {
    before: "el panel está en ",
    match: "surf-platano",
    after: " para revisión",
    entryId: "abcd1234",
  });
});

test("mergePanelSessions: una sesión registrada y mencionada se queda en panel.json con snippet", () => {
  const registered = ["sid-both"];
  const catalog = [session("sid-both", { name: "sesión creadora" })];
  const mentions = [
    {
      session: session("sid-both", { name: "sesión creadora" }),
      before: "creé ",
      match: "surf-platano",
      after: " con rg-panel",
    },
  ];
  const { sessions, missing } = mergePanelSessions(registered, catalog, mentions);
  assert.deepEqual(missing, []);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].source, "panel.json");
  assert.equal(sessions[0].snippet?.match, "surf-platano");
});

test("mergePanelSessions: ids registrados sin catálogo ni mención van a missing", () => {
  const registered = ["sid-fantasma", "sid-viva"];
  const catalog = [session("sid-viva", { name: "viva" })];
  const { sessions, missing } = mergePanelSessions(registered, catalog, []);
  assert.deepEqual(missing, ["sid-fantasma"]);
  assert.deepEqual(sessions.map((s) => s.id), ["sid-viva"]);
});

test("mergePanelSessions: una mención cuya sesión no está en el catálogo sigue listada", () => {
  const ghost = session("sid-solo-mencion", { firstMessage: "hablando del panel" });
  const { sessions, missing } = mergePanelSessions([], [], [
    { session: ghost, before: "", match: "surf-platano", after: "" },
  ]);
  assert.deepEqual(missing, []);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "sid-solo-mencion");
  assert.equal(sessions[0].title, "hablando del panel");
  // sin entryId el snippet no lleva el campo
  assert.equal(sessions[0].snippet?.entryId, undefined);
});

test("mergePanelSessions: duplicados de registro y de mención se colapsan", () => {
  const catalog = [session("sid-a", { name: "A" })];
  const mention = { session: session("sid-a", { name: "A" }), before: "x ", match: "slug-x", after: " y" };
  const { sessions } = mergePanelSessions(["sid-a", "sid-a"], catalog, [mention, mention]);
  assert.equal(sessions.length, 1);
});
