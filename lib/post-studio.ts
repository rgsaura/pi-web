/**
 * Server-side Post Studio store: one directory per post under
 * ~/.local/state/exohuman/post-studio/<post>/ with studio.json (definition,
 * authored), state.json (the working selection, atomic writes) and the
 * decision.json receipt that feeds OpenPost.
 *
 * The definition is read-mostly; state mutations go through the pure engine
 * in lib/post-studio-shared.ts, serialized per post so two tabs cannot
 * interleave a read-modify-write.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { serializeByKey } from "./key-serializer";
import {
  POST_ID_RE,
  applyStudioAction,
  initialStateFor,
  parseStudioDefinition,
  parseStudioState,
  type PostStudioAction,
  type PostStudioDefinition,
  type PostStudioState,
} from "./post-studio-shared";

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

/** Every action is applied under the post's write lock and persisted. */
export async function mutatePostStudio(
  postId: string,
  action: PostStudioAction,
): Promise<
  { ok: true; snapshot: PostStudioSnapshot; decision?: unknown } | { ok: false; error: string; status: number }
> {
  if (!POST_ID_RE.test(postId)) return { ok: false, error: "BAD_POST_ID", status: 400 };
  const dir = join(postStudioRoot(), postId);
  if (!existsSync(dir)) return { ok: false, error: "POST_NOT_FOUND", status: 404 };
  return serializeByKey(POST_STUDIO_WRITE_LOCK, `post-studio:${postId}`, async () => {
    const snapshot = loadSnapshot(postId);
    if (!snapshot) return { ok: false, error: "POST_NOT_FOUND", status: 404 } as const;
    const result = applyStudioAction(snapshot.definition, snapshot.state, action);
    if (!result.ok || !result.state) {
      const status = result.error === "STUDIO_LOCKED" ? 409 : 400;
      return { ok: false, error: result.error ?? "ACTION_FAILED", status } as const;
    }
    writeJsonAtomic(join(dir, "state.json"), result.state);
    if (result.decision) {
      writeJsonAtomic(join(dir, "decision.json"), result.decision);
    }
    return { ok: true, snapshot: { definition: snapshot.definition, state: result.state }, decision: result.decision } as const;
  });
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
