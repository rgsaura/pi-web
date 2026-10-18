// ExoProposalsView end-to-end check against a production build.
// The resolve POST is mocked at the browser level (EXO's ledger is never written);
// reads use the real EXO instance. Usage: node e2e/proposals-check.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/proposals-check");
mkdirSync(artifacts, { recursive: true });

let server;
let browser;
const interrupt = () => {
  process.exitCode = 1;
  server?.kill("SIGTERM");
  void browser?.close().catch(() => {});
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.pipe(process.stderr, { end: false });

  const deadline = Date.now() + 120_000;
  while (true) {
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) break;
    if (Date.now() > deadline) throw new Error("Server never became ready");
    await new Promise((r) => setTimeout(r, 500));
  }

  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const txt = message.text();
      if (!txt.includes("status of 409")) {
        problems.push(`[console.error] ${txt}`);
      }
    }
  });
  page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2000);

  // Open the Decisiones view from the sidebar entry.
  const proposalsButton = page.getByRole("button", { name: /^Decisiones/ }).first();
  await proposalsButton.waitFor({ state: "visible", timeout: 30_000 });
  await proposalsButton.click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(artifacts, "01-inbox.png"), fullPage: false });

  // The view must show real EXO proposals: title + status chip + option buttons.
  const statusChip = page.locator("article span", { hasText: /Por decidir|Decidida|Respondida|Aceptada|Rechazada/ }).first();
  await statusChip.waitFor({ state: "visible", timeout: 30_000 });
  const title = await page.locator("article h2").first().innerText();
  assert.ok(title.trim().length > 0, "a proposal title renders");
  const optionButtons = page.locator("article button[aria-pressed]");
  const optionCount = await optionButtons.count();
  assert.ok(optionCount > 0, "options render as big buttons");
  console.log(`proposal: "${title.slice(0, 60)}" · ${optionCount} options`);

  // Mock the resolve POST: first a success receipt, then a 409 "changed".
  let resolveMode = "success";
  let resolveCalls = 0;
  let dataReads = 0;
  await page.route("**/api/exo/resolve", async (route) => {
    resolveCalls++;
    const body = route.request().postDataJSON();
    if (resolveMode === "success") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, receipt: { requestId: "test-request", caseId: body.proposalId, optionId: body.optionId, replayed: false } }),
      });
    } else {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: { kind: "changed", code: "PROPOSAL_CHOICE_STALE" } }),
      });
    }
  });
  await page.route("**/api/exo/data", async (route) => {
    dataReads++;
    await route.continue();
  });

  // Click option A: shows toast with undo, auto-advances or resolves.
  const before = dataReads;
  await optionButtons.first().click();
  await page.waitForSelector("text=Decisión registrada", { timeout: 15_000 });
  await page.waitForTimeout(5500); // Wait for 5s undo timer to trigger actual POST
  assert.equal(resolveCalls, 1, "exactly one resolve POST was made after timer");
  assert.ok(dataReads > before, "data was refreshed after the resolve");
  await page.screenshot({ path: join(artifacts, "02-resolved.png") });

  // A stale pick: the changed message shows and data refreshes.
  resolveMode = "changed";
  const beforeChanged = dataReads;
  // Move to another proposal (next) so the sent receipt is not in the way.
  await page.getByRole("button", { name: /Siguiente/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  const nextOptions = page.locator("article button[aria-pressed]");
  if (await nextOptions.count() > 0) {
    await nextOptions.first().click();
    await page.waitForSelector("text=La decisión cambió en origen", { timeout: 15_000 });
    assert.ok(dataReads > beforeChanged, "data was refreshed after the 409");
  }
  await page.screenshot({ path: join(artifacts, "03-changed.png") });

  console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join("\n")}` : "NO CONSOLE PROBLEMS");
  if (problems.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
}
