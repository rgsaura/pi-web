import { chromium } from "playwright";
import fs from "node:fs";
const OUT = "qa-enc-ebe31041/captures";
const errors = [];
const COMBOS = [
  { name: "desktop", width: 1440, height: 900, dsf: 1, mobile: false },
  { name: "mobile", width: 390, height: 844, dsf: 2, mobile: true },
];
const SECTIONS = [
  { suffix: "", re: null },
  { suffix: "-musica", re: /MÚSICA REAL|MÚSICA/i },
  { suffix: "-validacion", re: /VALIDACIÓN VISUAL/i },
  { suffix: "-slides", re: /SELECCIÓN|SLIDES/i },
];
const browser = await chromium.launch();
for (const combo of COMBOS) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: combo.width, height: combo.height },
      deviceScaleFactor: combo.dsf, isMobile: combo.mobile, hasTouch: combo.mobile, reducedMotion: "reduce",
    });
    await ctx.addInitScript((t) => localStorage.setItem("pi-theme", t), theme);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${combo.name}-${theme}: ${String(e).slice(0, 150)}`));
    await page.goto("http://localhost:30146/?view=post-studio&post=herradura-2026", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("text=La Herradura", { timeout: 45000 });
    await page.waitForTimeout(4000);
    for (const sec of SECTIONS) {
      if (sec.re) {
        const el = page.locator(`text=${sec.re}`).first();
        if (!(await el.count())) { console.log("skip (no section)", sec.suffix); continue; }
        await el.scrollIntoViewIfNeeded({ timeout: 15000 }).catch(() => console.log("no-scroll", sec.suffix));
        await page.waitForTimeout(900);
      }
      await page.screenshot({ path: `${OUT}/${combo.name}-${theme}${sec.suffix}.png`, animations: "disabled", timeout: 30000 });
      console.log("OK", `${combo.name}-${theme}${sec.suffix}`);
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(`${OUT}/js-errors.json`, JSON.stringify(errors, null, 1));
console.log("errores JS:", errors.length ? JSON.stringify(errors) : "ninguno");
