// Consolidación del catálogo de fricciones: vision-results/*.json → findings/catalogo-fricciones.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'vision-results');
const OUT = path.join(here, 'findings', 'catalogo-fricciones.md');

const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : e.name.endsWith('.json') && files.push(p); } })(SRC);
files.sort();

const SEV_W = { bloqueante: 3, friccion: 2, cosmetica: 1 };
let lines = ['# Catálogo de fricciones — QA visual ExoHuman UI (enc-919a3f1e)', '',
  'Fuente: 78 capturas Chrome headless (prod :30141 + pre :30149) × {móvil 390, tablet 820, desktop 1440} × {claro, oscuro},',
  'analizadas cada una con visión (mimo-v2.6-pro vía gateway litellm). `captures/<server>/<combo>/<vista>.png` → `vision-results/...json`.', ''];

const all = [];
const empties = [];
for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\.json$/, '');
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (r.error) { lines.push(`## ${rel}`, '- ⚠️ ERROR de análisis'); continue; }
  if (r.empty) empties.push(rel);
  lines.push(`## ${rel}`, `${r.desc || ''}`, '');
  for (const i of r.issues || []) {
    const sev = (i.sev || 'cosmetica').toLowerCase();
    lines.push(`- **[${sev}]** ${i.zona || ''} — ${i.desc || ''}`);
    all.push({ sev, rel, zona: i.zona || '', desc: i.desc || '' });
  }
  if (!(r.issues || []).length) lines.push('- (sin fricciones evidentes)');
  lines.push('');
}
if (empties.length) lines.push('## Vistas vacías / sin datos', ...empties.map(e => `- ${e}`), '');

// Ranking global por clave normalizada de descripción
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 áéíóúñ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
const groups = new Map();
for (const i of all) {
  const k = norm(i.zona + ' ' + i.desc);
  if (!groups.has(k)) groups.set(k, { n: 0, sev: i.sev, ejemplos: [] });
  const g = groups.get(k);
  g.n++;
  if (SEV_W[i.sev] > SEV_W[g.sev]) g.sev = i.sev;
  if (g.ejemplos.length < 3) g.ejemplos.push(i);
}
const ranked = [...groups.values()].sort((a, b) => (b.n * SEV_W[b.sev]) - (a.n * SEV_W[a.sev]));

lines.push('---', '', '# Ranking global (frecuencia × severidad)', '',
  `Total issues: ${all.length} en ${files.length} capturas. Severidades: bloqueante=${all.filter(i => i.sev === 'bloqueante').length}, friccion=${all.filter(i => i.sev === 'friccion').length}, cosmetica=${all.filter(i => i.sev === 'cosmetica').length}.`, '');
ranked.forEach((g, ix) => {
  lines.push(`${ix + 1}. **[${g.sev}] ×${g.n}** — ${g.ejemplos[0].zona}: ${g.ejemplos[0].desc}`);
  g.ejemplos.slice(0, 3).forEach(e => lines.push(`   - ej: ${e.rel}`));
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'));
console.log('Escrito', OUT, '| issues:', all.length, '| grupos:', ranked.length, '| vacías:', empties.length);
console.log('\nTOP 15:');
ranked.slice(0, 15).forEach((g, ix) => console.log(`${ix + 1}. [${g.sev}] x${g.n} :: ${g.ejemplos[0].zona} :: ${String(g.ejemplos[0].desc).slice(0, 110)}`));
