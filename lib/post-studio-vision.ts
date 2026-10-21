/**
 * Post Studio full-post vision validation (v2, enc-ebe31041): what the
 * selected slides ACTUALLY show, judged against the post's plan and caption
 * before Rodrigo ever sees it. This is the gate behind `decide` — the studio
 * refuses to lock a post whose slides were never visually vetted.
 *
 * Implementation: the Next server downscales the selected photos with sharp,
 * extracts representative frames of selected videos with ffmpeg on CT126
 * (best-effort, honest "unclear" when a video cannot be inspected), and runs
 * ONE bounded multimodal pass through Rodrigo's LiteLLM gateway (the same
 * credential route ~/.pi/agent/extensions/litellm uses: LITELLM_API_KEY or
 * ~/.env-pi — the key is never printed, logged or persisted).
 *
 * Gateway models rotate in health (probed 2026-10-20: zai-glm-flash sees,
 * failover-normal 429s on images), so the pass tries a candidate list in
 * order and the report records which model judged.
 *
 * The report lands in validation.json (selectionHash-scoped, so any edit to
 * the selection stales it) and fills in per-item `vision` entries in
 * studio.json where the prep agent left gaps.
 */

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import sharp from "sharp";
import {
  selectionHashFor,
  takenAtInPlan,
  type PostStudioDefinition,
  type PostStudioMediaItem,
  type PostStudioState,
  type PostStudioValidation,
  type PostStudioValidationItem,
  type PostStudioVisionAssessment,
} from "./post-studio-shared";

export type VisionValidationError =
  | "VISION_NO_SELECTION"
  | "VISION_NO_KEY"
  | "VISION_TIMEOUT"
  | "VISION_MODEL_FAILED"
  | "VISION_BAD_RESPONSE";

const MAX_IMAGES = 24;
const MAX_IMAGE_EDGE = 1120;
const MAX_IMAGE_BYTES = 420_000; // per image, after JPEG encode
const MODEL_TIMEOUT_MS = 240_000;
const VIDEO_FRAME_TIMEOUT_MS = 75_000;

export interface VisionValidationOutcome {
  ok: boolean;
  error?: VisionValidationError;
  validation?: PostStudioValidation;
  /** Items whose missing `vision` gap the model pass filled in studio.json. */
  filled?: string[];
}

