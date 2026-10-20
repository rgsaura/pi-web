import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WINDOW_DAYS,
  collectEncargos,
  collectPropuestas,
  parseNumberedRules,
  collectReglas,
  parseWorktreePorcelain,
  parseLogLines,
  collectGitCommits,
  annotateBranchesWithRegistry,
  resolutionLabel,
  parseAnyIso,
  esc,
  escapeJsonForScript,
  buildPanelHtml,
} from "./mejoras-panel.mjs";

const NOW = Date.parse("2026-10-20T14:00:00Z");

// — parseAnyIso —

test("parseAnyIso acepta fechas con y sin zona", () => {
  assert.equal(parseAnyIso("2026-10-20T14:00:00.000Z"), NOW);
  assert.equal(parseAnyIso("2026-10-20T14:00:00"), NOW); // naive → UTC
  assert.equal(parseAnyIso("2026-10-20"), Date.parse("2026-10-20T00:00:00Z"));
  assert.equal(parseAnyIso(""), null);
  assert.equal(parseAnyIso(null), null);
  assert.equal(parseAnyIso("garbage"), null);
});

// — Encargos —

const encargosLedger = {
  encargos: {
    "enc-1": {
      status: "done",
      titulo: "Panel Mejoras",
      nota: "Resumen del trabajo",
      categoria: "ui",
      resuelto: "2026-10-20T10:00:00",
      session_id: "abc-123",
    },
    "enc-2": {
      status: "done",
      titulo: "Viejo",
      resuelto: "2026-10-01T10:00:00", // fuera de la ventana de 7 días
    },
    "enc-3": { status: "pending", titulo: "En marcha", categoria: "ui", creado: "2026-10-19T09:00:00", estado_detalle: "Investigando" },
  },
};

test("collectEncargos filtra done por ventana y separa pendientes", () => {
  const { recent, pending, total } = collectEncargos(encargosLedger, NOW, WINDOW_DAYS);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].id, "enc-1");
  assert.equal(recent[0].resumen, "Resumen del trabajo");
  assert.equal(recent[0].sessionId, "abc-123");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "enc-3");
  assert.equal(total, 3);
});

test("collectEncargos tolera ledger corrupto", () => {
  assert.deepEqual(collectEncargos(null, NOW), { recent: [], pending: [], total: 0 });
  assert.deepEqual(collectEncargos({}, NOW), { recent: [], pending: [], total: 0 });
});

// — Propuestas —

test("resolutionLabel mapea opción exacta y trunca texto libre", () => {
  assert.equal(resolutionLabel({ options: ["Ir", "Quedarse"], resolution: { choice: "Ir" } }), "Ir");
  const larga = "x".repeat(200);
  const label = resolutionLabel({ options: [], resolution: { choice: larga } });
  assert.equal(label.length, 140);
  assert.ok(label.endsWith("…"));
  assert.equal(resolutionLabel({ resolution: {} }), "");
});

test("collectPropuestas filtra resueltas por ventana", () => {
  const ledger = {
    proposals: {
      "prop-1": { id: "prop-1", title: "Cine", status: "resolved", options: ["Ir"], resolution: { choice: "Ir", resolved_at: "2026-10-19T20:00:00Z" } },
      "prop-2": { id: "prop-2", title: "Vieja", status: "resolved", resolution: { choice: "Sí", resolved_at: "2026-10-01T20:00:00Z" } },
      "prop-3": { id: "prop-3", title: "Pendiente", status: "pending" },
    },
  };
  const { recent, total } = collectPropuestas(ledger, NOW, WINDOW_DAYS);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].id, "prop-1");
  assert.equal(recent[0].resolucion, "Ir");
  assert.equal(total, 3);
});

// — Reglas —

const RULES_MD = `# Título

18. PROTOCOLO DE DECISIONES (PROPUESTAS / DECISIONES) (grabado por Rodrigo, 2026-10-16):
   - Detalle.

25. FORMATO VISUAL (grabado por Rodrigo, 2026-10-16):
   - Detalle.

26. RESILIENCIA OPERATIVA (grabado por Rodrigo, 2026-10-17 / 2026-10-18):
   - Detalle.

1. CERO TOCAR PRODUCCIÓN:
   - Sub-regla sin grabado: no cuenta.

29. PANELES EN EL CATÁLOGO (grabado por Rodrigo, 2026-10-20):
   - Todo entregable dashboard se registra como candidato a fijar.
`;

