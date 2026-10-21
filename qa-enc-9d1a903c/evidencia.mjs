// Evidencia enc-9d1a903c — capturas de ELEMENTO exactos (antes=pre:30149, después=fork:30154)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'evidence');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  {
    name: 'panel-detail-header',
    url: (base) => `${base}/?view=paneles&panel=2026-10-20-mejoras-sistema`,
    pick: async (p) => p.locator('h1').first().locator('xpath=ancestor::header').first(),
    wait: 5000,
  },
  {
    name: 'pills-secciones',
    url: (base) => `${base}/`,
    open: async (p) => { await p.locator('button[aria-label*="sidebar" i]').first().click(); await p.waitForTimeout(1600); },
    pick: async (p) => p.locator('[aria-label="Subsección del sistema"]').first(),
    wait: 3000,
  },
  {
    name: 'buscador',
    url: (base) => `${base}/`,
    open: async (p) => { await p.locator('button[aria-label*="sidebar" i]').first().click(); await p.waitForTimeout(1600); },
    pick: async (p) => p.locator('input[aria-label="Buscar sesiones, encargos y proyectos"]').first(),
    wait: 3000,
  },
  {
    name: 'activity-header',
    url: (base) => `${base}/?view=activity`,
    pick: async (p) => p.locator('h1, h2').first().locator('xpath=ancestor::div[1]'),
    wait: 3500,
  },
  {
    name: 'encargos-header',
    url: (base) => `${base}/?view=encargos`,
    pick: async (p) => p.locator('h1, h2').first().locator('xpath=ancestor::header | ancestor::div[2]').first(),
    wait: 3500,
  },
];

const browser = await chromium.launch();
for (const [label, base] of [['antes', 'http://localhost:30149'], ['despues', 'http://localhost:30154']]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const shot of SHOTS) {
    try {
      await page.goto(shot.url(base), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(shot.wait);
      if (shot.open) await shot.open(page);
      const el = await shot.pick(page);
      await el.waitFor({ state: 'visible', timeout: 8000 });
      await el.screenshot({ path: path.join(OUT, `${label}-${shot.name}.png`) });
      console.log('OK', label, shot.name);
    } catch (e) { console.log('FAIL', label, shot.name, String(e).split('\n')[0].slice(0, 90)); }
  }
  await ctx.close();
}
await browser.close();
