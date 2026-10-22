// QA visual enc-9d1a903c — análisis con visión de CADA captura vía gateway litellm (mimo-v2.6-pro, multimodal)
// Uso: node vision-qa.mjs            → analiza todo lo que falte (reanudable por archivo de resultado)
//      node vision-qa.mjs <dir>...   → re-analiza sólo esos directorios
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
  'sidebar-open': 'móvil con el sidebar de sesiones abierto (botón hamburguesa): buscador, chips de filtro rápido (Encargos/Rutinas/Trabajo/Personal), árbol de sesiones',
  'sidebar-proyectos': 'sidebar de sesiones en modo Proyectos: sesiones agrupadas por proyecto con contadores',
  'sidebar-envivo': 'sidebar de sesiones con el filtro rápido "En Vivo" activo',
  session: 'sesión concreta con mensajes de chat (¿?session=...)',
  'session-scrolled': 'sesión concreta tras hacer scroll (render de mensajes/tool calls más abajo)',
  timeline: 'vista Timeline (?view=timeline): eventos fusionados, pestañas Eventos/Patrones',
  'timeline-patrones': 'vista Timeline, pestaña "Patrones por hora"',
  proposals: 'vista Decisiones (?view=proposals): lista de propuestas con opciones',
  encargos: 'vista Encargos (?view=encargos): lista de encargos con estado',
  activity: 'vista Actividad (?view=activity): canales y actividad reciente',
  workspaces: 'vista Workspaces (?view=workspaces): workspaces por categoría con estado',
  paneles: 'vista Paneles (?view=paneles): galería de paneles entregables',
  'panel-detail': 'detalle de un panel (?view=paneles&panel=...): cabecera con acciones y el panel embebido',
  agents: 'vista Agentes (?view=agents): inspector de agentes',
  'post-studio': 'vista Post Studio (?view=post-studio): estudio de posts/carrusel de redes',
  'post-detail': 'detalle de un post del Post Studio (carrusel con slides)',
  'settings-open': 'móvil con el panel de Ajustes abierto sobre la app',
};

async function analyze(imgPath) {
  const rel = path.relative(CAPTURES, imgPath).replace(/\.png$/, '');
  const [server, combo, view] = rel.split(path.sep);
  const vp = combo.includes('mobile') ? 'móvil 390x844 (iPhone)' : combo.includes('tablet') ? 'tablet 820x1180' : 'desktop 1440x900';
  const theme = combo.endsWith('dark') ? 'oscuro' : 'claro';
  const info = VIEW_INFO[view] || view;
  const img = fs.readFileSync(imgPath).toString('base64');
  const prompt = `Eres QA visual experto, usuario real de ExoHuman UI (app web Next.js: interfaz para sesiones de agentes pi, timeline, decisiones, encargos, paneles, post-studio).

Captura: servidor=${server === 'pre' ? 'PRE :30149' : server}, viewport=${vp}, tema=${theme}, vista=${info}.

Mira la captura con detalle y responde SOLO con JSON válido (sin markdown, sin texto alrededor):
{"desc": "1-2 líneas: qué se ve (layout, zonas)",
 "issues": [{"sev":"bloqueante|friccion|cosmetica","zona":"dónde exactamente (elemento + parte de la captura)","desc":"qué está mal, concreto"}],
 "empty": true|false}
"empty"=true si la vista está vacía/sin datos (estado vacío, pantalla en blanco, loader eterno).
Busca fricciones REALES visibles: desbordes/overflow horizontal, texto truncado o cortado, solapes, contraste ilegible, elementos pegados a bordes, alineaciones rotas, targets táctiles demasiado pequeños en móvil, estados vacíos pobres, errores visibles, jerarquía confusa, controles amontonados. NO inventes problemas: sólo lo que se ve. Si no hay fricciones, issues=[].`;
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
      let txt = d.choices?.[0]?.message?.content || '';
      txt = txt.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
      const parsed = JSON.parse(txt.slice(a, b + 1));
      parsed._model = d.model;
      return parsed;
    } catch (e) {
      if (attempt === 3) return { error: String(e).slice(0, 250), desc: null, issues: [], empty: null };
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

// descubrir capturas (respetando args de re-análisis)
const redoDirs = process.argv.slice(2).map(d => path.join(CAPTURES, d));
const files = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else if (e.name.endsWith('.png')) files.push(path.join(dir, e.name));
  }
})(CAPTURES);

let n = 0, errs = 0;
for (const f of files.sort()) {
  const rel = path.relative(CAPTURES, f).replace(/\.png$/, '.json');
  const out = path.join(OUTDIR, rel);
  if (!redoDirs.some(d => f.startsWith(d)) && fs.existsSync(out)) continue; // reanudable
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = await analyze(f);
  r._file = path.basename(f);
  fs.writeFileSync(out, JSON.stringify(r, null, 1));
  n++;
  if (r.error) { errs++; console.log('ERR ', rel, r.error.slice(0, 90)); }
  else console.log('OK  ', rel, (r.issues || []).length + ' issues', r.empty ? '[VACÍA]' : '');
}
console.log(`\nAnalizadas: ${n} · errores: ${errs}`);
