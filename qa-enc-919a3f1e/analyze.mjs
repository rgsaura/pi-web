// QA visual enc-919a3f1e — análisis con visión real (mimo-v2.6-pro vía gateway litellm)
// Lee CADA captura y devuelve observaciones estructuradas. Reejecutable (salta lo ya analizado).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CAP = path.join(here, 'captures');
const OUT = path.join(here, 'vision-analysis.jsonl');
const BASE = 'http://100.117.46.29:4000/v1';
const MODEL = process.env.VISION_MODEL || 'mimo-v2.6-pro';
const CONC = Number(process.env.QA_CONC || 4);

const key = process.env.LITELLM_API_KEY ||
  readFileSync(join(homedir(), '.env-pi'), 'utf8').match(/^\s*(?:export\s+)?LITELLM_API_KEY\s*=\s*["']?([^\s"'#]+)/m)?.[1];
if (!key) { console.error('sin LITELLM_API_KEY'); process.exit(1); }

const done = new Set();
if (fs.existsSync(OUT)) for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) {
  if (!l.trim()) continue; try { done.add(JSON.parse(l).file); } catch {}
}

const files = [];
for (const server of ['prod', 'pre']) {
  for (const combo of fs.readdirSync(path.join(CAP, server)).sort()) {
    for (const f of fs.readdirSync(path.join(CAP, server, combo)).sort()) {
      if (f.endsWith('.png')) files.push({ server, combo, view: f.replace('.png', ''), file: `${server}/${combo}/${f}` });
    }
  }
}
const todo = files.filter(f => !done.has(f.file));
console.log(`Total ${files.length}, pendientes ${todo.length}`);

const toJpeg = pngPath => pngPath; // sin ImageMagick: se envía el PNG tal cual

const PROMPT = rel => `You are doing rigorous visual QA of a web app screenshot (ExoHuman UI, a personal AI assistant dashboard: chat sessions, timeline, proposals, encargos, post studio).
Screenshot context: server=${rel.server} (prod=production, pre=pre-release), viewport+theme=${rel.combo}, view="${rel.view}".
Look carefully at EVERYTHING visible. Then answer in STRICT JSON (no markdown fences, no commentary) with this schema:
{"description": "2-3 sentences describing the visible layout and state",
 "issues": [{"title": "short issue title", "detail": "what exactly is wrong and where on screen", "severity": 1-5, "confidence": "high|medium|low"}],
 "verdict": "ok|minor|broken"}
Focus on REAL, VISIBLE problems only — do not invent: text clipping/overflow/truncation with ellipsis where meaning is lost, overlapping elements, misalignment, illegible or low-contrast text, broken icons/images, empty/stuck/blank states that look like bugs, layout not adapted to the viewport, horizontal scroll cues, buttons cut off at edges, cramped spacing, inconsistent alignment, unstyled flash, mixed languages mid-sentence.
Severity: 5=unusable/broken, 4=major friction, 3=noticeable, 2=minor, 1=cosmetic.
If the screenshot looks fine, issues can be empty and verdict "ok".`;

async function analyzeOne(rel) {
  const png = toJpeg(path.join(CAP, rel.file));
  const b64 = fs.readFileSync(png).toString('base64');
  const body = {
    model: MODEL, max_tokens: 3000, temperature: 0.2,
    messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT(rel) },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
    ]}],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      let txt = j.choices?.[0]?.message?.content || '';
      txt = txt.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      const m = txt.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : txt);
      return { file: rel.file, server: rel.server, combo: rel.combo, view: rel.view, ...parsed };
    } catch (e) {
      if (attempt === 3) return { file: rel.file, server: rel.server, combo: rel.combo, view: rel.view, error: String(e).slice(0, 300) };
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
}

const out = fs.createWriteStream(OUT, { flags: 'a' });
let i = 0;
async function worker() {
  while (i < todo.length) {
    const rel = todo[i++];
    const r = await analyzeOne(rel);
    out.write(JSON.stringify(r) + '\n');
    const flag = r.error ? 'ERR ' + r.error.slice(0, 60) : r.verdict || '?';
    console.log(`[${i}/${todo.length}]`, rel.file, '→', flag, (r.issues?.length ?? '-') + ' issues');
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
out.end();
console.log('DONE');
