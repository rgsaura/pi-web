// Audit mecánico de layout enc-9d1a903c — overflow horizontal, elementos cortados, targets táctiles
// Umbrales: target táctil <44px (Apple HIG / regla 27) y <30px (falla grave); overflowX y offscreen.
// Uso: node audit-layout.mjs [pre|<url_base>]   (default pre)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] === 'pre' || !process.argv[2] ? 'http://localhost:30149' : process.argv[2];
const NAME = BASE.includes('30149') ? 'pre' : BASE.replace(/https?:\/\//g, '').replace(/[:\/]/g, '_');
const SESSION_ID = process.env.QA_SESSION_ID || '01a13fb2-558a-70c5-b325-48eea1d52dda';
const PANEL_SLUG = process.env.QA_PANEL_SLUG || '2026-10-20-mejoras-sistema';
const VIEWS = {
  home: '/', session: `/?session=${SESSION_ID}`, timeline: '/?view=timeline',
  proposals: '/?view=proposals', 'post-studio': '/?view=post-studio',
  encargos: '/?view=encargos', paneles: '/?view=paneles',
  'panel-detail': `/?view=paneles&panel=${PANEL_SLUG}`, agents: '/?view=agents',
  activity: '/?view=activity', workspaces: '/?view=workspaces',
};
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

const report = [];
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
  const page = await ctx.newPage();
  for (const [view, path_] of Object.entries(VIEWS)) {
    try {
      await page.goto(BASE + path_, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(2800);
      const audit = await page.evaluate((isMobile) => {
        const out = { docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, offscreen: [], smallTargets44: [], smallTargets30: [], headline: null };
        const vw = document.documentElement.clientWidth;
        out.headline = (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 80);
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (r.right > vw + 2 && r.left < vw) {
            let p = el.parentElement, contained = false;
            while (p && p !== document.body) {
              const pcs = getComputedStyle(p);
              if (/(auto|scroll)/.test(pcs.overflowX) && p.getBoundingClientRect().width <= vw + 2) { contained = true; break; }
              p = p.parentElement;
            }
            if (!contained) out.offscreen.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), text: (el.textContent || '').trim().slice(0, 40), right: Math.round(r.right), w: Math.round(r.width) });
          }
        }
        out.offscreen = out.offscreen.slice(0, 8);
        if (isMobile) {
          const vw2 = vw, vh = document.documentElement.clientHeight;
          const seen = new Set();
          for (const el of document.querySelectorAll('button, a, [role=button], [onclick], input, select')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            // sólo elementos visibles en el viewport (excluye el sidebar oculto fuera de canvas)
            if (r.left >= vw2 || r.right <= 0 || r.top >= vh || r.bottom <= 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const label = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28);
            if (!label) continue;
            const key = label + Math.round(r.width) + 'x' + Math.round(r.height);
            if (seen.has(key)) continue; seen.add(key);
            const t = { tag: el.tagName, text: label, h: Math.round(r.height), w: Math.round(r.width) };
            if ((t.h > 0 && t.h < 44) || (t.w > 0 && t.w < 44)) out.smallTargets44.push(t);
            if ((t.h > 0 && t.h < 30) || (t.w > 0 && t.w < 30)) out.smallTargets30.push(t);
          }
          out.smallTargets44 = out.smallTargets44.slice(0, 40);
          out.smallTargets30 = out.smallTargets30.slice(0, 25);
        }
        return out;
      }, vp.mobile);
      report.push({ server: NAME, vp: vp.name, view, ...audit });
      console.log(NAME, vp.name, view.padEnd(13), 'overflowX:', String(audit.docOverflowX).padStart(3), 'offscreen:', audit.offscreen.length, 'tg<44:', String(audit.smallTargets44.length).padStart(3), 'tg<30:', audit.smallTargets30.length, '|', audit.headline);
    } catch (e) {
      report.push({ server: NAME, vp: vp.name, view, error: String(e).slice(0, 150) });
      console.log('FAIL', NAME, vp.name, view, String(e).slice(0, 100));
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(here, `audit-layout-${NAME}.json`), JSON.stringify(report, null, 1));
console.log(`→ audit-layout-${NAME}.json`);
