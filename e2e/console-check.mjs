// Console-error smoke check against a production build (`E2E_SERVER_MODE=start`).
// Usage: node e2e/console-check.mjs
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/console-check");
mkdirSync(artifacts, { recursive: true });
const agentDir = mkdtempSync(join(tmpdir(), "pi-web-console-"));
const project = join(agentDir, "project");
const sessionDir = join(agentDir, "sessions", "e2e");
mkdirSync(project, { recursive: true });
mkdirSync(sessionDir, { recursive: true });
const timestamp = "2026-08-23T00:00:00.000Z";
writeFileSync(join(sessionDir, "2026-08-23T00-00-00-000Z_console-check.jsonl"), [
  JSON.stringify({ type: "session", version: 3, id: "console-check", timestamp, cwd: project }),
  JSON.stringify({ type: "message", id: "u0", parentId: null, timestamp, message: { role: "user", content: "Console check" } }),
  JSON.stringify({ type: "message", id: "a0", parentId: "u0", timestamp, message: { role: "assistant", content: [{ type: "text", text: "Console check reply" }] } }),
].join("\n") + "\n");

let server;
let browser;
const serverLog = createWriteStream(join(artifacts, "server.log"));
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
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });

  const deadline = Date.now() + 120_000;
  while (true) {
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) break;
    if (Date.now() > deadline) throw new Error("Server never became ready; see server.log");
    await new Promise((r) => setTimeout(r, 500));
  }

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`[console.error] ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED")) return; // aborted navigations are normal
    problems.push(`[requestfailed] ${request.method()} ${request.url()} ${failure}`);
  });

  await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);
  // Open a session to exercise the chat view.
  const row = page.locator("[data-row-key]").first();
  if (await row.count()) await row.click();
  await page.waitForTimeout(2500);

  console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join("\n")}` : "NO CONSOLE PROBLEMS");
  process.exitCode = problems.length ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
}
