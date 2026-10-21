import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { SessionsExplorer, buildRow } = await jiti.import("./SessionsExplorer.tsx");

const h = React.createElement;
const noop = () => {};
const DAY = 86_400_000;

function startOfToday() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
}

function session(id, { path, cwd, name, firstMessage, modified }, overrides = {}) {
  const time = new Date(modified).toISOString();
  return {
    id,
    path: path ?? `${cwd ?? "/home/rgsaura"}/${id}.jsonl`,
    cwd: cwd ?? "/home/rgsaura",
    created: time,
    modified: time,
    messageCount: 1,
    firstMessage: firstMessage ?? id,
    ...(name !== undefined ? { name } : {}),
    ...overrides,
  };
}

function render(props = {}) {
  return renderToStaticMarkup(h(SessionsExplorer, {
    sessions: [],
    selectedSessionId: null,
    onSelectSession: noop,
    ...props,
  }));
}

function fixture() {
  const today = startOfToday();
  return {
    encargo: session("enc-1", {
      cwd: "/home/rgsaura/workspaces/exohuman-ui",
      firstMessage: "ENCARGO OFICIAL (enc-5da87681): Portar el SessionsExplorer al sidebar",
      modified: today + 60_000,
    }),
    rutina: session("rut-1", {
      path: "/home/rgsaura/.local/state/exo/routines/sessions/morning-brief/2026-10-20T06-00-00.jsonl",
      firstMessage: "morning brief",
      modified: today + 30_000,
    }),
    facesearch: session("fs-1", {
      cwd: "/home/rgsaura/workspaces/facesearch",
      firstMessage: "Revisar el checkout de Stripe",
      modified: today - 60_000,
    }),
    trabajo: session("wk-1", {
      cwd: "/home/rgsaura/workspaces/wt-pre",
      name: "Sesión de la UI",
      firstMessage: "cambios del sidebar",
      modified: today - 3 * 60_000,
    }),
    ayer: session("pers-1", {
      cwd: "/home/rgsaura",
      firstMessage: "[Nota de voz de Rodrigo] Busca vuelos baratos a Madrid",
      modified: today - 3 * 3_600_000,
    }),
    personal: session("pers-2", {
      cwd: "/home/rgsaura",
      firstMessage: "¿qué tiempo hace mañana?",
      modified: today - 2 * DAY,
    }),
  };
}

test("the explorer renders its header: search field, the Cronológico/Proyectos views and the quick chips with counts", () => {
  const f = fixture();
  const html = render({ sessions: [f.encargo, f.rutina, f.facesearch, f.trabajo, f.ayer, f.personal] });
  assert.match(html, /<input id="session-search-input" type="search" data-session-filter="true"/);
  assert.match(html, /data-view-mode="tiempo"[^>]*aria-pressed="true"[^>]*>\s*<span[^>]*>🕒<\/span>Cronológico<\/button>/);
  assert.match(html, /data-view-mode="proyectos"[^>]*aria-pressed="false"/);
  // Chips with their counts: Todo 6, Encargos 1, Rutinas 1, Trabajo 2, Personal 2.
  assert.match(html, /data-chip="todo"[^>]*>[\s\S]*?Todo<span style="font-size:9.5px;opacity:0.75">6<\/span>/);
  assert.match(html, /data-chip="encargo"[^>]*>[\s\S]*?Encargos<span style="font-size:9.5px;opacity:0.75">1<\/span>/);
  assert.match(html, /data-chip="rutina"[^>]*>[\s\S]*?Rutinas<span style="font-size:9.5px;opacity:0.75">1<\/span>/);
  assert.match(html, /data-chip="trabajo"[^>]*>[\s\S]*?Trabajo<span style="font-size:9.5px;opacity:0.75">2<\/span>/);
  assert.match(html, /data-chip="personal"[^>]*>[\s\S]*?Personal<span style="font-size:9.5px;opacity:0.75">2<\/span>/);
  // En Vivo counts running sessions even when none runs.
  assert.match(html, /data-chip="activas"[^>]*>[\s\S]*?En Vivo<span style="font-size:9.5px;opacity:0.75">0<\/span>/);
});

test("the chronological view buckets sessions with clean titles and the encargo code chip", () => {
  const f = fixture();
  const html = render({ sessions: [f.encargo, f.rutina, f.facesearch, f.trabajo, f.ayer, f.personal] });
  assert.match(html, /Hoy<\/span>/);
  assert.match(html, /Ayer<\/span>/);
  assert.match(html, /Últimos 7 días<\/span>/);
  // The encargo's title is its own line, not the raw "ENCARGO OFICIAL…" text.
  assert.match(html, /Portar el SessionsExplorer al sidebar<\/span>/);
  assert.doesNotMatch(html, /ENCARGO OFICIAL/);
  assert.match(html, /title="Encargo enc-5da87681"[^>]*>enc-5da87681<\/span>/);
  // The routine gets its friendly label; the voice-note prefix is stripped.
  assert.match(html, /Rutina · Morning Brief<\/span>/);
  assert.match(html, /Busca vuelos baratos a Madrid<\/span>/);
  assert.doesNotMatch(html, /\[Nota de voz de Rodrigo\]/);
  // Every row carries its actions button.
  assert.equal((html.match(/aria-label="Acciones de /g) ?? []).length, 6);
});

test("a running session shows the live dot and counts in the En Vivo chip", () => {
  const f = fixture();
  const html = render({
    sessions: [f.encargo, f.rutina],
    runningSessionIds: new Set([f.rutina.id]),
  });
  assert.match(html, /data-running-dot=""/);
  assert.match(html, /data-chip="activas"[^>]*>[\s\S]*?En Vivo<span style="font-size:9.5px;opacity:0.75">1<\/span>/);
});

test("pinned sessions rise to their own section above the day buckets", () => {
  const f = fixture();
  const html = render({
    sessions: [f.encargo, f.ayer],
    pinnedIds: new Set([f.ayer.id]),
  });
  assert.match(html, /📌 Fijadas<\/span>/);
  assert.match(html, /title="Fijada"/);
});

test("archived sessions stay out of the list until asked, behind the archived count", () => {
  const f = fixture();
  const html = render({
    sessions: [f.encargo, f.ayer],
    archivedIds: new Set([f.ayer.id]),
  });
  assert.doesNotMatch(html, /Busca vuelos baratos a Madrid/);
  assert.match(html, /data-toggle-archived="true"[^>]*>▼ Archivadas \(1\)<\/button>/);
});

test("the projects view groups by friendly project with FaceSearch and the UI apart", async () => {
  const f = fixture();
  const rows = [f.facesearch, f.trabajo, f.rutina, f.ayer].map((s) => buildRow(s, Date.now()));
  const groups = new Map(rows.map((row) => [row.group.key, row.group]));
  // Friendly labels and emoji sections, not raw folder names.
  assert.equal(groups.get("facesearch")?.label, "FaceSearch");
  assert.equal(groups.get("exohuman-ui")?.label, "ExoHuman UI");
  assert.equal(groups.get("rutinas")?.label, "Rutinas del Sistema");
  assert.equal(groups.get("personal")?.label, "Personal & General");
  // The projects view header markup exists in the component source (the
  // view itself is a state choice, not a prop).
  const explorerSource = (await readFile(new URL("./SessionsExplorer.tsx", import.meta.url), "utf8"));
  assert.match(explorerSource, /data-project-header=\{entry\.group\.key\}/);
  assert.match(explorerSource, /projectSections\.map\(\(entry\) => renderProjectSection\(entry\)\)/);
});
