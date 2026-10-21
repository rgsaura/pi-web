// ============================================================================
// Spawn metadata (enc-a81dfe71): what the session index needs to filter
// hundreds of assets correctly — project, encargo, dev port — written by the
// spawn itself, next to the sessions it describes.
//
// A session file's header only records cwd. A worktree path like
// ~/workspaces/wt-1a2b3c4d says nothing about which project, encargo or port
// it belongs to, and the keyword-based category inference can't tell a dozen
// hex8 worktrees apart. So /api/agent/new writes one small sidecar per
// session it spawns:
//
//   <agentDir>/pi-web-spawn-meta/<sessionId>.json
//
// GET /api/sessions attaches it to each matching entry as `routing`, and
// supports ?project=&encargo= server-side filtering. The files are a few
// hundred bytes each and live beside the detached-run records; nothing here
// reads session transcripts.
// ============================================================================

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";
import type { SessionRoutingInfo } from "./types";

/** Everything known about where/why a session was spawned. */
export interface SpawnMetadata {
  sessionId: string;
  /** Routing project key (exohuman-ui, facesearch, …) when routed/known. */
  project?: string;
  /** enc-<hex8> when the spawn was tied to an encargo. */
  encargo?: string;
  /** The worktree the session runs in (equals cwd for worktree spawns). */
  worktreePath?: string;
  branch?: string;
  /** Dev port from the rg-port registry, when one is assigned. */
  port?: string;
  /** Original cwd when the spawn was redirected away from it. */
  routedFrom?: string;
  detached: boolean;
  spawnedAt: string;
}

export function spawnMetaDir(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-spawn-meta");
}

function metaPath(sessionId: string, agentDir?: string): string {
  return join(spawnMetaDir(agentDir), `${sessionId}.json`);
}

/** Write one session's spawn metadata (atomic, best-effort). */
export function writeSpawnMetadata(meta: SpawnMetadata, agentDir?: string): void {
  try {
    // writePrivateFileAtomicSync requires the parent directory to exist.
    mkdirSync(spawnMetaDir(agentDir), { recursive: true });
    writePrivateFileAtomicSync(metaPath(meta.sessionId, agentDir), `${JSON.stringify(meta, null, 2)}\n`);
  } catch (error) {
    console.error("[spawn-metadata] could not write metadata:", error);
  }
}

export function readSpawnMetadata(sessionId: string, agentDir?: string): SpawnMetadata | null {
  const path = metaPath(sessionId, agentDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SpawnMetadata;
  } catch {
    return null;
  }
}

interface MetaCache {
  dirMtimeMs: number;
  atMs: number;
  map: Map<string, SpawnMetadata>;
}

const META_CACHE_TTL_MS = 5_000;

declare global {
  var __piWebSpawnMetaCache: MetaCache | undefined;
}

/** Test seam: drop the map cache. */
export function __resetSpawnMetaCacheForTests(): void {
  globalThis.__piWebSpawnMetaCache = undefined;
}

/**
 * All spawn metadata, keyed by session id. One directory read plus JSON
 * parses, cached briefly: GET /api/sessions calls this on every poll.
 */
export function readSpawnMetadataMap(agentDir?: string): Map<string, SpawnMetadata> {
  const dir = spawnMetaDir(agentDir);
  let dirMtimeMs = 0;
  try {
    dirMtimeMs = statSync(dir).mtimeMs;
  } catch {
    globalThis.__piWebSpawnMetaCache = undefined;
    return new Map();
  }
  const cached = globalThis.__piWebSpawnMetaCache;
  const now = Date.now();
  if (cached && cached.dirMtimeMs === dirMtimeMs && now - cached.atMs < META_CACHE_TTL_MS) {
    return cached.map;
  }
  const map = new Map<string, SpawnMetadata>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, file), "utf8")) as SpawnMetadata;
      if (meta && typeof meta.sessionId === "string") map.set(meta.sessionId, meta);
    } catch {
      // Unreadable sidecar: skip it, never break the session list.
    }
  }
  globalThis.__piWebSpawnMetaCache = { dirMtimeMs, atMs: now, map };
  return map;
}

/** The `routing` field attached to a SessionInfo. */
export function sessionRoutingFields(meta: SpawnMetadata): SessionRoutingInfo {
  return {
    ...(meta.project !== undefined ? { project: meta.project } : {}),
    ...(meta.encargo !== undefined ? { encargo: meta.encargo } : {}),
    ...(meta.worktreePath !== undefined ? { worktreePath: meta.worktreePath } : {}),
    ...(meta.branch !== undefined ? { branch: meta.branch } : {}),
    ...(meta.port !== undefined ? { port: meta.port } : {}),
    ...(meta.routedFrom !== undefined ? { routedFrom: meta.routedFrom } : {}),
    spawnedAt: meta.spawnedAt,
  };
}
