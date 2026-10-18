// Mobile portrait (390x844) audit: sidebar strip, the three full views, and
// no horizontal overflow anywhere. Read-only. Usage: node e2e/mobile-check.mjs
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const artifacts = join(root, "test-results/mobile-check");
mkdirSync(artifacts, { recursive: true });

let server;
let browser;
const problems = [];
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
    stdio: ["ignore", "ignore", "ignore"],
  });
  const deadline = Date.now() + 120_000;
  while (true) {
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) break;
    if (Date.now() > deadline) throw new Error("Server never became ready");
    await new Promise((r) => setTimeout(r, 500));
  }

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`[console.error] ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`[pageerror] ${error.message}`));

  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // 1. Main chat loads; no horizontal scroll.
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log("chat overflow px:", await overflow());
  await page.screenshot({ path: join(artifacts, "01-chat.png") });

  // 2. On phones the sidebar is an off-canvas drawer: open it, then the
  //    system strip (Actividad, Workspaces, Decisiones) sits under the header.
  await page.getByRole("button", { name: "Show sidebar" }).first().click();
  await page.waitForTimeout(800);
  const strip = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      actividad: text.includes("Actividad"),
      workspaces: text.includes("Workspaces"),
      decisiones: text.includes("Decisiones"),
      drawerOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  console.log("sidebar strip:", JSON.stringify(strip));
  await page.screenshot({ path: join(artifacts, "02-sidebar.png") });

  const views = [
    ["actividad", "Actividad del sistema", 'section[aria-label="Canales"]'],
    ["workspaces", "Workspaces", "text=Proyectos"],
    ["decisiones", /^Decisiones/, "article h2"],
  ];
  // 3. The three full views, one by one.
  for (const [name, selector, ready] of views) {
    const button = page.getByRole("button", { name: selector }).first();
    await button.click();
    await page.locator(ready).first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(600);
    const px = await overflow();
    console.log(`${name}: overflow px ${px}`);
    if (px > 1) problems.push(`[overflow] ${name} scrolls ${px}px sideways`);
    await page.screenshot({ path: join(artifacts, `03-${name}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }

  console.log(problems.length ? `PROBLEMS (${problems.length}):\n${problems.join("\n")}` : "NO MOBILE PROBLEMS");
  if (problems.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
}
