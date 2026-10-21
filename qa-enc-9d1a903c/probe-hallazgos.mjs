// Probes DOM enc-9d1a903c — verificación de usuario real de hallazgos sospechosos
import { chromium } from 'playwright';

const BASE = 'http://localhost:30149';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function go(url, wait = 4000) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(wait);
}

// ── 1) panel-detail: overflow del panel embebido ─────────────────────────
await go('/?view=paneles&panel=2026-10-20-mejoras-sistema', 5000);
const panelProbe = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, iframe: null, headerSpans: [], scrollers: [] };
  const ifr = document.querySelector('iframe');
  if (ifr) {
    const r = ifr.getBoundingClientRect();
    out.iframe = { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), scrollWidth: ifr.scrollWidth };
    try {
      const d = ifr.contentDocument;
      if (d) {
        out.iframeInner = { scrollWidth: d.documentElement.scrollWidth, clientWidth: d.documentElement.clientWidth, bodyMax: Math.max(...[...d.querySelectorAll('body *')].map(e => e.getBoundingClientRect().right)) };
      }
    } catch {}
  }
  for (const el of document.querySelectorAll('span,button,h1,h2')) {
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && r.left < vw && r.width > 0) {
      out.headerSpans.push({ text: (el.textContent || '').trim().slice(0, 40), right: Math.round(r.right), w: Math.round(r.width), cls: String(el.className).slice(0, 40) });
    }
  }
  out.headerSpans = out.headerSpans.slice(0, 10);
  return out;
});
console.log('── PANEL-DETAIL ──');
console.log(JSON.stringify(panelProbe, null, 1));

// ── 2) sidebar-open: solape 'workspace' vs 'FIJADOS', chips ──────────────
await go('/', 3000);
await page.locator('button[aria-label*="sidebar" i]').first().click({ timeout: 8000 });
await page.waitForTimeout(1800);
const sidebarProbe = await page.evaluate(() => {
  const out = { workspaceLabel: null, fijadosHeader: null, overlap: null, chipsRow: null };
  const find = (txt) => [...document.querySelectorAll('div,span,button,h2,h3')].filter(e => e.children.length === 0 && (e.textContent || '').trim() === txt)[0];
  const ws = find('workspace'); const fj = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^FIJADOS/i.test((e.textContent || '').trim()))[0];
  if (ws) { const r = ws.getBoundingClientRect(); out.workspaceLabel = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), h: Math.round(r.height), text: ws.textContent.trim().slice(0, 30) }; }
  if (fj) { const r = fj.getBoundingClientRect(); out.fijadosHeader = { top: Math.round(r.top), bottom: Math.round(r.bottom), text: fj.textContent.trim().slice(0, 30) }; }
  if (ws && fj) {
    const a = ws.getBoundingClientRect(), b = fj.getBoundingClientRect();
    out.overlap = !(a.bottom <= b.top || b.bottom <= a.top) ? { amount: Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) } : null;
  }
  // fila de chips rápidos: ¿scrollable por diseño?
  const chips = [...document.querySelectorAll('button')].filter(b => /^(Todo|En Vivo|Encargos|Rutinas)/.test((b.textContent || '').trim()));
  if (chips.length) {
    const p = chips[0].parentElement; const cs = getComputedStyle(p);
    out.chipsRow = { n: chips.length, parentOverflowX: cs.overflowX, scrollWidth: p.scrollWidth, clientWidth: p.clientWidth, cortaUltimo: p.scrollWidth > p.clientWidth };
  }
  return out;
});
console.log('── SIDEBAR-OPEN ──');
console.log(JSON.stringify(sidebarProbe, null, 1));

// ── 3) encargos: títulos cortados sin ellipsis ───────────────────────────
await go('/?view=encargos', 3500);
const encargosProbe = await page.evaluate(() => {
  const out = { titles: [] };
  for (const el of document.querySelectorAll('h3,h4,[class*=title],[class*=Titulo]')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    out.titles.push({ text: (el.textContent || '').trim().slice(0, 50), ellipsis: cs.textOverflow, whiteSpace: cs.whiteSpace, multiline: cs.webkitLineClamp, h: Math.round(r.height) });
    if (out.titles.length >= 6) break;
  }
  return out;
});
console.log('── ENCARGOS títulos ──');
console.log(JSON.stringify(encargosProbe, null, 1));

// ── 4) timeline patrones: ¿datos o bug? ─────────────────────────────────
await go('/?view=timeline', 3500);
await page.getByRole('button', { name: /patrones/i }).first().click({ timeout: 6000 }).catch(e => console.log('patrones click FAIL', String(e).slice(0, 80)));
await page.waitForTimeout(2500);
const patronesProbe = await page.evaluate(() => {
  const body = (document.querySelector('main') || document.body).innerText;
  return { empty: /aún no|no hay|vacío|aparecerán/i.test(body), snippet: body.replace(/\s+/g, ' ').slice(0, 300) };
});
console.log('── TIMELINE PATRONES ──');
console.log(JSON.stringify(patronesProbe, null, 1));

await ctx.close();
await browser.close();
