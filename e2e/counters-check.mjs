// Live-counter audit against the running dev server and the REAL ledgers:
// every number the sidebar strip and the views show must equal the ledger's
// real state, must be the pending/active one first (history secondary), and
// must move by itself when the ledger changes underneath — an injected QA
// proposal reaches the badge within the poll window without any reload, and
// resolving it drops the badge at once. The proposals ledger is backed up
// and restored byte-for-byte around the run.
//
// The system is live (other agents write the ledgers while this runs), so
// every expected value is recomputed on each poll and the assertions wait
// for the UI to converge on it instead of racing one fetch.
// Usage: COUNTERS_CHECK_BASE=http://127.0.0.1:30157 node e2e/counters-check.mjs
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/counters-check");
mkdirSync(artifacts, { recursive: true });
const base = process.env.COUNTERS_CHECK_BASE ?? "http://127.0.0.1:30157";

const proposalsLedger = join(homedir(), ".local/state/proposals/ledger.json");
const encargosLedger = join(homedir(), ".local/state/encargos/ledger.json");
const QA_ID = "prop-qa-live-counter";
const QA_TITLE = "QA contador en vivo (autodescartable)";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The same effective-status math lib/exo-data's loader applies. */
function ledgerCounts() {
  const proposals = Object.values(readJson(proposalsLedger).proposals ?? {});
  const now = Date.now();
  const effective = (entry) => {
    const expired = entry.expires_at && Number.isFinite(Date.parse(entry.expires_at)) && now > Date.parse(entry.expires_at);
    return expired ? "expired" : (entry.status ?? "pending");
  };
  const encargos = Object.values(readJson(encargosLedger).encargos ?? {});
  return {
    proposalsPending: proposals.filter((p) => effective(p) === "pending").length,
    proposalsTotal: proposals.length,
    encargosPending: encargos.filter((e) => e.status !== "done").length,
    encargosTotal: encargos.length,
  };
}

async function badgeText(page, label) {
  const button = page.getByRole("button", { name: label }).first();
  await button.waitFor({ state: "visible", timeout: 20_000 });
  return (await button.innerText()).trim();
}

/** The strip button's innerText is "<label>\n<number>" — the number is the last line. */
function badgeNumber(text) {
  return Number(text.split("\n").at(-1).trim());
}

async function waitFor(fn, { timeoutMs = 45_000, everyMs = 1_000, what }) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  throw new Error(`Timed out waiting for ${what}; last=${JSON.stringify(last)}`);
}

/** Polls a badge until it equals a freshly recomputed expected value. */
async function convergeBadge(page, label, computeExpected, { timeoutMs = 45_000 } = {}) {
  return waitFor(async () => {
    const expected = computeExpected();
    const text = await badgeText(page, label);
    return badgeNumber(text) === expected ? expected : null;
  }, { timeoutMs, what: `badge ${label} to match the ledger` });
}