test("parseNumberedRules extrae sólo reglas grabadas con sus fechas", () => {
  const rules = parseNumberedRules(RULES_MD);
  assert.deepEqual(rules.map((r) => r.num), [18, 25, 26, 29]);
  assert.equal(rules[0].titulo, "PROTOCOLO DE DECISIONES (PROPUESTAS / DECISIONES)");
  assert.deepEqual(rules[2].fechas, ["2026-10-17", "2026-10-18"]);
  assert.equal(rules[3].num, 29);
});

test("collectReglas respeta la ventana y cae a las últimas si va vacía", () => {
  const dentro = collectReglas(RULES_MD, NOW, WINDOW_DAYS);
  assert.equal(dentro.recent.length, 4);
  assert.equal(dentro.fallback, false);

  const haceMucho = Date.parse("2027-01-01T00:00:00Z");
  const fuera = collectReglas(RULES_MD, haceMucho, WINDOW_DAYS);
  assert.equal(fuera.fallback, true);
  assert.equal(fuera.recent.length, 3); // las 3 más recientes
  assert.ok(fuera.recent[0].num >= fuera.recent[2].num);
});

// — Git —

const PORCELAIN = `worktree /home/u/workspaces/exohuman-ui
HEAD a9ea59b
branch refs/heads/fork/paneles-gestor

worktree /home/u/workspaces/wt-bee02de7
HEAD ed99824
branch refs/heads/fork/bee02de7

worktree /home/u/workspaces/prod
HEAD deadbeef
detached
`;

test("parseWorktreePorcelain mapea worktrees, ramas y detached", () => {
  const wts = parseWorktreePorcelain(PORCELAIN);
  assert.equal(wts.length, 3);
  assert.equal(wts[0].branch, "fork/paneles-gestor");
  assert.equal(wts[1].path, "/home/u/workspaces/wt-bee02de7");
  assert.equal(wts[2].branch, null);
});

test("parseLogLines parsea hash, fecha y subject con tabs", () => {
  const commits = parseLogLines("abc1234\t2026-10-20T12:00:00+00:00\tfeat: algo\tcon tab\n\nxyz\t2026-10-19T10:00:00+00:00\tfix: nada");
  assert.equal(commits.length, 2);
  assert.equal(commits[0].h, "abc1234");
  assert.equal(commits[0].s, "feat: algo\tcon tab");
});

function fakeExec(byArgs) {
  return (repo, args) => {
    const key = args.join(" ");
    const hit = byArgs[key];
    if (hit) return hit;
    if (args[0] === "merge-base") return { stdout: "", status: 1 };
    if (args[0] === "log") return { stdout: "", status: 0 };
    return { stdout: "", status: 0 };
  };
}

test("collectGitCommits agrupa por rama, marca merge y respeta ventana", () => {
  const exec = fakeExec({
    "worktree list --porcelain": { stdout: PORCELAIN, status: 0 },
    "for-each-ref refs/heads/ --format=%(refname:short)": {
      stdout: "fork/bee02de7\nmain\nfork/vacia\n",
      status: 0,
    },
    "log fork/bee02de7 --no-merges --since=2026-10-13 --date=iso-strict --format=%h%x09%ad%x09%s --max-count=400": {
      stdout: "abc1234\t2026-10-20T12:00:00+00:00\tfeat: panel mejoras\nfff0000\t2026-10-18T08:00:00+00:00\tfix: borde",
      status: 0,
    },
    "log main --no-merges --since=2026-10-13 --date=iso-strict --format=%h%x09%ad%x09%s --max-count=400": {
      stdout: "ed9982\t2026-10-19T09:00:00+00:00\tfeat: sesiones detached",
      status: 0,
    },
    "merge-base --is-ancestor fork/bee02de7 main": { stdout: "", status: 1 },
    "merge-base --is-ancestor main main": { stdout: "", status: 0 },
  });
  const git = collectGitCommits({ repo: "/repo", nowMs: NOW, exec });
  assert.equal(git.totalCommits, 3);
  assert.equal(git.branches.length, 2); // fork/vacia sin commits queda fuera
  assert.equal(git.branches[0].branch, "fork/bee02de7"); // más reciente primero
  assert.equal(git.branches[0].mergedIntoMain, false);
  assert.equal(git.branches[0].worktree, "/home/u/workspaces/wt-bee02de7");
  assert.equal(git.branches[0].commits.length, 2);
  const main = git.branches.find((b) => b.branch === "main");
  assert.equal(main.mergedIntoMain, true);
});

