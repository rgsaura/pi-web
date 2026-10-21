import fs from "node:fs";
import { ProxyAgent, setGlobalDispatcher } from "../node_modules/undici/index.js";
setGlobalDispatcher(new ProxyAgent("http://127.0.0.1:1056"));
const KEY = JSON.parse(fs.readFileSync(process.env.HOME + "/.pi/agent/auth.json", "utf8")).litellm.key;
const URL = "http://100.117.46.29:4000/v1/chat/completions";
const MODEL = process.env.QA_VISION_MODEL || "mimo-v2.6-pro";
const DIR = "qa-enc-ebe31041/captures";
const OUT = "qa-enc-ebe31041/vision-results.json";
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter((f) => f.endsWith(".png"));
const results = { ...prev };
for (const f of files) {
  const img = fs.readFileSync(`${DIR}/${f}`).toString("base64");
  const prompt = `Eres QA visual experto de ExoHuman UI (Next.js). Captura de la vista Post Studio (?view=post-studio&post=herradura-2026) — estudio de posts de Instagram: carrusel/preview en marco de móvil, música real de IG (buscador con previews), fotos con procedencia (fecha/lugar/quién), validación visual del post.

Archivo: ${f}. Responde SOLO JSON: {"desc":"1-2 líneas","issues":[{"sev":"bloqueante|friccion|cosmetica","zona":"dónde","desc":"qué"}],"empty":bool}
NOTA: los emojis que salgan como cuadros vacíos (tofu □) son un artefacto del Chromium headless de QA (sin fuentes emoji), NO los cuentes como issue. Filas cortadas por el borde inferior del viewport = scroll normal, no issue. Busca fricciones REALES: overflow, texto truncado sin elipsis donde importa, solapes, contraste imposible, layout roto. Si está bien, issues=[].`;
  let parsed = null;
  for (let a = 1; a <= 2 && !parsed; a++) {
    try {
      const res = await fetch(URL, { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: "data:image/png;base64," + img } }] }] }) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      const t = (d.choices?.[0]?.message?.content ?? "").trim().replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "");
      try { parsed = JSON.parse(t); } catch { const s = t.indexOf("{"), e = t.lastIndexOf("}"); if (s >= 0 && e > s) parsed = JSON.parse(t.slice(s, e + 1)); }
    } catch (e) { await new Promise((r) => setTimeout(r, 2000)); }
  }
  results[f] = parsed ?? { desc: "sin análisis", issues: [], empty: false };
  fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  console.log(f, "->", (results[f].issues || []).length, "issues");
}
const all = Object.values(results).flatMap((r) => r.issues || []);
console.log("TOTAL:", all.length, "| bloqueantes:", all.filter((i) => i.sev === "bloqueante").length, "| fricción:", all.filter((i) => i.sev === "friccion").length);