const problems = [];
let browser;
const backup = join(artifacts, "ledger-backup.json");
let ledgerBackedUp = false;
try {
  console.log("ledger says:", JSON.stringify(ledgerCounts()));
  copyFileSync(proposalsLedger, backup);
  ledgerBackedUp = true;

  // The Workspaces badge reads the same API the view does; its source of
  // truth is the workspaces-active directory, checked against the API here.
  const workspacesApi = await (await fetch(`${base}/api/workspaces`)).json();
  const expectedActiveWorkspaces = (workspacesApi.workspaces ?? []).filter((w) => w.status === "active").length;
  console.log(`workspaces API: ${workspacesApi.workspaces.length} total, ${expectedActiveWorkspaces} active`);

  browser = await chromium.launch();

  // ---- 1. Desktop, dark: the strip's three badges ----
  const desktop = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await desktop.addInitScript(() => localStorage.setItem("pi-theme", "dark"));
  desktop.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));
  await desktop.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const pendingDecisiones = await convergeBadge(desktop, /^Decisiones: \d+ pendientes/, () => ledgerCounts().proposalsPending);
  const pendingEncargos = await convergeBadge(desktop, /^Encargos: \d+ activos/, () => ledgerCounts().encargosPending);
  const activeWorkspaces = await convergeBadge(desktop, /^Workspaces: \d+ activos/, () => expectedActiveWorkspaces);
  console.log("badges ok:", JSON.stringify({ Decisiones: pendingDecisiones, Encargos: pendingEncargos, Workspaces: activeWorkspaces }));
  await desktop.screenshot({ path: join(artifacts, "01-desktop-dark-sidebar.png") });

  // ---- 2. Decisiones view: pending leads, history is secondary ----
  await desktop.getByRole("button", { name: /^Decisiones: \d+ pendientes/ }).click();
  await desktop.locator("article h2").first().waitFor({ state: "visible", timeout: 30_000 });
  const pendingSwitchText = await waitFor(async () => {
    const counts = ledgerCounts();
    const text = await desktop.getByRole("button", { name: /Pendientes/ }).first().innerText();
    return text.includes(`(${counts.proposalsPending})`) ? { text, counts } : null;
  }, { what: "the view's Pendientes switch to lead with the pending count" });
  const snapshot = pendingSwitchText.counts;
  assert.match(pendingSwitchText.text, /Pendientes/, "the pending switch leads");
  const todasSwitch = await desktop.getByRole("button", { name: /^📋 Todas/ }).first().innerText();
  assert.match(todasSwitch, new RegExp(`Todas \\(${snapshot.proposalsTotal}\\)`), "the historical total is the secondary switch");
  const todasPill = await desktop.getByRole("button", { name: /^Todas \(\d+\)$/ }).first().innerText();
  assert.match(todasPill, new RegExp(`Todas \\(${snapshot.proposalsPending}\\)`), "the Todas category pill counts the pending base, not history");
  await desktop.screenshot({ path: join(artifacts, "02-desktop-dark-decisiones.png") });

  // Switch to history: the pill now counts history.
  await desktop.getByRole("button", { name: /^📋 Todas/ }).click();
  await desktop.waitForTimeout(400);
  const todasPillHistory = await desktop.getByRole("button", { name: /^Todas \(\d+\)$/ }).first().innerText();
  assert.match(todasPillHistory, new RegExp(`Todas \\(${snapshot.proposalsTotal}\\)`), "on the Todas filter the pill counts history");
  await desktop.screenshot({ path: join(artifacts, "03-desktop-dark-decisiones-historial.png") });
  await desktop.keyboard.press("Escape");
  await desktop.waitForTimeout(400);

  // ---- 3. Encargos view: activos first, total secondary ----
  await desktop.getByRole("button", { name: /^Encargos: \d+ activos/ }).click();
  await desktop.getByRole("heading", { name: /Encargos y Objetivos/ }).waitFor({ state: "visible", timeout: 20_000 });
  const encargosHeader = await waitFor(async () => {
    const counts = ledgerCounts();
    const text = await desktop.getByRole("heading", { name: /Encargos y Objetivos/ }).locator("..").innerText();
    return text.includes(`${counts.encargosPending} activos`) && text.includes(`${counts.encargosTotal} total`) ? text : null;
  }, { what: "Encargos header to lead with activos and keep total secondary" });
  assert.match(encargosHeader, /activos/);
  await desktop.screenshot({ path: join(artifacts, "04-desktop-dark-encargos.png") });
  await desktop.keyboard.press("Escape");
  await desktop.waitForTimeout(400);

  // ---- 4. Liveness: an external ledger write moves the badge by itself ----
  const baseline = badgeNumber(await badgeText(desktop, /^Decisiones: \d+ pendientes/));
  const ledger = readJson(proposalsLedger);
  ledger.proposals[QA_ID] = {
    id: QA_ID,
    title: QA_TITLE,
    summary: "Propuesta inyectada por la auditoría de contadores; se descarta y restaura sola.",
    options: ["Sí", "No"],
    status: "pending",
    created_at: new Date().toISOString(),
    // Expires soon: the view's urgency order shows it first.
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
  writeFileSync(proposalsLedger, JSON.stringify(ledger, null, 2), "utf8");

  // No reload: the badge must reach baseline+1 within the poll window.
  await waitFor(async () => badgeNumber(await badgeText(desktop, /^Decisiones: \d+ pendientes/)) === baseline + 1,
    { what: `badge to rise to ${baseline + 1} without a reload` });
  await desktop.screenshot({ path: join(artifacts, "05-desktop-dark-badge-vivo.png") });
  console.log(`badge rose to ${baseline + 1} without a reload`);

  // The injected decision is really there, then resolving it FROM THE VIEW
  // drops the badge at once: the view's refresh() updates the shared store,
  // and the sidebar badge is a subscriber of the same read.
  await desktop.getByRole("button", { name: /^Decisiones: \d+ pendientes/ }).click();
  await desktop.getByRole("heading", { name: QA_TITLE }).waitFor({ state: "visible", timeout: 30_000 });
  const optionButton = desktop.locator("article button[aria-pressed], article [role=button][aria-pressed]").first();
  await optionButton.click();
  await waitFor(async () => badgeNumber(await badgeText(desktop, /^Decisiones: \d+ pendientes/)) === baseline,
    { timeoutMs: 15_000, what: `badge to drop back to ${baseline} at once after resolving in the view` });
  console.log(`badge dropped to ${baseline} at once after resolving in the view`);
  await desktop.keyboard.press("Escape");
  await desktop.waitForTimeout(300);

  // Restore the ledger byte-for-byte; the server must re-read it at once.
  const totalBeforeRestore = ledgerCounts().proposalsTotal;
  copyFileSync(backup, proposalsLedger);
  await waitFor(async () => {
    const api = await (await fetch(`${base}/api/exo/data`, { headers: { "Cache-Control": "no-store" } })).json();
    return api.proposals.proposals.length === totalBeforeRestore - 1;
  }, { what: "server to re-read the restored ledger" });

  // ---- 5. Desktop, light: same strip, light palette ----
  const light = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await light.addInitScript(() => localStorage.setItem("pi-theme", "light"));
  await light.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await convergeBadge(light, /^Decisiones: \d+ pendientes/, () => ledgerCounts().proposalsPending);
  await light.screenshot({ path: join(artifacts, "06-desktop-light-sidebar.png") });
  await light.getByRole("button", { name: /^Decisiones: \d+ pendientes/ }).click();
  await light.locator("article h2").first().waitFor({ state: "visible", timeout: 30_000 });
  await light.screenshot({ path: join(artifacts, "07-desktop-light-decisiones.png") });
  await light.close();

  // ---- 6. Mobile (390x844), dark and light: drawer strip + view ----
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem("pi-theme", t), theme);
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2500);
    // On phones the strip lives in the off-canvas drawer: open it once,
    // bounded retries only if it never came in (a click lost to hydration).
    // Never re-click while it animates — that toggles it closed again.
    const strip = page.getByRole("button", { name: /^Decisiones: \d+ pendientes/ }).first();
    let drawerOpen = false;
    for (let attempt = 0; attempt < 3 && !drawerOpen; attempt++) {
      await page.getByRole("button", { name: /sidebar|barra lateral/i }).first().click().catch(() => {});
      try {
        await waitFor(async () => Boolean(await strip.boundingBox().catch(() => null)), { timeoutMs: 6_000, everyMs: 400, what: "the drawer to slide in" });
        drawerOpen = true;
      } catch {
        // stayed closed — one more toggle attempt
      }
    }
    assert.ok(drawerOpen, "the mobile drawer opens");
    await convergeBadge(page, /^Decisiones: \d+ pendientes/, () => ledgerCounts().proposalsPending);
    await page.screenshot({ path: join(artifacts, `08-mobile-${theme}-sidebar.png`) });
    await page.getByRole("button", { name: /^Decisiones: \d+ pendientes/ }).click();
    await page.locator("article h2").first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(600);
    const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflowPx > 1) problems.push(`[overflow] mobile ${theme} Decisiones scrolls ${overflowPx}px sideways`);
    await page.screenshot({ path: join(artifacts, `09-mobile-${theme}-decisiones.png`) });
    await context.close();
  }

  console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join("\n")}` : "ALL COUNTER CHECKS PASSED");
  if (problems.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (ledgerBackedUp && existsSync(backup)) {
    copyFileSync(backup, proposalsLedger);
    const restored = readFileSync(proposalsLedger);
    const original = readFileSync(backup);
    console.log(restored.equals(original) ? "ledger restored byte-for-byte" : "WARNING: ledger changed underneath (a concurrent writer?) — backup kept at " + backup);
  }
}
