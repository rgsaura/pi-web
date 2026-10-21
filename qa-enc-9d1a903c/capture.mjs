// QA visual móvil COMPLETO enc-9d1a903c — capturas de pre (:30149)
// Cobertura: TODAS las vistas del sidebar/shell + nivel 2, móvil 390x844 (iPhone) claro/oscuro
// + sanity desktop. Uso: node capture.mjs [pre|<url>]   (default pre)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'captures');
const BASE = process.argv[2] === 'pre' || !process.argv[2] ? 'http://localhost:30149'
  : process.argv[2];
const NAME = BASE.includes('30149') ? 'pre' : BASE.replace(/https?:\/\//g, '').replace(/[:\/]/g, '_');
const SESSION_ID = process.env.QA_SESSION_ID || '01a13fb2-558a-70c5-b325-48eea1d52dda';
const PANEL_SLUG = process.env.QA_PANEL_SLUG || '2026-10-20-mejoras-sistema';
const POST_ID = process.env.QA_POST_ID || 'herradura-2026';

const errors = [];
const browser = await chromium.launch();

async function nav(page, url, wait) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(wait ?? 2500);
}
async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(dir, name + '.png') });
  console.log('OK', path.basename(dir), name);
}

// ---------- MÓVIL (iPhone 390x844, táctil) claro+oscuro ----------
const MOBILE_VIEWS = [
  { name: 'home', run: async (p, d) => { await nav(p, BASE + '/', 3000); await shot(p, d, 'home'); } },
  { name: 'sidebar-open', run: async (p, d) => {
    await nav(p, BASE + '/', 3000);
    await p.locator('button[aria-label*="sidebar" i]').first().click({ timeout: 8000 });
    await p.waitForTimeout(1800); await shot(p, d, 'sidebar-open'); } },
  { name: 'sidebar-proyectos', run: async (p, d) => {
    await nav(p, BASE + '/', 3000);
    await p.locator('button[aria-label*="sidebar" i]').first().click({ timeout: 8000 });
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /proyectos/i }).first().click({ timeout: 6000 });
    await p.waitForTimeout(2200); await shot(p, d, 'sidebar-proyectos'); } },
  { name: 'sidebar-envivo', run: async (p, d) => {
    await nav(p, BASE + '/', 3000);
    await p.locator('button[aria-label*="sidebar" i]').first().click({ timeout: 8000 });
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /en vivo/i }).first().click({ timeout: 6000 });
    await p.waitForTimeout(1800); await shot(p, d, 'sidebar-envivo'); } },
  { name: 'session', run: async (p, d) => { await nav(p, BASE + `/?session=${SESSION_ID}`, 5000); await shot(p, d, 'session'); } },
  { name: 'session-scrolled', run: async (p, d) => {
    await nav(p, BASE + `/?session=${SESSION_ID}`, 5000);
    for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 800); await p.waitForTimeout(220); }
    await p.waitForTimeout(900); await shot(p, d, 'session-scrolled'); } },
  { name: 'timeline', run: async (p, d) => { await nav(p, BASE + '/?view=timeline', 3500); await shot(p, d, 'timeline'); } },
  { name: 'timeline-patrones', run: async (p, d) => {
    await nav(p, BASE + '/?view=timeline', 3500);
    await p.getByRole('button', { name: /patrones/i }).first().click({ timeout: 6000 });
    await p.waitForTimeout(2000); await shot(p, d, 'timeline-patrones'); } },
  { name: 'proposals', run: async (p, d) => { await nav(p, BASE + '/?view=proposals', 3500); await shot(p, d, 'proposals'); } },
  { name: 'encargos', run: async (p, d) => { await nav(p, BASE + '/?view=encargos', 3500); await shot(p, d, 'encargos'); } },
  { name: 'activity', run: async (p, d) => { await nav(p, BASE + '/?view=activity', 3500); await shot(p, d, 'activity'); } },
  { name: 'workspaces', run: async (p, d) => { await nav(p, BASE + '/?view=workspaces', 3500); await shot(p, d, 'workspaces'); } },
  { name: 'paneles', run: async (p, d) => { await nav(p, BASE + '/?view=paneles', 3500); await shot(p, d, 'paneles'); } },
  { name: 'panel-detail', run: async (p, d) => { await nav(p, BASE + `/?view=paneles&panel=${PANEL_SLUG}`, 5000); await shot(p, d, 'panel-detail'); } },
  { name: 'agents', run: async (p, d) => { await nav(p, BASE + '/?view=agents', 3500); await shot(p, d, 'agents'); } },
  { name: 'post-studio', run: async (p, d) => { await nav(p, BASE + '/?view=post-studio', 5000); await shot(p, d, 'post-studio'); } },
  { name: 'post-detail', run: async (p, d) => { await nav(p, BASE + `/?view=post-studio&post=${POST_ID}`, 6000); await shot(p, d, 'post-detail'); } },
  { name: 'settings-open', run: async (p, d) => {
    await nav(p, BASE + '/', 3000);
    await p.locator('button[aria-label*="sidebar" i]').first().click({ timeout: 8000 });
    await p.waitForTimeout(1500);
    await p.locator('button[aria-label*="ettings" i], button[title*="ettings" i]').first().click({ timeout: 6000 });
    await p.waitForTimeout(2000); await shot(p, d, 'settings-open'); } },
];

for (const theme of ['dark', 'light']) {
  const dir = path.join(OUT, NAME, `mobile-${theme}`);
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true,
  });
  await ctx.addInitScript(t => localStorage.setItem('pi-theme', t), theme);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push({ combo: `mobile-${theme}`, type: 'pageerror', msg: String(e).slice(0, 300) }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ combo: `mobile-${theme}`, type: 'console', msg: m.text().slice(0, 300) }); });
  for (const v of MOBILE_VIEWS) {
    try { await v.run(page, dir); }
    catch (e) { console.log('FAIL', `mobile-${theme}`, v.name, String(e).split('\n')[0].slice(0, 140)); }
  }
  await ctx.close();
}

// ---------- DESKTOP sanity (1440x900, dark) ----------
{
  const dir = path.join(OUT, NAME, 'desktop-dark');
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.setItem('pi-theme', 'dark'));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push({ combo: 'desktop-dark', type: 'pageerror', msg: String(e).slice(0, 300) }));
  const DV = {
    home: '/', session: `/?session=${SESSION_ID}`, proposals: '/?view=proposals',
    paneles: '/?view=paneles', timeline: '/?view=timeline', encargos: '/?view=encargos',
  };
  for (const [name, url] of Object.entries(DV)) {
    try { await nav(page, BASE + url, name === 'session' ? 5000 : 3000); await shot(page, dir, name); }
    catch (e) { console.log('FAIL', 'desktop-dark', name, String(e).split('\n')[0].slice(0, 140)); }
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, NAME, 'console-errors.json'), JSON.stringify(errors, null, 2));
console.log('TOTAL ERRORES CONSOLA/PAGEERROR:', errors.length);