function resolveGatewayKey(): string | null {
  if (process.env.LITELLM_API_KEY) return process.env.LITELLM_API_KEY;
  try {
    const raw = readFileSync(join(homedir(), ".env-pi"), "utf8");
    const m = /^\s*(?:export\s+)?LITELLM_API_KEY\s*=\s*["']?([^\s"'#]+)/m.exec(raw);
    if (m) return m[1];
  } catch {}
  return null;
}

/** Candidate vision models, first healthy one wins (env-overridable). */
export function visionModels(): string[] {
  if (process.env.POST_STUDIO_VISION_MODELS) {
    return process.env.POST_STUDIO_VISION_MODELS.split(",").map((m) => m.trim()).filter(Boolean);
  }
  if (process.env.POST_STUDIO_VISION_MODEL) return [process.env.POST_STUDIO_VISION_MODEL];
  return ["zai-glm-flash", "failover-normal", "antigravity-gemini-flash"];
}

export function visionGatewayUrl(): string {
  return process.env.POST_STUDIO_VISION_URL || "http://100.117.46.29:4000/v1/chat/completions";
}

/** Downscale one photo to a bounded JPEG data URL for the model pass. */
async function photoDataUrl(absPath: string): Promise<string | null> {
  try {
    let img = sharp(absPath, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    if (meta.width && meta.width > MAX_IMAGE_EDGE) img = img.resize({ width: MAX_IMAGE_EDGE });
    const buf = await img.jpeg({ quality: 72 }).toBuffer();
    const out = buf.length > MAX_IMAGE_BYTES ? await img.jpeg({ quality: 55 }).toBuffer() : buf;
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Best-effort: up to two representative frames of a video via ffmpeg on
 * CT126 (the local file streams over ssh stdin; nothing is stored remotely).
 * Returns [] when unavailable — the caller marks the video honestly uninspected.
 */
function videoFramesOverSsh(absPath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const remote =
      "ffmpeg -loglevel error -i pipe:0 -vf 'fps=1/4,scale=1024:-2' -frames:v 2 -f image2pipe -vcodec mjpeg pipe:1";
    const child = spawn(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", process.env.POST_STUDIO_IG_HOST || "exo-services-ts", remote],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    const chunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("timeout"));
      }
    }, VIDEO_FRAME_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ssh exit ${code}`));
    });
    child.stdin.on("error", () => undefined); // broken pipe ≠ crash
    try {
      child.stdin.end(readFileSync(absPath));
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error as Error);
      }
    }
  });
}

async function videoFrameDataUrls(absPath: string): Promise<string[]> {
  try {
    const buffer = await videoFramesOverSsh(absPath);
    const frames: string[] = [];
    // Split the concatenated JPEG stream on SOI/EOI markers.
    let start = buffer.indexOf(Buffer.from([0xff, 0xd8]));
    while (start >= 0 && frames.length < 2) {
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
      if (end < 0) break;
      frames.push(`data:image/jpeg;base64,${buffer.subarray(start, end + 2).toString("base64")}`);
      start = buffer.indexOf(Buffer.from([0xff, 0xd8]), end + 2);
    }
    return frames;
  } catch {
    return [];
  }
}

function itemLabel(index: number, item: PostStudioMediaItem, frame?: number): string {
  const bits = [
    `#${index}`,
    item.kind === "video" ? `vídeo${frame ? ` fotograma ${frame}` : ""}` : "foto",
    item.date ? `fecha: ${item.date}${item.time ? ` ${item.time}` : ""}` : "fecha: desconocida",
    item.sender ? `la compartió: ${item.sender}` : "",
    item.place ? `lugar: ${item.place}` : "",
    item.caption ? `notas del equipo: ${item.caption}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

const SYSTEM_PROMPT = `Eres el validador visual de Post Studio. Recibirás fotos y fotogramas de un post de Instagram, con su plan (qué historia cuenta: lugar, fechas, personas), el borrador del caption y el orden de los slides.

Tu trabajo: mirar CADA imagen y decir QUÉ MUESTRA REALMENTE (no asumas por el nombre del archivo), y si es coherente con el plan del post.

Veredictos por imagen:
- "fit": la imagen muestra contenido del plan y encaja en la narrativa del post.
- "unclear": no se puede juzgar bien (borrosa, encuadre ambiguo, un fotograma de vídeo insuficiente…).
- "off": la imagen NO pertenece a esta historia (otro evento, otra gente, otro lugar, una captura de pantalla, un documento, una diapositiva de presentación, un acto sin relación…).

Responde SOLO con JSON válido, sin markdown, con esta forma exacta:
{
 "items": [{"i": 1, "verdict": "fit|unclear|off", "desc": "qué se ve en una frase", "issues": ["razón si no es fit"]}],
 "issues": ["problemas globales: orden narrativo, caption incoherente, imagen repetida casi idéntica, etc."],
 "notes": "frase corta con el conjunto del post"
}`;

export interface VisionRunInputs {
  definition: PostStudioDefinition;
  state: PostStudioState;
  mediaRoot: string;
}

interface ModelJson {
  items: { i: number; verdict: string; desc: string; issues?: string[] }[];
  issues?: string[];
  notes?: string;
}

function parseModelJson(text: string): ModelJson | null {
  const trimmed = text.trim().replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  const asObject = (value: unknown): ModelJson | null => {
    if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) return null;
    return value as ModelJson;
  };
  try {
    return asObject(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return asObject(JSON.parse(trimmed.slice(start, end + 1)));
      } catch {}
    }
    return null;
  }
}

/** One gateway call against one candidate model; null = try the next model. */
async function callModel(
  model: string,
  key: string,
  content: Record<string, unknown>[],
): Promise<{ parsed: ModelJson } | { error: VisionValidationError }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    const res = await fetch(visionGatewayUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 6000,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return { error: res.status === 429 ? "VISION_TIMEOUT" : "VISION_MODEL_FAILED" };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content ?? "";
    const parsed = parseModelJson(text);
    if (!parsed) return { error: "VISION_BAD_RESPONSE" };
    return { parsed };
  } catch (error) {
    const err = error as Error;
    return { error: err.name === "AbortError" ? "VISION_TIMEOUT" : "VISION_MODEL_FAILED" };
  }
}

/**
 * One bounded multimodal pass over the current selection. Writes
 * validation.json and fills missing per-item vision gaps in studio.json
 * (through the caller-provided hooks — see app/api/post-studio/validate).
 */
export async function runVisionValidation(
  inputs: VisionRunInputs,
  persist: {
    saveValidation: (validation: PostStudioValidation) => void;
    fillVision: (assessments: Record<string, PostStudioVisionAssessment>) => Promise<void>;
  },
): Promise<VisionValidationOutcome> {
  const { definition, state, mediaRoot } = inputs;
  const byId = new Map(definition.media.map((m) => [m.id, m]));
  const selected = state.selection.map((id) => byId.get(id)).filter((m): m is PostStudioMediaItem => !!m);
  if (selected.length === 0) return { ok: false, error: "VISION_NO_SELECTION" };
  if (selected.length > MAX_IMAGES) selected.length = MAX_IMAGES;
  const key = resolveGatewayKey();
  if (!key) return { ok: false, error: "VISION_NO_KEY" };

  const plan = definition.plan;
  const content: Record<string, unknown>[] = [];
  const itemMeta: { id: string; desc: string; issues: string[]; modelSeen: boolean }[] = [];
  content.push({
    type: "text",
    text:
      `PLAN DEL POST (contexto EXO):\n` +
      `${plan ? `${plan.summary}\nlugar: ${plan.location} · fechas: ${plan.dateStart} → ${plan.dateEnd}${plan.people.length ? ` · personas: ${plan.people.join(", ")}` : ""}` : "(sin plan registrado)"}\n\n` +
      `CAPTION BORRADOR:\n${definition.caption}\n${definition.hashtags}\n\n` +
      `SLIDES EN ORDEN (${selected.length}):`,
  });

  let index = 0;
  let seenImages = 0;
  for (const item of selected) {
    index += 1;
    const abs = join(mediaRoot, item.file);
    let framed = false;
    if (item.kind === "photo") {
      const dataUrl = await photoDataUrl(abs);
      if (dataUrl) {
        content.push({ type: "text", text: itemLabel(index, item) });
        content.push({ type: "image_url", image_url: { url: dataUrl } });
        framed = true;
        seenImages += 1;
      }
    } else {
      const frames = await videoFrameDataUrls(abs);
      for (let f = 0; f < frames.length; f++) {
        content.push({ type: "text", text: itemLabel(index, item, f + 1) });
        content.push({ type: "image_url", image_url: { url: frames[f] } });
        framed = true;
      }
      seenImages += frames.length;
    }
    itemMeta.push({
      id: item.id,
      desc: framed ? "" : "no inspeccionado visualmente (sin imagen disponible para el modelo)",
      issues: framed ? [] : ["sin imagen para el validador"],
      modelSeen: framed,
    });
  }
  if (seenImages === 0) {
    return { ok: false, error: "VISION_BAD_RESPONSE" };
  }
  content.push({
    type: "text",
    text: "Recuerda: responde SOLO con el JSON (items con i=1..N en el mismo orden, más issues y notes).",
  });

  // Try each candidate model until one returns a parseable judgement.
  let parsed: ModelJson | null = null;
  let usedModel = "";
  let lastError: VisionValidationError = "VISION_MODEL_FAILED";
  for (const model of visionModels()) {
    const out = await callModel(model, key, content);
    if ("parsed" in out) {
      parsed = out.parsed;
      usedModel = model;
      break;
    }
    lastError = out.error;
  }
  if (!parsed) return { ok: false, error: lastError };

  // Map model verdicts back by slide order (one entry per slide; a video with
  // two frames counts once — the first frame entry wins, issues merge).
  const items: PostStudioValidationItem[] = [];
  for (let i = 0; i < itemMeta.length; i++) {
    const meta = itemMeta[i];
    const found = parsed.items.filter((it) => Number(it.i) === i + 1);
    if (found.length > 0 && meta.modelSeen) {
      const first = found[0];
      const verdict = first.verdict === "off" ? "off" : first.verdict === "unclear" ? "unclear" : "fit";
      const issues = found.flatMap((f) => (Array.isArray(f.issues) ? f.issues.filter((x): x is string => typeof x === "string") : []));
      items.push({ id: meta.id, verdict, desc: typeof first.desc === "string" ? first.desc.slice(0, 400) : "", issues });
    } else {
      items.push({ id: meta.id, verdict: "unclear", desc: meta.desc || "sin lectura del modelo", issues: meta.issues });
    }
  }

  const globalIssues = Array.isArray(parsed.issues) ? parsed.issues.filter((x): x is string => typeof x === "string") : [];
  // Deterministic provenance warnings ride along (visible, non-blocking).
  for (const item of selected) {
    if (takenAtInPlan(item, plan) === false) {
      globalIssues.push(`procedencia: «${item.caption || item.id}» (${item.date ?? "sin fecha"}) cae fuera del rango del plan`);
    }
  }
  const anyOff = items.some((it) => it.verdict === "off");
  const status: PostStudioValidation["status"] = anyOff ? "issues" : "ok";
  const validation: PostStudioValidation = {
    status,
    at: new Date().toISOString(),
    model: usedModel,
    selectionHash: selectionHashFor(state),
    items,
    issues: globalIssues,
    ...(typeof parsed.notes === "string" ? { notes: parsed.notes.slice(0, 600) } : {}),
  };
  persist.saveValidation(validation);

  // Fill ONLY the gaps the prep agent left; authored verdicts stay untouched.
  const filled: string[] = [];
  const fill: Record<string, PostStudioVisionAssessment> = {};
  for (const it of items) {
    const item = byId.get(it.id);
    if (item && !item.vision && it.verdict !== "unclear") {
      fill[it.id] = {
        verdict: it.verdict,
        desc: it.desc,
        ...(it.issues.length ? { issues: it.issues } : {}),
        by: `model:${usedModel}`,
        at: validation.at,
      };
      filled.push(it.id);
    }
  }
  if (Object.keys(fill).length > 0) await persist.fillVision(fill);
  return { ok: true, validation, filled };
}
