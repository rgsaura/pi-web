// QA visual enc-919a3f1e — análisis con visión de CADA captura vía gateway litellm (mimo-v2.6-pro, multimodal)
// Uso: node vision-qa.mjs            → analiza todo lo que falte (reanudable por archivo de resultado)
//      node vision-qa.mjs <dir>...   → re-analiza sólo esos directorios (ej: captures/dev)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProxyAgent, setGlobalDispatcher } from '../node_modules/undici/index.js';
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:1056'));

const here = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES = path.join(here, 'captures');
const OUTDIR = path.join(here, 'vision-results');
const KEY = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.pi/agent/auth.json'), 'utf8')).litellm.key;
const URL = 'http://100.117.46.29:4000/v1/chat/completions';
const MODEL = process.env.QA_VISION_MODEL || 'mimo-v2.6-pro';

const VIEW_INFO = {
  home: 'home: sidebar de sesiones + composer de nueva sesión (vista raíz /)',
  session: 'sesión concreta con mensajes de chat (¿?session=...)',
  'session-scrolled': 'sesión concreta tras hacer scroll (render de mensajes/tool calls más abajo)',
  timeline: 'vista Timeline (?view=timeline): eventos fusionados, pestañas Eventos/Patrones',
  proposals: 'vista Decisiones (?view=proposals): lista de propuestas con opciones',
  'post-studio': 'vista Post Studio (?view=post-studio): estudio de posts/carrusel de redes',
  encargos: 'vista Encargos (?view=encargos): lista de encargos con estado',
  paneles: 'vista Paneles (?view=paneles): galería de paneles entregables',
  agents: 'vista Agents (?view=agents): inspector de agentes',
  activity: 'vista Activity (?view=activity): actividad reciente',
  'sidebar-open': 'móvil con el sidebar abierto mediante su botón hamburguesa',
};

async function analyze(imgPath) {
  const rel = path.relative(CAPTURES, imgPath).replace(/\.png$/, '');
  const [server, combo, view] = rel.split(path.sep);
  const vp = combo.includes('mobile') ? 'móvil 390x844' : combo.includes('tablet') ? 'tablet 820x1180' : 'desktop 1440x900';
  const theme = combo.endsWith('dark') ? 'oscuro' : 'claro';
  const info = VIEW_INFO[view] || view;
  const img = fs.readFileSync(imgPath).toString('base64');
  const prompt = `Eres QA visual experto, usuario real de ExoHuman UI (app web Next.js: interfaz para sesiones de agentes pi, timeline, decisiones, encargos, paneles, post-studio).

Captura: servidor=${server === 'prod' ? 'PRODUCCIÓN :30141' : server === 'pre' ? 'PRE :30149' : server}, viewport=${vp}, tema=${theme}, vista=${info}.

Mira la captura con detalle y responde SOLO con JSON válido (sin markdown, sin texto alrededor):
{"desc": "1-2 líneas: qué se ve (layout, zonas)",
 "issues": [{"sev":"bloqueante|friccion|cosmetica","zona":"dónde exactamente (elemento + parte de la captura)","desc":"qué está mal, concreto"}],
 "empty": true|false}
"empty"=true si la vista está vacía/sin datos (estado vacío, pantalla en blanco, loader eterno).
Busca fricciones REALES visibles: desbordes/overflow horizontal, texto truncado, solapes, contraste ilegible, elementos pegados a bordes, alineaciones rotas, targets táctiles demasiado pequeños en móvil, estados vacíos pobres, errores visibles, jerarquía confusa, controles amontonados. NO inventes problemas: sólo lo que se ve. Si no hay fricciones, issues=[].`;
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 2600,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + img } },
    ]}],
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const d = await res.json();
      const content = d.choices?.[0]?.message?.content || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('sin JSON: ' + content.slice(0, 120));
      return JSON.parse(m[0]);
    } catch (e) {
      if (attempt === 3) return { desc: 'ERROR: ' + String(e).slice(0, 200), issues: [], empty: null, error: true };
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
}

// Colección de imágenes (con filtros por directorio si hay args)
const onlyDirs = process.argv.slice(2).map(a => path.resolve(a));
const images = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png')) {
      if (onlyDirs.length && !onlyDirs.some(d => p.startsWith(d))) continue;
      images.push(p);
    }
  }
})(CAPTURES);
images.sort();

let done = 0, errors = 0;
const CONCURRENCY = 4;
let idx = 0;
async function worker() {
  while (idx < images.length) {
    const img = images[idx++];
    const rel = path.relative(CAPTURES, img).replace(/\.png$/, '.json');
    const out = path.join(OUTDIR, rel);
    if (fs.existsSync(out) && !onlyDirs.length) { done++; continue; } // reanudable
    const r = await analyze(img);
    if (r.error) errors++;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(r, null, 1));
    done++;
    console.log(`[${done}/${images.length}]`, rel, r.error ? 'ERROR' : `${(r.issues || []).length} issues${r.empty ? ' (VACÍA)' : ''}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log('LISTO. imágenes:', images.length, 'errores:', errors);
