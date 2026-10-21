// QA visual enc-919a3f1e — capturas Chrome headless de prod(:30141) y pre(:30149)
// Uso: node capture.mjs [prod|pre]  (sin arg = ambos)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'captures');
const SESSION_ID = process.env.QA_SESSION_ID || '01a13fb2-558a-70c5-b325-48eea1d52dda';

const SERVERS = [
  { name: 'prod', port: 30141 },
  { name: 'pre', port: 30149 },
].filter(s => !process.argv[2] || s.name === process.argv[2]);

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, dsf: 2 },
  { name: 'tablet', width: 820, height: 1180, dsf: 2 },
  { name: 'desktop', width: 1440, height: 900, dsf: 1 },
];

// combos: viewport x tema. El set de vistas depende del combo para mantener el total acotado.
const CORE = ['home', 'session', 'timeline', 'proposals', 'post-studio'];
const EXTRA = ['encargos', 'paneles', 'agents', 'activity'];

const VIEWS = {
  home: { path: '/' },
  session: { path: `/?session=${SESSION_ID}`, wait: 4500 },
  timeline: { path: '/?view=timeline', wait: 3500 },
  proposals: { path: '/?view=proposals', wait: 3500 },
  'post-studio': { path: '/?view=post-studio', wait: 4500 },
  encargos: { path: '/?view=encargos', wait: 3500 },
  paneles: { path: '/?view=paneles', wait: 3500 },
  agents: { path: '/?view=agents', wait: 3500 },
  activity: { path: '/?view=activity', wait: 3500 },
};

function comboPlan(vp, theme) {
  if (vp === 'desktop') return theme === 'dark' ? [...CORE, ...EXTRA] : CORE;
  if (vp === 'mobile') return theme === 'dark' ? [...CORE, ...EXTRA.slice(0, 2)] : CORE;
  return CORE; // tablet: núcleo
}

const errors = [];
const browser = await chromium.launch();
for (const server of SERVERS) {
  const base = `http://localhost:${server.port}`;
  for (const vp of VIEWPORTS) {
    for (const theme of ['dark', 'light']) {
      const dir = path.join(OUT, server.name, `${vp.name}-${theme}`);
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dsf,
        isMobile: vp.name === 'mobile',
        hasTouch: vp.name === 'mobile',
      });
      await ctx.addInitScript(t => localStorage.setItem('pi-theme', t), theme);
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push({ server: server.name, combo: `${vp.name}-${theme}`, type: 'pageerror', msg: String(e).slice(0, 300) }));
      page.on('console', m => { if (m.type() === 'error') errors.push({ server: server.name, combo: `${vp.name}-${theme}`, type: 'console', msg: m.text().slice(0, 300) }); });

      for (const viewName of comboPlan(vp.name, theme)) {
        const view = VIEWS[viewName];
        const file = path.join(dir, `${viewName}.png`);
        try {
          await page.goto(base + view.path, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(view.wait ?? 2500);
          await page.screenshot({ path: file });
          console.log('OK', server.name, `${vp.name}-${theme}`, viewName);
        } catch (e) {
          console.log('FAIL', server.name, `${vp.name}-${theme}`, viewName, String(e).slice(0, 120));
        }
      }

      // Flujo interactivo: abrir sidebar en móvil (dark y light)
      if (vp.name === 'mobile') {
        try {
          await page.goto(base + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(2500);
          const btn = page.locator('button[aria-label="Show sidebar"], button[aria-label="Hide sidebar"]').first();
          await btn.click({ timeout: 8000 });
          await page.waitForTimeout(1600);
          await page.screenshot({ path: path.join(dir, 'sidebar-open.png') });
          console.log('OK', server.name, `${vp.name}-${theme}`, 'sidebar-open');
        } catch (e) {
          console.log('FAIL', server.name, `${vp.name}-${theme}`, 'sidebar-open', String(e).slice(0, 120));
        }
      }

      // Sesión scrolleada (desktop dark): render de mensajes/tool calls más abajo
      if (vp.name === 'desktop' && theme === 'dark') {
        try {
          await page.goto(base + `/?session=${SESSION_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(4500);
          for (let i = 0; i < 7; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(250); }
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(dir, 'session-scrolled.png') });
          console.log('OK', server.name, `${vp.name}-${theme}`, 'session-scrolled');
        } catch (e) {
          console.log('FAIL', server.name, `${vp.name}-${theme}`, 'session-scrolled', String(e).slice(0, 120));
        }
      }
      await ctx.close();
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'console-errors.json'), JSON.stringify(errors, null, 2));
console.log('TOTAL ERRORS CAPTURADOS:', errors.length);
