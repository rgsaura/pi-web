/**
 * Server-side Post Studio store: one directory per post under
 * ~/.local/state/exohuman/post-studio/<post>/ with studio.json (definition,
 * authored), state.json (the working selection, atomic writes), the
 * decision.json receipt that feeds OpenPost, and validation.json (the
 * full-post vision validation that gates `decide`).
 *
 * The definition is read-mostly; the exceptions are explicit and locked:
 * `addMusicOption` (a real Instagram track lands in the studio) and
 * `applyVisionAssessments` (per-item vision verdicts). State mutations go
 * through the pure engine in lib/post-studio-shared.ts, serialized per post
 * so two tabs cannot interleave a read-modify-write.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, readdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { serializeByKey } from "./key-serializer";
import {
  POST_ID_RE,
  applyStudioAction,
  buildDecision,
  initialStateFor,
  parseStudioDefinition,
  parseStudioState,
  parseStudioValidation,
  selectionHashFor,
  validationCovers,
  type PostStudioAction,
  type PostStudioDefinition,
  type PostStudioListEntry,
  type PostStudioMusicOption,
  type PostStudioState,
  type PostStudioValidation,
  type PostStudioVisionAssessment,
} from "./post-studio-shared";

export type { PostStudioListEntry } from "./post-studio-shared";

export const DEFAULT_POST_ID = "herradura-2026";

// Cross-request write lock: one promise chain per post on globalThis, so hot
// reloads and parallel route handlers share the queue (see key-serializer.ts).
const POST_STUDIO_WRITE_LOCK = Symbol.for("pi-web.post-studio.writes");

export function postStudioRoot(): string {
  return process.env.POST_STUDIO_ROOT
    ? process.env.POST_STUDIO_ROOT
    : join(homedir(), ".local/state/exohuman/post-studio");
}

export interface PostStudioSnapshot {
  definition: PostStudioDefinition;
  state: PostStudioState;
}

function readJsonFile(path: string): unknown {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 1)}\n`, "utf8");
  renameSync(tmp, path);
}

function loadSnapshot(postId: string): PostStudioSnapshot | null {
  if (!POST_ID_RE.test(postId)) return null;
  const dir = join(postStudioRoot(), postId);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null;
  try {
    const definition = parseStudioDefinition(readJsonFile(join(dir, "studio.json")));
    if (!definition) return null;
    let state: PostStudioState | null = null;
    try {
      state = parseStudioState(readJsonFile(join(dir, "state.json")), definition);
    } catch {
      state = null; // missing or corrupt state falls back to the initial one
    }
    return { definition, state: state ?? initialStateFor(definition) };
  } catch {
    return null;
  }
}

/** GET payload: the definition plus the live working state. */
export function getPostStudio(postId: string): PostStudioSnapshot | null {
  return loadSnapshot(postId);
}

