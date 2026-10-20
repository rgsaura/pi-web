#!/usr/bin/env node
/**
 * Generador del panel «Mejoras del Sistema» (enc-bee02de7).
 *
 * Dashboard con datos 100% reales de los ledgers y git:
 *   - Encargos completados en los últimos 7 días (título + resumen + sesión)
 *   - Encargos en marcha (pendientes del ledger)
 *   - Commits por rama/worktree de exohuman-ui (7 días, con estado merge a main)
 *   - Propuestas resueltas (ledger de propuestas, 7 días)
 *   - Reglas nuevas grabadas (~/.pi/agent/AGENTS.md, numeradas «grabado por…»)
 *   - Sesiones activas ahora: captura en generación + refresco en vivo desde
 *     el propio panel (fetch same-origin a /api/agent/running + /api/sessions)
 *
 * Escribe el panel en el catálogo canónico (PANELES_ROOT) siguiendo el mismo
 * contrato que `rg-panel new`: <AAAA-MM-DD>-mejoras-sistema/ con index.html,
 * data.json y panel.json (idempotente: actualiza el panel existente).
 *
 * Uso:
 *   node bin/mejoras-panel.mjs [--out <dir>] [--dry] [--json]
 *
 * Reejecutable en cualquier momento; pensado para rutina o el gestor de
 * paneles (enc-6d8067e1). Registro como candidato a fijar: regla 29.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const WINDOW_DAYS = 7;
export const PANEL_SLUG = "mejoras-sistema";

export const PATHS = {
  encargosLedger: () => join(homedir(), ".local/state/encargos/ledger.json"),
  proposalsLedger: () => join(homedir(), ".local/state/proposals/ledger.json"),
  worktreesRegistry: () => join(homedir(), ".local/state/exohuman/worktrees.json"),
  agentRules: () => join(homedir(), ".pi/agent/AGENTS.md"),
  repo: () => join(homedir(), "workspaces/exohuman-ui"),
  panelesRoot: () => process.env.PANELES_ROOT ?? join(homedir(), ".local/share/exohuman/paneles"),
};

// — Tiempo: los ledgers guardan ISO sin zona (UTC en esta VM); las fechas de
// sesión llegan con Z. Todo se normaliza a epoch ms para comparar. —

/** Parsea una fecha ISO con o sin zona; devuelve epoch ms o null. */
export function parseAnyIso(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value.includes("T") ? value : `${value}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

/** HH:MM UTC de un epoch, para las notas de captura. */
export function clockUtc(ms) {
  return new Date(ms).toISOString().slice(11, 16);
}

// — Encargos —

/**
 * Encargos del ledger: completados dentro de la ventana (título, resumen,
 * sesión) y pendientes («en marcha»).
 */
export function collectEncargos(ledger, nowMs, windowDays = WINDOW_DAYS) {
  const map = ledger && typeof ledger === "object" ? ledger.encargos : null;
  if (!map || typeof map !== "object") return { recent: [], pending: [], total: 0 };
  const since = nowMs - windowDays * 86_400_000;
  const items = Object.entries(map).map(([id, v]) => ({ id, v })).filter(({ v }) => v && typeof v === "object");
  const done = items
    .filter(({ v }) => v.status === "done" && (parseAnyIso(v.resuelto) ?? -1) >= since)
    .map(({ id, v }) => ({
      id,
      titulo: String(v.titulo ?? v.descripcion ?? "").trim(),
      resumen: String(v.nota ?? v.estado_detalle ?? "").trim(),
      categoria: String(v.categoria ?? ""),
      resuelto: v.resuelto ?? null,
      resueltoMs: parseAnyIso(v.resuelto),
      sessionId: v.session_id ?? v.sessionId ?? null,
    }))
    .sort((a, b) => (b.resueltoMs ?? 0) - (a.resueltoMs ?? 0));
  const pending = items
    .filter(({ v }) => v.status === "pending")
    .map(({ id, v }) => ({
      id,
      titulo: String(v.titulo ?? v.descripcion ?? "").trim(),
      categoria: String(v.categoria ?? ""),
      estado: String(v.estado_detalle ?? "").trim(),
      creado: v.creado ?? null,
      creadoMs: parseAnyIso(v.creado),
      sessionId: v.session_id ?? v.sessionId ?? null,
    }))
    .sort((a, b) => (b.creadoMs ?? 0) - (a.creadoMs ?? 0));
  return { recent: done, pending, total: items.length };
}

// — Propuestas —

/** Etiqueta legible de la resolución: opción conocida o texto libre truncado. */
export function resolutionLabel(propuesta) {
  const choice = String(propuesta?.resolution?.choice ?? "").trim();
  if (!choice) return "";
  const options = Array.isArray(propuesta?.options) ? propuesta.options : [];
  const exact = options.find((o) => typeof o === "string" && o.trim() === choice);
  const label = exact ?? choice;
  return label.length > 140 ? `${label.slice(0, 139)}…` : label;
}

/** Propuestas resueltas dentro de la ventana, más recientes primero. */
export function collectPropuestas(ledger, nowMs, windowDays = WINDOW_DAYS) {
  const map = ledger && typeof ledger === "object" ? ledger.proposals : null;
  if (!map || typeof map !== "object") return { recent: [], total: 0 };
  const since = nowMs - windowDays * 86_400_000;
  const items = Object.values(map).filter((v) => v && typeof v === "object");
  const recent = items
    .filter((v) => {
      if (v.status !== "resolved") return false;
      const at = parseAnyIso(v.resolution?.resolved_at);
      return at !== null && at >= since;
    })
    .map((v) => ({
      id: String(v.id ?? ""),
      titulo: String(v.title ?? "").trim(),
      resolucion: resolutionLabel(v),
      categoria: String(v.category ?? ""),
      source: String(v.source ?? "").trim(),
      resuelta: v.resolution?.resolved_at ?? null,
      resueltaMs: parseAnyIso(v.resolution?.resolved_at),
    }))
    .sort((a, b) => (b.resueltaMs ?? 0) - (a.resueltaMs ?? 0));
  return { recent, total: items.length };
}

// — Reglas grabadas —

const RULE_LINE = /^(\d{1,3})\.\s+(.+)$/;

/**
 * Reglas numeradas grabadas en un markdown de instrucciones: sólo las líneas
 * de nivel superior que citan «grabado … <fecha>» (la convención de las
 * reglas operativas de Rodrigo, p. ej. ~/.pi/agent/AGENTS.md).
 */
export function parseNumberedRules(markdown) {
  if (typeof markdown !== "string") return [];
  const rules = [];
  for (const line of markdown.split("\n")) {
    const match = RULE_LINE.exec(line.trim());
    if (!match) continue;
    const header = match[2];
    const dateMatch = /grabado[^,)]*,?\s*(\d{4}-\d{2}-\d{2})(?:\s*\/\s*\d{4}-\d{2}-\d{2})?/i.exec(header);
    if (!dateMatch) continue;
    // Título sin el paréntesis de grabado.
    const title = header.replace(/\s*\((grabado[^)]*)\)\s*:?\s*$/i, "").replace(/:\s*$/, "").trim();
    const dates = header.match(/\d{4}-\d{2}-\d{2}/g) ?? [dateMatch[1]];
    rules.push({
      num: Number(match[1]),
      titulo: title,
      fechas: dates,
      primeraMs: parseAnyIso(dates[0]) ?? parseAnyIso(`${dates[0]}T00:00:00Z`),
    });
  }
  return rules;
}

/** Reglas grabadas dentro de la ventana (o las últimas si la ventana va vacía). */
export function collectReglas(markdown, nowMs, windowDays = WINDOW_DAYS) {
  const all = parseNumberedRules(markdown);
  const since = nowMs - windowDays * 86_400_000;
  const recent = all.filter((r) => (r.primeraMs ?? 0) >= since).sort((a, b) => b.num - a.num);
  if (recent.length > 0) return { recent, total: all.length, fallback: false };
  const ultimas = [...all].sort((a, b) => (b.primeraMs ?? 0) - (a.primeraMs ?? 0)).slice(0, 3);
  return { recent: ultimas, total: all.length, fallback: true };
}

// — Git: commits por rama/worktree —

/** stdout de `git worktree list --porcelain` → [{path, branch, head}] */
export function parseWorktreePorcelain(text) {
  const out = [];
  let current = null;
  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (line.startsWith("worktree ")) {
      if (current) out.push(current);
      current = { path: line.slice(9).trim(), branch: null, head: null };
    } else if (current && line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim();
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.slice(7).trim().replace(/^refs\/heads\//, "");
    } else if (line === "detached" || line.startsWith("bare")) {
      // sin rama
    }
  }
  if (current) out.push(current);
  return out.filter((w) => w.path);
}

/** stdout de `git log --format=%h%x09%ad%x09%s` → commits [{h, ad, s}] */
export function parseLogLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [h, ad, ...rest] = line.split("\t");
      return { h, ad, s: rest.join("\t") };
    });
}

/**
 * Commits por rama del repo en la ventana. `exec` es inyectable para tests:
 * (repo, args) → { stdout, status }.
 */
export function collectGitCommits({ repo, nowMs, windowDays = WINDOW_DAYS, exec }) {
  const run = exec ?? defaultExec;
  const sinceDate = new Date(nowMs - windowDays * 86_400_000).toISOString().slice(0, 10);
  const porcelain = run(repo, ["worktree", "list", "--porcelain"]);
  const worktrees = parseWorktreePorcelain(porcelain.stdout);
  const byBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch, w]));

  const refsRaw = run(repo, ["for-each-ref", "refs/heads/", "--format=%(refname:short)"]);
  const branches = [];
  let totalCommits = 0;
  for (const branch of refsRaw.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
    const log = run(repo, [
      "log", branch, "--no-merges", `--since=${sinceDate}`, "--date=iso-strict",
      "--format=%h%x09%ad%x09%s", "--max-count=400",
    ]);
    const commits = parseLogLines(log.stdout);
    if (commits.length === 0) continue;
    const merged = run(repo, ["merge-base", "--is-ancestor", branch, "main"]).status === 0;
    const wt = byBranch.get(branch) ?? null;
    totalCommits += commits.length;
    branches.push({
      branch,
      worktree: wt ? wt.path : null,
      mergedIntoMain: merged,
      total: commits.length,
      lastAt: commits[0]?.ad ?? null,
      lastMs: parseAnyIso(commits[0]?.ad ?? ""),
      commits: commits.slice(0, 8).map((c) => ({ h: c.h, ad: c.ad, s: c.s })),
    });
  }
  branches.sort((a, b) => (b.lastMs ?? 0) - (a.lastMs ?? 0));
  return { repo, sinceDate, branches, totalCommits, worktreeCount: worktrees.length };
}

/** Ejecución real de git: stdout aunque el exit sea 1 (merge-base la usa). */
function defaultExec(repo, args) {
  const res = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 20_000, maxBuffer: 8 << 20 });
  return { stdout: res.stdout ?? "", status: res.status ?? (res.error ? 1 : 0) };
}

/** Ramas anotadas con el registro de worktrees (encargo, puerto, proyecto). */
export function annotateBranchesWithRegistry(git, registry) {
  const map = registry && typeof registry === "object" ? registry.worktrees : null;
  const regByBranch = new Map(
    Object.values(map ?? {}).map((w) => [w.branch, w]),
  );
  return {
    ...git,
    branches: git.branches.map((b) => {
      const reg = regByBranch.get(b.branch);
      return reg
        ? { ...b, encargo: reg.encargo ?? null, port: reg.port || null }
        : { ...b, encargo: null, port: null };
    }),
  };
}

// — Sesiones (captura en generación; el HTML refresca en vivo) —

export async function snapshotSessions(baseUrl, nowMs) {
  const base = baseUrl.replace(/\/$/, "");
  try {
    const [runningRes, sessionsRes] = await Promise.all([
      fetch(`${base}/api/agent/running`, { cache: "no-store", signal: AbortSignal.timeout(4000) }),
      fetch(`${base}/api/sessions`, { cache: "no-store", signal: AbortSignal.timeout(6000) }),
    ]);
    if (!runningRes.ok || !sessionsRes.ok) throw new Error(`HTTP ${runningRes.status}/${sessionsRes.status}`);
    const running = await runningRes.json();
    const all = await sessionsRes.json();
    const list = Array.isArray(all?.sessions) ? all.sessions : [];
    const runningIds = new Set([...(running.runningSessionIds ?? []), ...(running.awaitingInputSessionIds ?? [])]);
    const items = list
      .filter((s) => runningIds.has(s.id))
      .map((s) => ({
        id: s.id,
        titulo: String(s.firstMessage ?? s.title ?? "").trim(),
        cwd: s.cwd ?? null,
        modified: s.modified ?? null,
        modifiedMs: parseAnyIso(s.modified ?? ""),
      }))
      .sort((a, b) => (b.modifiedMs ?? 0) - (a.modifiedMs ?? 0));
    return {
      snapshotAt: new Date(nowMs).toISOString(),
      runningCount: (running.runningSessionIds ?? []).length,
      awaitingCount: (running.awaitingInputSessionIds ?? []).length,
      items,
    };
  } catch (error) {
    return { snapshotAt: new Date(nowMs).toISOString(), runningCount: 0, awaitingCount: 0, items: [], error: String(error?.message ?? error) };
  }
}

// — Panel HTML —

/** Escape HTML de texto y atributos. */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** JSON seguro para incrustar en <script type="application/json">. */
export function escapeJsonForScript(json) {
  return JSON.stringify(json)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function dateShort(iso) {
  const ms = parseAnyIso(iso ?? "");
  if (ms === null) return "";
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function sessionLink(id, label) {
  if (!id) return null;
  return `<a class="slink" href="/?session=${encodeURIComponent(id)}" target="_top" rel="noopener">${esc(label ?? "sesión")}</a>`;
}

const EXO_BRANCH_TOP = 10;
const ENCARGO_TOP = 12;
const PROPUESTA_TOP = 10;

/**
 * HTML autocontenido del panel. Las secciones estáticas van pre-renderizadas
 * (legible sin JS); las sesiones activas se refrescan en vivo desde el
 * navegador con fetch same-origin a la propia UI.
 */
export function buildPanelHtml(data) {
  const { encargos, propuestas, reglas, git, sesiones } = data;
  const generado = dateShort(data.generatedAt);

  const encargoCards = encargos.recent.slice(0, ENCARGO_TOP).map((e) => `
      <article class="card">
        <div class="card-meta">
          <span class="badge cat">${esc(e.categoria || "sistema")}</span>
          <span class="muted">${esc(dateShort(e.resuelto))}</span>
          <code class="muted mono">${esc(e.id)}</code>
          <span class="spacer"></span>
          ${e.sessionId ? sessionLink(e.sessionId, "↗ sesión") : ""}
        </div>
        <div class="card-title">${esc(e.titulo || e.id)}</div>
        ${e.resumen ? `<p class="card-note">${esc(e.resumen)}</p>` : ""}
      </article>`).join("");

  const pendienteRows = encargos.pending.map((e) => `
      <div class="row">
        <span class="badge cat">${esc(e.categoria || "sistema")}</span>
        <span class="row-title">${esc(e.titulo || e.id)}</span>
        <span class="muted nowrap">${esc(dateShort(e.creado))}</span>
        ${e.sessionId ? sessionLink(e.sessionId, "↗") : ""}
      </div>`).join("");

  const branchRows = git.branches.slice(0, EXO_BRANCH_TOP).map((b) => `
      <details class="branch">
        <summary>
          <span class="row-title mono">${esc(b.branch)}</span>
          ${b.mergedIntoMain ? '<span class="badge ok">en main</span>' : '<span class="badge wip">fork</span>'}
          <span class="badge">${b.total} commits</span>
          <span class="muted nowrap">${esc(dateShort(b.lastAt))}</span>
        </summary>
        <div class="branch-body">
          ${b.worktree ? `<div class="muted mono small">📂 ${esc(b.worktree.replace(homedirSafe(), "~"))}${b.encargo ? ` · ${esc(b.encargo)}` : ""}${b.port ? ` · :${esc(b.port)}` : ""}</div>` : '<div class="muted small">sin worktree activo</div>'}
          <ul class="commits">
            ${b.commits.map((c) => `<li><code class="mono">${esc(c.h)}</code> <span class="muted nowrap">${esc(dateShort(c.ad))}</span> ${esc(c.s)}</li>`).join("")}
          </ul>
        </div>
      </details>`).join("");

  const propuestaRows = propuestas.recent.slice(0, PROPUESTA_TOP).map((p) => `
      <div class="row wraprow">
        <span class="muted nowrap">${esc(dateShort(p.resuelta))}</span>
        <span class="row-title">${esc(p.titulo || p.id)}</span>
        ${p.resolucion ? `<span class="res">${esc(p.resolucion)}</span>` : ""}
      </div>`).join("");

  const reglaRows = reglas.recent.map((r) => `
      <div class="row">
        <span class="badge num">#${r.num}</span>
        <span class="row-title">${esc(r.titulo)}</span>
        <span class="muted nowrap">${esc(r.fechas.join(" / "))}</span>
      </div>`).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Mejoras del Sistema · EXO</title>
<style>
  :root {
    --bg: #090d16; --card: #131b2e; --border: #1f2b48;
    --text: #f0f4f8; --muted: #8b9bb4; --accent: #38bdf8;
    --ok: #10b981; --warn: #f59e0b; --live: #34d399;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    -webkit-text-size-adjust: 100%;
  }
  header h1 { font-size: 19px; font-weight: 800; letter-spacing: .2px; }
  .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .pin {
    display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 700;
    color: #fbbf24; background: rgba(251,191,36,.1); border: 1px solid rgba(251,191,36,.35);
    padding: 3px 10px; border-radius: 999px;
  }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; margin: 16px 0 4px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px; }
  .kpi b { display: block; font-size: 22px; font-weight: 800; color: var(--accent); }
  .kpi span { font-size: 11px; color: var(--muted); }
  section { margin-top: 22px; }
  h2 { font-size: 14px; font-weight: 800; margin-bottom: 4px; }
  h2 .count { color: var(--muted); font-weight: 600; font-size: 12px; }
  .hint { color: var(--muted); font-size: 12px; margin-bottom: 10px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
  .card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; }
  .card-title { font-weight: 700; margin-top: 6px; overflow-wrap: anywhere; }
  .card-note { color: var(--muted); font-size: 12.5px; margin-top: 4px; overflow-wrap: anywhere; }
  .badge { display: inline-block; font-size: 10.5px; font-weight: 700; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
  .badge.cat { color: #38bdf8; border-color: rgba(56,189,248,.35); }
  .badge.ok { color: var(--ok); border-color: rgba(16,185,129,.4); }
  .badge.wip { color: var(--warn); border-color: rgba(245,158,11,.4); }
  .badge.num { color: #a78bfa; border-color: rgba(167,139,250,.4); }
  .row { display: flex; align-items: baseline; gap: 8px; padding: 7px 2px; border-bottom: 1px solid rgba(31,43,72,.6); font-size: 13px; flex-wrap: wrap; }
  .wraprow { align-items: baseline; }
  .row:last-child { border-bottom: 0; }
  .row-title { font-weight: 600; overflow-wrap: anywhere; flex: 1; min-width: 160px; }
  .res { color: var(--ok); font-size: 12.5px; flex-basis: 100%; padding-left: 2px; overflow-wrap: anywhere; }
  .muted { color: var(--muted); } .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .small { font-size: 11.5px; } .nowrap { white-space: nowrap; } .spacer { flex: 1; }
  .slink { color: var(--accent); text-decoration: none; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .slink:active { opacity: .6; }
  details.branch { border: 1px solid var(--border); border-radius: 10px; margin-bottom: 6px; background: var(--card); }
  details.branch summary { list-style: none; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding: 9px 12px; cursor: pointer; font-size: 12.5px; -webkit-tap-highlight-color: transparent; }
  details.branch summary::-webkit-details-marker { display: none; }
  details.branch[open] summary { border-bottom: 1px solid var(--border); }
  .branch-body { padding: 10px 12px; }
  ul.commits { list-style: none; margin-top: 6px; }
  ul.commits li { font-size: 12px; padding: 3px 0; color: var(--text); overflow-wrap: anywhere; display: flex; gap: 8px; align-items: baseline; }
  ul.commits code { color: var(--accent); flex-shrink: 0; }
  #sesiones .livebadge { display: none; align-items: center; gap: 6px; font-size: 11px; color: var(--live); font-weight: 800; }
  #sesiones .livebadge.on { display: inline-flex; }
  #sesiones .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--live); animation: pulse 1.6s infinite; }
  @keyframes pulse { 0% { opacity: 1 } 50% { opacity: .35 } 100% { opacity: 1 } }
  .sesrow { display: flex; align-items: baseline; gap: 8px; padding: 8px 2px; border-bottom: 1px solid rgba(31,43,72,.6); flex-wrap: wrap; }
  .ses-title { font-weight: 700; flex: 1; min-width: 160px; overflow-wrap: anywhere; }
  details.more summary { color: var(--accent); font-size: 12.5px; font-weight: 700; cursor: pointer; padding: 8px 2px; -webkit-tap-highlight-color: transparent; }
  footer { margin-top: 28px; border-top: 1px solid var(--border); padding-top: 12px; color: var(--muted); font-size: 11.5px; }
  footer code { font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
  @media (max-width: 560px) {
    .kpi b { font-size: 19px; }
    body { font-size: 13.5px; }
  }
</style>
</head>
<body>
<header>
  <h1>🛠️ Mejoras del Sistema</h1>
  <div class="sub">Qué se ha hecho y qué está en marcha · generado ${esc(generado)} UTC · ventana ${data.windowDays} días · datos reales de ledgers y git</div>
  <span class="pin">📌 candidato a fijar · regla 29</span>
</header>

<div class="kpis">
  <div class="kpi"><b>${encargos.recent.length}</b><span>encargos hechos (${data.windowDays}d)</span></div>
  <div class="kpi"><b>${git.totalCommits}</b><span>commits · ${git.branches.length} ramas</span></div>
  <div class="kpi"><b>${propuestas.recent.length}</b><span>propuestas resueltas</span></div>
  <div class="kpi"><b>${reglas.recent.length}</b><span>reglas grabadas</span></div>
  <div class="kpi"><b id="kpi-sesiones">${sesiones.runningCount}</b><span>sesiones activas ahora</span></div>
</div>

<section id="sesiones">
  <h2>⚡ Sesiones activas ahora <span class="livebadge" id="live-badge"><span class="pulse"></span>LIVE</span></h2>
  <div class="hint" id="sesiones-note">captura ${esc(clockUtc(parseAnyIso(sesiones.snapshotAt) ?? Date.now()))} UTC · refresco en vivo cada 30 s dentro de ExoHuman UI</div>
  <div id="sesiones-list"></div>
</section>

<section id="encargos">
  <h2>✅ Encargos completados <span class="count">· ${encargos.recent.length} en ${data.windowDays} días (de ${encargos.total} registrados)</span></h2>
  ${encargoCards || '<div class="hint">Sin encargos completados en la ventana.</div>'}
  ${encargos.recent.length > ENCARGO_TOP ? `<details class="more"><summary>Ver los ${encargos.recent.length - ENCARGO_TOP} restantes…</summary>${encargos.recent.slice(ENCARGO_TOP).map((e) => `
      <article class="card">
        <div class="card-meta">
          <span class="badge cat">${esc(e.categoria || "sistema")}</span>
          <span class="muted">${esc(dateShort(e.resuelto))}</span>
          <span class="spacer"></span>
          ${e.sessionId ? sessionLink(e.sessionId, "↗ sesión") : ""}
        </div>
        <div class="card-title">${esc(e.titulo || e.id)}</div>
        ${e.resumen ? `<p class="card-note">${esc(e.resumen)}</p>` : ""}
      </article>`).join("")}</details>` : ""}
</section>

<section id="enmarcha">
  <h2>🚧 En marcha <span class="count">· ${encargos.pending.length} encargos pendientes</span></h2>
  ${pendienteRows || '<div class="hint">Sin encargos pendientes.</div>'}
</section>

<section id="commits">
  <h2>🌿 Commits por rama / worktree <span class="count">· ${git.totalCommits} commits en ${git.branches.length} ramas (${data.windowDays}d)</span></h2>
  <div class="hint">exohuman-ui · «en main» = ya promocionado · «fork» = trabajo aún sin fusionar</div>
  ${branchRows || '<div class="hint">Sin commits en la ventana.</div>'}
  ${git.branches.length > EXO_BRANCH_TOP ? `<details class="more"><summary>Otras ${git.branches.length - EXO_BRANCH_TOP} ramas con actividad…</summary>${git.branches.slice(EXO_BRANCH_TOP).map((b) => `
      <details class="branch">
        <summary>
          <span class="row-title mono">${esc(b.branch)}</span>
          ${b.mergedIntoMain ? '<span class="badge ok">en main</span>' : '<span class="badge wip">fork</span>'}
          <span class="badge">${b.total} commits</span>
          <span class="muted nowrap">${esc(dateShort(b.lastAt))}</span>
        </summary>
        <div class="branch-body">
          ${b.worktree ? `<div class="muted mono small">📂 ${esc(b.worktree.replace(homedirSafe(), "~"))}${b.encargo ? ` · ${esc(b.encargo)}` : ""}</div>` : '<div class="muted small">sin worktree activo</div>'}
          <ul class="commits">
            ${b.commits.map((c) => `<li><code class="mono">${esc(c.h)}</code> <span class="muted nowrap">${esc(dateShort(c.ad))}</span> ${esc(c.s)}</li>`).join("")}
          </ul>
        </div>
      </details>`).join("")}</details>` : ""}
</section>

<section id="propuestas">
  <h2>🎯 Propuestas resueltas <span class="count">· ${propuestas.recent.length} en ${data.windowDays} días (de ${propuestas.total} registradas)</span></h2>
  ${propuestaRows || '<div class="hint">Sin propuestas resueltas en la ventana.</div>'}
  ${propuestas.recent.length > PROPUESTA_TOP ? `<details class="more"><summary>Ver las ${propuestas.recent.length - PROPUESTA_TOP} restantes…</summary>${propuestas.recent.slice(PROPUESTA_TOP).map((p) => `
      <div class="row wraprow">
        <span class="muted nowrap">${esc(dateShort(p.resuelta))}</span>
        <span class="row-title">${esc(p.titulo || p.id)}</span>
        ${p.resolucion ? `<span class="res">${esc(p.resolucion)}</span>` : ""}
      </div>`).join("")}</details>` : ""}
</section>

<section id="reglas">
  <h2>📜 Reglas grabadas <span class="count">· ${reglas.recent.length} ${reglas.fallback ? "(últimas; sin novedades en la ventana)" : `nuevas en ${data.windowDays} días (de ${reglas.total})`}</span></h2>
  ${reglaRows || '<div class="hint">Sin reglas grabadas registradas.</div>'}
</section>

<footer>
  Fuentes reales · encargos: <code>~/.local/state/encargos/ledger.json</code> · propuestas: <code>~/.local/state/proposals/ledger.json</code> · reglas: <code>~/.pi/agent/AGENTS.md</code> · git: <code>${esc(git.repo.replace(homedirSafe(), "~"))}</code> · sesiones: <code>/api/agent/running</code> + <code>/api/sessions</code><br>
  Regenerar: <code>node bin/mejoras-panel.mjs</code> · datos crudos: <a class="slink" href="data.json">data.json</a> · catálogo: candidato a fijar (regla 29)
</footer>

<script id="mejoras-sesiones" type="application/json">${escapeJsonForScript(sesiones)}</script>
<script>
(function () {
  "use strict";
  var snapshot = [];
  try { snapshot = JSON.parse(document.getElementById("mejoras-sesiones").textContent).items || []; } catch (e) {}
  var list = document.getElementById("sesiones-list");
  var note = document.getElementById("sesiones-note");
  var badge = document.getElementById("live-badge");
  var kpi = document.getElementById("kpi-sesiones");
  var origin = window.location.origin;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function title(s) {
    var t = String(s.titulo || s.id || "sesión").replace(/\\s+/g, " ").trim();
    return t.length > 110 ? t.slice(0, 109) + "…" : t;
  }
  function ago(iso) {
    var ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return "";
    var min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (min < 60) return "hace " + min + " min";
    var h = Math.round(min / 60);
    return "hace " + h + (h === 1 ? " hora" : " horas");
  }
  function render(items, live) {
    badge.classList.toggle("on", !!live);
    if (!items.length) {
      list.innerHTML = '<div class="hint">' + (live ? "Ninguna sesión activa ahora mismo." : "Sin captura de sesiones disponible.") + "</div>";
      kpi.textContent = "0";
      return;
    }
    kpi.textContent = String(items.length);
    list.innerHTML = items.map(function (s) {
      var cwd = s.cwd ? String(s.cwd).split("/").pop() : "";
      return '<div class="sesrow">' +
        '<span class="ses-title">' + esc(title(s)) + "</span>" +
        (cwd ? '<span class="badge cat">' + esc(cwd) + "</span>" : "") +
        '<span class="muted nowrap">' + esc(ago(s.modified)) + "</span>" +
        '<a class="slink" href="' + origin + "/?session=" + encodeURIComponent(s.id) + '" target="_top" rel="noopener">↗ abrir</a>' +
        "</div>";
    }).join("");
  }
  function refresh() {
    return Promise.all([
      fetch("/api/agent/running", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }),
      fetch("/api/sessions", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }),
    ]).then(function (res) {
      var running = res[0], all = res[1];
      if (!running || !all || !Array.isArray(all.sessions)) throw new Error("api");
      var ids = {};
      (running.runningSessionIds || []).concat(running.awaitingInputSessionIds || []).forEach(function (id) { ids[id] = true; });
      var items = all.sessions.filter(function (s) { return ids[s.id]; })
        .map(function (s) { return { id: s.id, titulo: s.firstMessage, cwd: s.cwd, modified: s.modified }; })
        .sort(function (a, b) { return String(b.modified || "").localeCompare(String(a.modified || "")); });
      if (items.length > 0) {
        note.textContent = "en vivo · refresco cada 30 s";
        render(items, true);
      } else if (snapshot.length > 0) {
        // La instancia que sirve este panel (pre) no reporta sesiones: las
        // sesiones viven en producción. Se mantiene la captura real de la
        // generación; servido desde producción, este panel pasa a directo.
        note.textContent = "captura de la generación · esta instancia no ejecuta las sesiones (viven en producción, que las muestra en vivo)";
        render(snapshot, false);
      } else {
        note.textContent = "en vivo · ninguna sesión activa ahora mismo";
        render([], true);
      }
    }).catch(function () {
      render(snapshot, false);
      note.textContent = "captura de la generación · sin conexión con la API (ábrelo dentro de ExoHuman UI para el directo)";
    });
  }
  render(snapshot, false);
  refresh();
  setInterval(refresh, 30000);
})();
</script>
</body>
</html>`;
}

