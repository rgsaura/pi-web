// Audit mecánico de layout: overflow horizontal, elementos cortados, targets táctiles pequeños
// Uso: node audit-layout.mjs [prod|pre|url_base]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NAMED = { prod: 'http://localhost:30141', pre: 'http://localhost:30149' };
const SERVERS = process.argv[2]
  ? [{ name: NAMED[process.argv[2]] ? process.argv[2] : process.argv[2].replace(/https?:\/\//g, '').replace(/[:\/]/g, '_'), port: NAMED[process.argv[2]] || process.argv[2] }]
  : [{ name: 'pre', port: 'http://localhost:30149' }];
const SESSION_ID = process.env.QA_SESSION_ID || '01a13fb2-558a-70c5-b325-48eea1d52dda';
const VIEWS = {
  home: '/', session: `/?session=${SESSION_ID}`, timeline: '/?view=timeline',
  proposals: '/?view=proposals', 'post-studio': '/?view=post-studio',
  encargos: '/?view=encargos', paneles: '/?view=paneles', agents: '/?view=agents', activity: '/?view=activity',
};
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1180, mobile: false },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

const report = [];
const browser = await chromium.launch();
for (const server of SERVERS) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    const page = await ctx.newPage();
    for (const [view, path_] of Object.entries(VIEWS)) {
      try {
        await page.goto(server.port + path_, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        await page.waitForTimeout(2500);
        const audit = await page.evaluate((isMobile) => {
          const out = { docOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, offscreen: [], smallTargets: [], view: null };
          const vw = document.documentElement.clientWidth;
          // ¿qué vista se renderiza? (heurística: data-view, h1, texto principal)
          const main = document.querySelector('main') || document.body;
          out.headline = (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 80);
          // elementos que sobresalen del viewport a la derecha (visibles, no dentro de scrollables)
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            if (r.right > vw + 2 && r.left < vw) {
              // ¿algún ancestro con overflow-x auto/scroll que lo contenga?
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
          // targets táctiles pequeños (sólo móvil): botones/links/clickables visibles < 36px de alto o ancho
          if (isMobile) {
            for (const el of document.querySelectorAll('button, a, [role=button], [onclick], input, select')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const cs = getComputedStyle(el);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              if ((r.height > 0 && r.height < 30) || (r.width > 0 && r.width < 30)) {
                out.smallTargets.push({ tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) });
              }
            }
            out.smallTargets = out.smallTargets.filter(t => t.text).slice(0, 10);
          }
          return out;
        }, vp.mobile);
        report.push({ server: server.name, vp: vp.name, view, ...audit });
        console.log(server.name, vp.name, view, 'overflowX:', audit.docOverflowX, 'offscreen:', audit.offscreen.length, 'smallTargets:', audit.smallTargets.length, '|', audit.headline);
      } catch (e) {
        report.push({ server: server.name, vp: vp.name, view, error: String(e).slice(0, 150) });
        console.log('FAIL', server.name, vp.name, view, String(e).slice(0, 100));
      }
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(here, 'audit-layout.json'), JSON.stringify(report, null, 1));
console.log('→ audit-layout.json');