test("annotateBranchesWithRegistry añade encargo y puerto desde el registro", () => {
  const git = {
    repo: "/repo",
    sinceDate: "2026-10-13",
    branches: [
      { branch: "fork/bee02de7", worktree: "/home/u/workspaces/wt-bee02de7", mergedIntoMain: false, total: 1, lastAt: null, lastMs: 0, commits: [] },
    ],
    totalCommits: 1,
    worktreeCount: 1,
  };
  const registry = { worktrees: { "wt-bee02de7": { branch: "fork/bee02de7", encargo: "enc-bee02de7", port: "30145" } } };
  const out = annotateBranchesWithRegistry(git, registry);
  assert.equal(out.branches[0].encargo, "enc-bee02de7");
  assert.equal(out.branches[0].port, "30145");
  assert.equal(out.totalCommits, 1);
});

// — HTML —

test("esc y escapeJsonForScript neutralizan contenido hostil", () => {
  assert.equal(esc('<a href="x">&\''), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  const json = escapeJsonForScript({ s: "</script>\u2028\u2029" });
  assert.ok(!json.includes("<"));
  assert.ok(json.includes("\\u003c"));
  const parsed = JSON.parse(json.replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&").replace(/\\u2028/g, "\u2028").replace(/\\u2029/g, "\u2029"));
  assert.equal(parsed.s, "</script>\u2028\u2029");
});

test("buildPanelHtml pre-renderiza las secciones con datos reales", () => {
  const data = {
    generatedAt: "2026-10-20T14:00:00.000Z",
    windowDays: WINDOW_DAYS,
    encargos: collectEncargos(encargosLedger, NOW),
    propuestas: collectPropuestas({ proposals: { p: { id: "p", title: "Cine", status: "resolved", options: ["Ir"], resolution: { choice: "Ir", resolved_at: "2026-10-19T20:00:00Z" } } } }, NOW),
    reglas: collectReglas(RULES_MD, NOW),
    git: annotateBranchesWithRegistry(
      {
        repo: "/home/u/workspaces/exohuman-ui",
        sinceDate: "2026-10-13",
        branches: [
          { branch: "fork/bee02de7", worktree: "/home/u/workspaces/wt-bee02de7", mergedIntoMain: false, total: 2, lastAt: "2026-10-20T12:00:00+00:00", lastMs: NOW, commits: [{ h: "abc1234", ad: "2026-10-20T12:00:00+00:00", s: "feat: <panel>" }], encargo: "enc-bee02de7", port: "30145" },
        ],
        totalCommits: 2,
        worktreeCount: 3,
      },
      null,
    ),
    sesiones: { snapshotAt: "2026-10-20T14:00:00.000Z", runningCount: 2, awaitingCount: 0, items: [{ id: "s1", titulo: "Sesión viva", cwd: "/w", modified: "2026-10-20T13:59:00Z" }] },
  };
  const html = buildPanelHtml(data);
  assert.ok(html.includes("Mejoras del Sistema"));
  assert.ok(html.includes("candidato a fijar · regla 29"));
  assert.ok(html.includes("Panel Mejoras"));
  assert.ok(html.includes("?session=abc-123")); // enlace a la sesión del encargo
  assert.ok(html.includes("fork/bee02de7"));
  assert.ok(html.includes("feat: &lt;panel&gt;")); // subject escapado
  assert.ok(html.includes("Sesión viva"));
  assert.ok(html.includes("/api/agent/running"));
  assert.ok(html.includes('type="application/json"'));
  assert.ok(!html.includes("</script>\u2028"));
  return html;
});

// — Script cliente del directo (extraído del HTML, con DOM y fetch stubbados) —

function clientScriptFrom(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const main = blocks.find((code) => code.includes("mejoras-sesiones"));
  assert.ok(main, "el HTML incluye el script cliente del directo");
  // Sin la envolvente IIFE ni los arranques automáticos: el test controla refresh().
  const body = main
    .replace(/^\s*\(function \(\) \{/, "")
    .replace(/\n\s*render\(snapshot, false\);[\s\S]*$/, "")
    .replace(/\n\s*\}\)\(\);\s*$/, "");
  assert.ok(body.includes("function refresh"), "el script define refresh");
  return body;
}

function stubDom(html, snapshotItems) {
  const jsonBlock = html.match(/<script id="mejoras-sesiones" type="application\/json">([\s\S]*?)<\/script>/)[1]
    .replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&");
  const elements = {
    "mejoras-sesiones": { textContent: jsonBlock },
    "sesiones-list": { innerHTML: "" },
    "sesiones-note": { textContent: "" },
    "live-badge": { classList: { toggle() { this._on = arguments[1]; } } },
    "kpi-sesiones": { textContent: "" },
  };
  return {
    document: {
      getElementById: (id) => elements[id] ?? null,
      createElement: () => ({ style: {} }),
    },
    window: { location: { origin: "http://pre.test" } },
    setInterval() {},
    elements,
    snapshotItems,
  };
}

async function runClient(html, fetchImpl) {
  const snapshotItems = JSON.parse(
    html.match(/<script id="mejoras-sesiones" type="application\/json">([\s\S]*?)<\/script>/)[1]
      .replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"),
  ).items;
  const dom = stubDom(html, snapshotItems);
  const fn = new Function(
    "document", "window", "setInterval", "fetch", "Date", "JSON",
    `${clientScriptFrom(html)}\n;return refresh;`,
  );
  const refresh = fn(dom.document, dom.window, dom.setInterval, fetchImpl, Date, JSON);
  await refresh();
  return dom;
}

test("script cliente: directo same-origin cuando la instancia reporta sesiones", async () => {
  const html = htmlForClientTests();
  const dom = await runClient(html, (url) => {
    if (url.includes("agent/running")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ runningSessionIds: ["s1"], awaitingInputSessionIds: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [{ id: "s1", firstMessage: "Viva ahora", cwd: "/w", modified: new Date().toISOString() }] }) });
  });
  assert.ok(dom.elements["sesiones-list"].innerHTML.includes("Viva ahora"));
  assert.ok(dom.elements["sesiones-list"].innerHTML.includes("?session=s1"));
  assert.equal(dom.elements["live-badge"].classList._on, true);
  assert.ok(dom.elements["sesiones-note"].textContent.includes("en vivo"));
});

