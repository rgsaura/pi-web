// QA visual enc-919a3f1e — análisis de cada captura con modelo de visión (LiteLLM gateway)
// Uso: LITELLM_API_KEY cargada por ~/.env-pi · node vision.mjs [filtro-substr]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CAP = path.join(here, '..', 'captures');
const OUT = path.join(here, 'results');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://100.117.46.29:4000/v1/chat/completions';
const KEY = process.env.LITELLM_API_KEY;
if (!KEY) { console.error('falta LITELLM_API_KEY'); process.exit(1); }
const MODEL = process.env.QA_VISION_MODEL || 'antigravity-gemini-flash';

const VISTA_LABEL = {
  home: 'vista home (sidebar de sesiones + compositor de nueva sesión)',
  session: 'vista de una sesión de chat real con mensajes del agente y tool calls',
  'session-scrolled': 'sesión scrolleada hacia abajo (mensajes y tool calls renderizados)',
  timeline: 'panel Timeline (eventos temporales)',
  proposals: 'panel Decisiones (propuestas con opciones)',
  'post-studio': 'panel Post Studio (posts sociales / carruseles)',
  encargos: 'panel Encargos (lista de tareas)',
  paneles: 'panel Paneles (dashboard)',
  agents: 'panel Agents',
  activity: 'panel Activity',
  'sidebar-open': 'sidebar de navegación abierto sobre la vista móvil',
};

const PROMPT = (meta) => `Eres un auditor de QA visual de interfaces web. Analiza ESTA captura de pantalla de ExoHuman UI (una web app de chat con agentes IA, en español).

Metadatos: entorno=${meta.server} (prod=producción, pre=preproducción) · dispositivo=${meta.vp} · tema=${meta.theme} · vista=${meta.vista} (${VISTA_LABEL[meta.vista] ?? meta.vista}).

Tarea:
1) Describe el layout en 1-2 frases.
2) Lista TODOS los defectos visuales o fricciones de uso real que VEAS en la imagen (no especules): desbordamientos, texto cortado/truncado, solapamientos, contraste ilegible, elementos alineados mal, objetivos táctiles diminutos, claves de i18n sin traducir (ej: "settings.xxx"), imágenes rotas, espacios vacíos anómalos, scroll horizontal, elementos que se salen de la pantalla, tipografías inconsistentes, botones sin etiqueta clara, contenido ilegible.
3) Si no ves ningún defecto, lista vacía. No inventes problemas.

Responde EXACTAMENTE con JSON válido:
{"desc": "...", "issues": [{"severity": "alta|media|baja", "tipo": "categoria", "donde": "zona de la pantalla", "detalle": "qué se ve exactamente"}]}`;

const files = [];
for (const server of ['prod', 'pre']) {
  const sdir = path.join(CAP, server);
  if (!fs.existsSync(sdir)) continue;
  for (const combo of fs.readdirSync(sdir).sort()) {
    for (const f of fs.readdirSync(path.join(sdir, combo)).sort()) {
      if (!f.endsWith('.png')) continue;
      const view = f.replace('.png', '');
      const rel = `${server}/${combo}/${f}`;
      if (process.argv[2] && !rel.includes(process.argv[2])) continue;
      files.push({ server, combo, view, rel, file: path.join(sdir, combo, f) });
    }
  }
}
console.log('A analizar:', files.length);

async function analyze(item) {
  const b64 = fs.readFileSync(item.file).toString('base64');
  const [vp, theme] = item.combo.split('-');
  const body = {
    model: MODEL,
    messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT({ server: item.server, vp, theme, vista: item.view }) },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
    ]}],
    max_tokens: 1400,
    temperature: 0.1,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(BASE, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const d = await res.json();
      let txt = d.choices?.[0]?.message?.content ?? '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('sin JSON en respuesta: ' + txt.slice(0, 120));
      let parsed; try { parsed = JSON.parse(m[0]); } catch { throw new Error('JSON inválido: ' + m[0].slice(0, 120)); }
      return { ...item, ok: true, desc: parsed.desc, issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
    } catch (e) {
      if (attempt === 3) return { ...item, ok: false, error: String(e).slice(0, 250) };
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
}

const results = [];
const QUEUE = [...files];
const CONC = 3;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (QUEUE.length) {
    const item = QUEUE.shift();
    if (!item) break;
    const r = await analyze(item);
    results.push(r);
    const n = results.length;
    console.log(`[${n}/${files.length}]`, r.ok ? 'OK' : 'FAIL', r.rel, r.ok ? `(${r.issues.length} issues)` : r.error);
    fs.writeFileSync(path.join(OUT, 'all.json'), JSON.stringify(results, null, 1));
  }
}));
const okN = results.filter(r => r.ok).length;
console.log(`HECHO: ${okN}/${results.length} analizadas. Issues totales:`, results.reduce((a, r) => a + (r.issues?.length ?? 0), 0));
