// ActivityView end-to-end check against a production build, with the real
// host sources (systemctl, ps, herdr). Read-only. Usage: node e2e/activity-check.mjs
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/activity-check");
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
  // The API needs the user's session bus and PATH for herdr.
  const env = {
    ...process.env,
    PI_WEB_PASSWORD: "",
    NEXT_TELEMETRY_DISABLED: "1",
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? "unix:path=/run/user/1000/bus",
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "/run/user/1000",
  };
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });

  const deadline = Date.now() + 120_000;
  while (true) {
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) break;
    if (Date.now() > deadline) throw new Error("Server never became ready");
    await new Promise((r) => setTimeout(r, 500));
  }

  // API shape first.
  const data = await (await fetch(`${base}/api/system-map`)).json();
  assert.ok(data.capturedAt, "capturedAt present");
  assert.deepEqual(data.channels.map((channel) => channel.id), ["rot", "voz", "facesearch"]);
  assert.ok(data.channels.every((channel) => ["active", "inactive", "failed", "unknown"].includes(channel.state)));
  assert.ok(Array.isArray(data.piSessions));
  // enc-aca74f1f: every session row says whether it is an encargo/interactive
  // session (work) or a background routine, so the view can group them.
  assert.ok(data.piSessions.every((s) => ["work", "routine"].includes(s.kind ?? "work")));
  assert.ok(Array.isArray(data.herdrAgents));
  assert.ok(Array.isArray(data.timers) && data.timers.length > 0, "timers listed");
  assert.ok(data.timers.every((timer) => /^(rg|rot)-/.test(timer.unit)));
  console.log(`api: channels=${data.channels.map((c) => `${c.id}:${c.state}`).join(",")} · pi=${data.piSessions.length} · herdr=${data.herdrAgents.length} (${data.herdrAgents.filter((a) => a.status === "working").length} working) · timers=${data.timers.length}`);

  // UI: open the Activity view from the sidebar entry.
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`[console.error] ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1500);
  const activityButton = page.getByRole("button", { name: "Actividad del sistema" }).first();
  await activityButton.waitFor({ state: "visible", timeout: 30_000 });
  await activityButton.click();

  await page.waitForSelector('section[aria-label="Canales"]', { timeout: 30_000 });
  await page.waitForSelector('section[aria-label="Rutinas y timers"]', { timeout: 30_000 });
  await page.waitForTimeout(800);

  const audit = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return {
      live: text.includes("en vivo"),
      channels: ["rot", "voz", "facesearch"].every((label) => text.includes(label)),
      greenDots: document.querySelectorAll('span[style*="rgb(22, 163, 74)"], span[style*="#16a34a"]').length,
      piSection: text.includes("sesiones pi ·"),
      herdrSection: text.includes("herdr ·") && text.includes("trabajando"),
      timersSection: text.includes("rutinas ·") && text.includes(" timers"),
      timerRows: [...document.querySelectorAll('section[aria-label="Rutinas y timers"] > div > div')].length,
      countdowns: (text.match(/en \d+ (s|min|h)/g) ?? []).length,
    };
  });
  console.log(JSON.stringify(audit));
  assert.ok(audit.live && audit.channels && audit.greenDots >= 3, "channels render with live dots");
  assert.ok(audit.piSection && audit.herdrSection && audit.timersSection, "all four sections render");
  assert.ok(audit.timerRows >= 3, "timer rows render");
  await page.screenshot({ path: join(artifacts, "01-activity.png") });

  // Esc returns to the chat.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  assert.ok(!(await page.locator('section[aria-label="Canales"]').count()), "Esc closed the view");

  console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join("\n")}` : "NO CONSOLE PROBLEMS");
  if (problems.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
}