test("script cliente: instancia sin sesiones (pre) mantiene la captura real con nota", async () => {
  const html = htmlForClientTests();
  const dom = await runClient(html, (url) => {
    if (url.includes("agent/running")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ runningSessionIds: [], awaitingInputSessionIds: [] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) });
  });
  assert.ok(dom.elements["sesiones-list"].innerHTML.includes("Sesión viva")); // captura de la generación
  assert.equal(dom.elements["live-badge"].classList._on, false);
  assert.ok(dom.elements["sesiones-note"].textContent.includes("viven en producción"));
});

test("script cliente: fallo de API cae a la captura", async () => {
  const html = htmlForClientTests();
  const dom = await runClient(html, () => Promise.reject(new Error("sin conexión")));
  assert.ok(dom.elements["sesiones-list"].innerHTML.includes("Sesión viva"));
  assert.ok(dom.elements["sesiones-note"].textContent.includes("sin conexión"));
});

/** HTML compartido por los tests del script cliente (datos mínimos). */
function htmlForClientTests() {
  const data = {
    generatedAt: "2026-10-20T14:00:00.000Z",
    windowDays: WINDOW_DAYS,
    encargos: { recent: [], pending: [], total: 0 },
    propuestas: { recent: [], total: 0 },
    reglas: { recent: [], total: 0, fallback: false },
    git: { repo: "/repo", sinceDate: "2026-10-13", branches: [], totalCommits: 0, worktreeCount: 0 },
    sesiones: {
      snapshotAt: "2026-10-20T14:00:00.000Z",
      runningCount: 1,
      awaitingCount: 0,
      items: [{ id: "s1", titulo: "Sesión viva", cwd: "/w", modified: "2026-10-20T13:59:00Z" }],
    },
  };
  return buildPanelHtml(data);
}
