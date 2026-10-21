// Consolidación enc-9d1a903c — vision results + audit mecánico → hallazgos por severidad
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// 1) visión
const vis = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      const [server, combo, view] = path.relative(path.join(here, 'vision-results'), p).replace(/\.json$/, '').split(path.sep);
      for (const i of j.issues || []) vis.push({ server, combo, view, sev: i.sev, zona: i.zona, desc: i.desc, empty: !!j.empty, desc_vista: j.desc });
      if (j.empty) vis.push({ server, combo, view, sev: 'bloqueante', zona: 'vista', desc: 'VISTA VACÍA/SIN DATOS: ' + (j.desc || ''), empty: true });
    }
  }
})(path.join(here, 'vision-results'));

// 2) audit mecánico
const audit = JSON.parse(fs.readFileSync(path.join(here, 'audit-layout-pre.json'), 'utf8'));
const mech = [];
for (const r of audit) {
  if (r.error) { mech.push({ view: r.view, vp: r.vp, sev: 'bloqueante', desc: 'ERROR de carga en audit: ' + r.error }); continue; }
  if (r.docOverflowX > 2) mech.push({ view: r.view, vp: r.vp, sev: 'bloqueante', desc: `overflow horizontal del documento: ${r.docOverflowX}px` });
  for (const o of r.offscreen) mech.push({ view: r.view, vp: r.vp, sev: 'friccion', desc: `elemento cortado fuera del viewport (right ${o.right}px): ${o.tag} "${(o.text || '').slice(0, 30)}"` });
  if (r.vp === 'mobile') {
    const t30 = r.smallTargets30 || [], t44 = (r.smallTargets44 || []).filter(t => !t30.includes(t));
    for (const t of t30) mech.push({ view: r.view, vp: 'mobile', sev: 'friccion', desc: `target táctil ${t.w}x${t.h}px (<30px): ${t.tag} "${t.text}"` });
    for (const t of t44) mech.push({ view: r.view, vp: 'mobile', sev: 'cosmetica', desc: `target táctil ${t.w}x${t.h}px (<44px): ${t.tag} "${t.text}"` });
  }
}

// agrupar fricciones de visión por patrón (desc similar) con evidencias
const groups = new Map();
for (const v of vis) {
  const key = v.sev + '§' + (v.zona || '').toLowerCase().slice(0, 30) + '§' + v.desc.toLowerCase().replace(/[0-9]+/g, 'N').slice(0, 60);
  if (!groups.has(key)) groups.set(key, { ...v, evidencias: [], count: 0 });
  const g = groups.get(key);
  g.count++;
  g.evidencias.push(`${v.server}/${v.combo}/${v.view}`);
}
const visGroups = [...groups.values()].sort((a, b) => (a.sev === 'bloqueante' ? 0 : a.sev === 'friccion' ? 1 : 2) - (b.sev === 'bloqueante' ? 0 : b.sev === 'friccion' ? 1 : 2) || b.count - a.count);

const out = {
  resumen: { capturas: 42, visionIssues: vis.length, visionGrupos: visGroups.length, mechFindings: mech.length },
  vision: visGroups,
  mecanico: mech,
};
fs.writeFileSync(path.join(here, 'consolidado.json'), JSON.stringify(out, null, 1));
console.log('vision issues:', vis.length, '→ grupos:', visGroups.length, '| mecánicos:', mech.length);
console.log('\n=== VISIÓN: bloqueantes ===');
for (const g of visGroups.filter(g => g.sev === 'bloqueante')) console.log(`[${g.count}x] ${g.view}: ${g.desc} · zona: ${g.zona}`);
console.log('\n=== VISIÓN: fricciones (top 30) ===');
for (const g of visGroups.filter(g => g.sev === 'friccion').slice(0, 30)) console.log(`[${g.count}x] (${g.view}) ${g.desc.slice(0, 110)}`);