/** Every post with a readable studio.json, newest activity first. */
export function listPostStudios(): PostStudioListEntry[] {
  let dirs: string[] = [];
  try {
    dirs = readdirSync(postStudioRoot(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && POST_ID_RE.test(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
  const entries: PostStudioListEntry[] = [];
  for (const id of dirs) {
    const snapshot = loadSnapshot(id);
    if (!snapshot) continue;
    const { definition, state } = snapshot;
    let updatedAt = state.updatedAt ?? null;
    try {
      const mtime = statSync(join(postStudioRoot(), id, "studio.json")).mtime.toISOString();
      if (!updatedAt || mtime > updatedAt) updatedAt = mtime;
    } catch {}
    entries.push({
      id: definition.id,
      title: definition.title,
      subtitle: definition.subtitle,
      account: definition.account,
      status: definition.status,
      location: definition.plan?.location ?? "",
      mediaCount: definition.media.length,
      selectionCount: state.selection.length,
      realMusicCount: definition.music.filter((m) => m.source === "instagram" && m.audioId).length,
      decidedAt: state.decidedAt,
      updatedAt,
    });
  }
  entries.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return entries;
}

/** The saved full-post validation report (or null). */
export function getValidation(postId: string): PostStudioValidation | null {
  if (!POST_ID_RE.test(postId)) return null;
  try {
    return parseStudioValidation(readJsonFile(join(postStudioRoot(), postId, "validation.json")));
  } catch {
    return null;
  }
}

export function writeValidation(postId: string, validation: PostStudioValidation): void {
  writeJsonAtomic(join(postStudioRoot(), postId, "validation.json"), validation);
}

/** Locked append of one music option (real Instagram track) to studio.json. */
export async function addMusicOption(
  postId: string,
  option: PostStudioMusicOption,
  previewBytes: Uint8Array | null,
): Promise<{ ok: true; snapshot: PostStudioSnapshot } | { ok: false; error: string; status: number }> {
  if (!POST_ID_RE.test(postId)) return { ok: false, error: "BAD_POST_ID", status: 400 };
  const dir = join(postStudioRoot(), postId);
  if (!existsSync(dir)) return { ok: false, error: "POST_NOT_FOUND", status: 404 };
  return serializeByKey(POST_STUDIO_WRITE_LOCK, `post-studio:${postId}`, async () => {
    let raw: Record<string, unknown>;
    try {
      raw = readJsonFile(join(dir, "studio.json")) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    }
    const definition = parseStudioDefinition(raw);
    if (!definition) return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    const existing = definition.music.find((m) => m.audioId && m.audioId === option.audioId);
    if (existing) return { ok: false, error: "MUSIC_ALREADY_ADDED", status: 409 } as const;
    if (definition.music.some((m) => m.id === option.id)) {
      return { ok: false, error: "MUSIC_ID_TAKEN", status: 409 } as const;
    }
    if (previewBytes) {
      mkdirSync(join(dir, "music"), { recursive: true });
      writeFileSync(join(dir, "music", option.file), previewBytes);
    }
    const music = Array.isArray(raw.music) ? [...raw.music, option] : [option];
    writeJsonAtomic(join(dir, "studio.json"), { ...raw, music });
    const snapshot = loadSnapshot(postId);
    if (!snapshot) return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    return { ok: true, snapshot } as const;
  });
}

/**
 * Locked merge of per-item vision assessments into studio.json. Items the
 * validator assessed keep their provenance; only the `vision` field changes.
 */
export async function applyVisionAssessments(
  postId: string,
  assessments: Record<string, PostStudioVisionAssessment>,
): Promise<{ ok: true; snapshot: PostStudioSnapshot } | { ok: false; error: string; status: number }> {
  if (!POST_ID_RE.test(postId)) return { ok: false, error: "BAD_POST_ID", status: 400 };
  const dir = join(postStudioRoot(), postId);
  if (!existsSync(dir)) return { ok: false, error: "POST_NOT_FOUND", status: 404 };
  return serializeByKey(POST_STUDIO_WRITE_LOCK, `post-studio:${postId}`, async () => {
    let raw: Record<string, unknown>;
    try {
      raw = readJsonFile(join(dir, "studio.json")) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    }
    const definition = parseStudioDefinition(raw);
    if (!definition) return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    const media = (Array.isArray(raw.media) ? raw.media : []).map((m) => {
      const item = m as Record<string, unknown>;
      const assessment = typeof item.id === "string" ? assessments[item.id] : undefined;
      return assessment ? { ...item, vision: assessment } : item;
    });
    writeJsonAtomic(join(dir, "studio.json"), { ...raw, media });
    const snapshot = loadSnapshot(postId);
    if (!snapshot) return { ok: false, error: "BAD_DEFINITION", status: 500 } as const;
    return { ok: true, snapshot } as const;
  });
}

/**
 * Every action is applied under the post's write lock and persisted. `decide`
 * additionally requires a fresh, passing validation.json (the visual review
 * gate from enc-ebe31041): without it the state never locks and no
 * decision.json is written.
 */
export async function mutatePostStudio(
  postId: string,
  action: PostStudioAction,
): Promise<
  | { ok: true; snapshot: PostStudioSnapshot; decision?: unknown }
  | { ok: false; error: string; status: number; details?: string[] }
> {
  if (!POST_ID_RE.test(postId)) return { ok: false, error: "BAD_POST_ID", status: 400 };
  const dir = join(postStudioRoot(), postId);
  if (!existsSync(dir)) return { ok: false, error: "POST_NOT_FOUND", status: 404 };
  return serializeByKey(POST_STUDIO_WRITE_LOCK, `post-studio:${postId}`, async () => {
    const snapshot = loadSnapshot(postId);
    if (!snapshot) return { ok: false, error: "POST_NOT_FOUND", status: 404 } as const;
    if (action.action === "decide") {
      const validation = getValidation(postId);
      const covers = validationCovers(validation, snapshot.state);
      if (!covers.ok) {
        const error =
          covers.reason === "MISSING"
            ? "VALIDATION_MISSING"
            : covers.reason === "STALE"
              ? "VALIDATION_STALE"
              : "VALIDATION_ISSUES";
        return { ok: false, error, status: 409 } as const;
      }
    }
    const result = applyStudioAction(snapshot.definition, snapshot.state, action);
    if (!result.ok || !result.state) {
      const status = result.error === "STUDIO_LOCKED" ? 409 : 400;
      return {
        ok: false,
        error: result.error ?? "ACTION_FAILED",
        status,
        ...(result.issues ? { details: result.issues } : {}),
      } as const;
    }
    writeJsonAtomic(join(dir, "state.json"), result.state);
    let decision: unknown;
    if (action.action === "decide") {
      const validation = getValidation(postId)!;
      const decidedAt = result.state.decidedAt ?? new Date().toISOString();
      decision = buildDecision(snapshot.definition, result.state, decidedAt, {
        at: validation.at,
        model: validation.model,
        status: validation.status,
        selectionHash: validation.selectionHash,
      });
      writeJsonAtomic(join(dir, "decision.json"), decision);
    }
    return { ok: true, snapshot: { definition: snapshot.definition, state: result.state }, decision } as const;
  });
}

/** Current selection hash of a post (validation freshness key). */
export function currentSelectionHash(postId: string): string | null {
  const snapshot = loadSnapshot(postId);
  return snapshot ? selectionHashFor(snapshot.state) : null;
}

/**
 * One servable asset of the post: media/<file> or music/<file>, but only
 * when the exact filename appears in the definition. Returns null for
 * anything the definition does not own (no directory reads, no traversal).
 */
export function resolvePostStudioAsset(
  postId: string,
  file: string,
): { path: string; kind: "photo" | "video" | "music"; size: number } | null {
  if (!POST_ID_RE.test(postId)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}\.(jpe?g|png|webp|gif|avif|mp4|webm|mp3|wav|m4a)$/i.test(file)) {
    return null;
  }
  if (file.includes("/") || file.includes("\\")) return null;
  const snapshot = loadSnapshot(postId);
  if (!snapshot) return null;
  const { definition } = snapshot;
  const media = definition.media.find((m) => m.file === file);
  const music = definition.music.find((m) => m.file === file);
  let rel: string | null = null;
  let kind: "photo" | "video" | "music" | null = null;
  if (media) {
    rel = join("media", file);
    kind = media.kind;
  } else if (music) {
    rel = join("music", file);
    kind = "music";
  }
  if (!rel || !kind) return null;
  const path = join(postStudioRoot(), postId, rel);
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size === 0 || stat.size > 96 * 1024 * 1024) return null;
    return { path, kind, size: stat.size };
  } catch {
    return null;
  }
}

/** Ensures the store root exists (dev convenience; dirs are authored). */
export function ensurePostStudioRoot(): void {
  mkdirSync(postStudioRoot(), { recursive: true });
}
