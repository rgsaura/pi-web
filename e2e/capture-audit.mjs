import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/home/rgsaura/workspaces/wt-piweb-brand/test-results/audit";
mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await chromium.launch();

  // Desktop context
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktopPage = await desktopCtx.newPage();
  await desktopPage.goto("http://127.0.0.1:30205/?session=2026-10-15T03-52-01-004Z_herradura-collect", { waitUntil: "domcontentloaded", timeout: 30000 });
  await desktopPage.waitForTimeout(2000);
  await desktopPage.screenshot({ path: `${outDir}/desktop-dark-session.png` });

  // Open Actividad view on desktop
  const actBtn = desktopPage.locator('button[aria-label="Actividad del sistema"]');
  if (await actBtn.count() > 0) {
    await actBtn.click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `${outDir}/desktop-dark-actividad.png` });
    await desktopPage.keyboard.press("Escape");
  }

  // Open Workspaces on desktop
  const wsBtn = desktopPage.locator('button[aria-label="Workspaces"]');
  if (await wsBtn.count() > 0) {
    await wsBtn.click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `${outDir}/desktop-dark-workspaces.png` });
    await desktopPage.keyboard.press("Escape");
  }

  // Open Decisiones on desktop
  const decBtn = desktopPage.locator('button[aria-label^="Decisiones"]');
  if (await decBtn.count() > 0) {
    await decBtn.click();
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: `${outDir}/desktop-dark-decisiones.png` });
    await desktopPage.keyboard.press("Escape");
  }

  // Mobile iPhone context
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto("http://127.0.0.1:30205/?session=2026-10-15T03-52-01-004Z_herradura-collect", { waitUntil: "domcontentloaded", timeout: 30000 });
  await mobilePage.waitForTimeout(2000);
  await mobilePage.screenshot({ path: `${outDir}/mobile-dark-chat.png` });

  // Open sidebar drawer on mobile
  const showSidebar = mobilePage.getByRole("button", { name: "Show sidebar" }).first();
  if (await showSidebar.count() > 0) {
    await showSidebar.click();
    await mobilePage.waitForTimeout(800);
    await mobilePage.screenshot({ path: `${outDir}/mobile-dark-sidebar.png` });
  }

  await browser.close();
  console.log("Audit screenshots completed!");
}

run().catch(console.error);
