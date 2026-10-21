// Sondeo dirigido: elementos concretos señalados por visión — wrap/truncación medible en DOM
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:30149';
const SESSION_ID = process.env.QA_SESSION_ID || '01a13fb2-558a-70c5-b325-48eea1d52dda';
const browser = await chromium.launch();
for (const vp of [{ name: 'mobile', width: 390 }, { name: 'desktop', width: 1440 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: 900 } });
  const page = await ctx.newPage();

  // home: sidebar nav + composer (selector de modelo)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const home = await page.evaluate(() => {
    const out = { navButtons: [], modelSelector: null, breadcrumbs: [] };
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (/^(Línea de tiempo|Timeline|Paneles|Post Studio|Agentes|Actividad|Encargos|Decisiones)/.test(t)) {
        const oneLine = b.querySelector('span,div');
        const r = b.getBoundingClientRect();
        out.navButtons.push({ text: t.slice(0, 24), h: Math.round(r.height), w: Math.round(r.width), wrapped: r.height > 40, truncated: b.scrollWidth > b.clientWidth + 2 });
      }
      if (/Failover/i.test(t) || /Defa/i.test(t)) {
        const r = b.getBoundingClientRect();
        out.modelSelector = { text: t.slice(0, 60), w: Math.round(r.width), truncated: b.scrollWidth > b.clientWidth + 2, scrollW: b.scrollWidth, clientW: b.clientWidth };
      }
    }
    for (const el of document.querySelectorAll('[class*=breadcrumb] *, [class*=crumb] *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) out.breadcrumbs.push({ text: (el.textContent || '').slice(0, 24), truncated: el.scrollWidth > el.clientWidth + 2 });
    }
    return out;
  });
  console.log(`== HOME ${vp.name} ==`);
  home.navButtons.slice(0, 12).forEach(b => console.log(`  nav ${JSON.stringify(b)}`));
  console.log('  modelSelector:', JSON.stringify(home.modelSelector));
  home.breadcrumbs.slice(0, 6).forEach(b => console.log('  crumb', JSON.stringify(b)));

  // timeline: eventos con texto largo sin clamp
  await page.goto(BASE + '/?view=timeline', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tl = await page.evaluate(() => {
    const out = { longEvents: [] };
    for (const el of document.querySelectorAll('main *')) {
      const cs = getComputedStyle(el);
      const hasClamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
      if (hasClamp) continue;
      const r = el.getBoundingClientRect();
      if (r.height > 110 && el.children.length <= 2 && (el.textContent || '').length > 220 && el.closest('[class*=event],article,[class*=card],li')) {
        out.longEvents.push({ cls: String(el.className).slice(0, 40), h: Math.round(r.height), chars: (el.textContent || '').length, text: (el.textContent || '').slice(0, 70) });
      }
    }
    out.longEvents = out.longEvents.slice(0, 5);
    return out;
  });
  console.log(`== TIMELINE ${vp.name} ==`);
  tl.longEvents.forEach(e => console.log('  evento largo:', JSON.stringify(e)));

  // proposals: enlace 'Ver sesión en vivo' y chips de origen
  await page.goto(BASE + '/?view=proposals', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const pr = await page.evaluate(() => {
    const out = { liveLinks: [], originChips: [], sortSelect: null };
    for (const a of document.querySelectorAll('a')) {
      const t = (a.textContent || '').trim();
      if (/Ver sesión|en vivo/i.test(t)) {
        const r = a.getBoundingClientRect();
        out.liveLinks.push({ text: t.slice(0, 30), h: Math.round(r.height), wrapped: r.height > 24, w: Math.round(r.width) });
      }
    }
    for (const el of document.querySelectorAll('span,div')) {
      const t = (el.textContent || '').trim();
      if (/^\d{2}-\d{2}$|Origen/i.test(t) && t.length < 60) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width < 90) out.originChips.push({ text: t.slice(0, 30), h: Math.round(r.height), wrapped: r.height > 26 });
      }
      if (out.originChips.length > 4) break;
    }
    const sel = document.querySelector('select');
    if (sel) { const r = sel.getBoundingClientRect(); out.sortSelect = { value: sel.value.slice(0, 40), w: Math.round(r.width), right: Math.round(r.right), vw: document.documentElement.clientWidth }; }
    return out;
  });
  console.log(`== PROPOSALS ${vp.name} ==`);
  pr.liveLinks.slice(0, 4).forEach(l => console.log('  liveLink', JSON.stringify(l)));
  pr.originChips.slice(0, 4).forEach(c => console.log('  originChip', JSON.stringify(c)));
  console.log('  sortSelect:', JSON.stringify(pr.sortSelect));
  await ctx.close();
}
await browser.close();