function homedirSafe() {
  try {
    return homedir();
  } catch {
    return "/home/rgsaura";
  }
}

// — Entrada —

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

/** Localiza el panel existente (el más reciente) o devuelve null. */
export function findExistingPanelDir(root) {
  try {
    const dirs = readdirSync(root)
      .filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && name.endsWith(`-${PANEL_SLUG}`))
      .sort();
    return dirs.length > 0 ? join(root, dirs[dirs.length - 1]) : null;
  } catch {
    return null;
  }
}

export async function generate({ now = new Date(), out, baseUrl = "http://127.0.0.1:30141", dry = false } = {}) {
  const nowMs = now.getTime();
  const encargos = collectEncargos(readJson(PATHS.encargosLedger(), null), nowMs);
  const propuestas = collectPropuestas(readJson(PATHS.proposalsLedger(), null), nowMs);
  const reglas = collectReglas(readFileSync(PATHS.agentRules(), "utf8"), nowMs);
  let git = collectGitCommits({ repo: PATHS.repo(), nowMs });
  git = annotateBranchesWithRegistry(git, readJson(PATHS.worktreesRegistry(), null));
  const sesiones = await snapshotSessions(baseUrl, nowMs);

  const data = {
    panel: "Mejoras del Sistema",
    encargo: "enc-bee02de7",
    generatedAt: now.toISOString(),
    windowDays: WINDOW_DAYS,
    fuentes: {
      encargos: PATHS.encargosLedger(),
      propuestas: PATHS.proposalsLedger(),
      reglas: PATHS.agentRules(),
      git: PATHS.repo(),
      worktrees: PATHS.worktreesRegistry(),
      sesiones: `${baseUrl}/api/agent/running + /api/sessions`,
    },
    encargos,
    propuestas,
    reglas,
    git,
    sesiones,
  };

  const html = buildPanelHtml(data);
  if (dry) return { data, html, dir: null };

  const root = PATHS.panelesRoot();
  const dir = out ?? findExistingPanelDir(root) ?? join(root, `${now.toISOString().slice(0, 10)}-${PANEL_SLUG}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  writeFileSync(join(dir, "data.json"), `${JSON.stringify(data, null, 2)}\n`);

  const panelJsonPath = join(dir, "panel.json");
  const existing = readJson(panelJsonPath, null);
  const panelJson = {
    ...(existing && typeof existing === "object" ? existing : {}),
    titulo: "Mejoras del Sistema",
    tipo: "informe",
    fecha: existing?.fecha ?? dir.split("/").pop().slice(0, 10),
    resumen: "Qué se ha hecho y qué está en marcha: encargos completados, commits por rama/worktree, propuestas resueltas, reglas grabadas y sesiones activas. Datos reales de ledgers y git.",
    estado: "activo",
    fijar: "candidato",
    regla: 29,
    actualizado: now.toISOString(),
  };
  writeFileSync(panelJsonPath, `${JSON.stringify(panelJson, null, 2)}\n`);
  return { data, html, dir };
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const outFlag = args.indexOf("--out");
  const dry = args.includes("--dry");
  const jsonOnly = args.includes("--json");
  generate({ out: outFlag >= 0 ? args[outFlag + 1] : undefined, dry })
    .then(({ data, dir }) => {
      if (jsonOnly) {
        process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
        return;
      }
      const base = process.env.PANELES_BASE_URL ?? "http://exohuman.tail08ecb.ts.net:30141/api/paneles";
      console.log(`panel generado: ${dir}`);
      if (!dry && dir) {
        const slug = dir.split("/").pop();
        console.log(`url prod:      ${base}/${slug}`);
        console.log(`url pre:       http://exohuman-pre.rgsaura.com/api/paneles/${slug}`);
      }
      console.log(`encargos: ${data.encargos.recent.length} hechos · ${data.encargos.pending.length} en marcha · commits: ${data.git.totalCommits} en ${data.git.branches.length} ramas · propuestas: ${data.propuestas.recent.length} · reglas: ${data.reglas.recent.length} · sesiones: ${data.sesiones.runningCount}`);
    })
    .catch((error) => {
      console.error(`error: ${error?.stack ?? error}`);
      process.exitCode = 1;
    });
}
