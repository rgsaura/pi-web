import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { serializeByKey } from "./key-serializer";

const execFileAsync = promisify(execFile);

// ============================================================================
// Spawn routing (enc-a81dfe71): no session is born outside its zone.
//
// ~/.config/exohuman/routing.json is the single source of truth for where a
// session may start. `/api/agent/new` asks `resolveSpawnRouting()` for every
// spawn: a cwd inside the shared BASE tree of a git project never starts
// there — the spawn gets its own worktree (wt-<hex8>, branch fork/<hex8>,
// allocated by `rg-worktree` with a dev port from `rg-port`) and a bounded
// brief (zone path, registry port, ≤2 reference docs, artifact rules). A
// protected tree (production/pre) is refused outright. Everything else is
// passthrough; the route annotates it with the zone a registered worktree
// carries (`lookupWorktreeZone`). Without a routing config the endpoint
// behaves exactly as before.
//
// Failure is always CLOSED: a config that exists but cannot be parsed throws
// `RoutingConfigError` (the spawn fails, never silently passes), and a zone
// that cannot be created rejects the spawn instead of falling back to the
// shared tree.
// ============================================================================

export interface RoutingProjectConfig {
  base: string;
  baseBranch?: string;
  git?: boolean;
  notes?: string;
}

export interface SpawnRoutingConfig {
  worktreesRoot: string;
  portRegistry?: string;
  worktreeRegistry?: string;
  protectedPorts: number[];
  protectedWorktrees: string[];
  projects: Record<string, RoutingProjectConfig>;
}

/** A worktree entry from rg-worktree's registry (~/.local/state/exohuman/worktrees.json). */
export interface RegisteredWorktree {
  name: string;
  encargo: string;
  project: string;
  base?: string;
  branch?: string;
  path?: string;
  port?: string;
}

export interface SpawnZone {
  /** enc-<hex8>, the zone's key in the rg-worktree / rg-port registries */
  encargo: string;
  /** routing.json project key */
  project: string;
  /** shared base tree this zone isolates the session from */
  base: string;
  /** where the session actually starts */
  worktreePath: string;
  /** wt-<hex8> directory name */
  worktreeName: string;
  /** fork/<hex8> */
  branch: string;
  /** dev port from the rg-port registry ("" when none was allocated) */
  port: string;
  /** artifact area outside the worktree: ~/.cache/<encargo> */
  cacheDir: string;
}

export type SpawnCwdClassification =
  | { kind: "passthrough" }
  | { kind: "base_nogit"; project: string; base: string }
  | { kind: "zone_required"; project: string; base: string }
  | { kind: "refused"; reason: string };

/** The route-level decision for one spawn, in classification order. */
export type SpawnRoutingOutcome =
  | { kind: "zone"; zone: SpawnZone; brief: string }
  | { kind: "passthrough" }
  | { kind: "refused"; reason: string };

/** Zone info of a cwd that already lives inside a registered worktree. */
export interface WorktreeZoneInfo {
  project: string;
  encargo: string;
  branch?: string;
  port?: string;
}

export interface SpawnRoutingOptions {
  /** Override the routing.json location (tests). */
  configPath?: string;
  /** Override the rg-worktree binary (tests). */
  rgWorktreeBin?: string;
  /** Override ~ for the cache dir and decision log (tests). */
  homeDir?: string;
}

/** routing.json exists but cannot be used: enforcement fails loudly, never passes through. */
export class RoutingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingConfigError";
  }
}

const RG_WORKTREE_TIMEOUT_MS = 180_000;
const ZONE_CREATE_LOCK = Symbol.for("pi-web:spawn-zone-create-lock");

declare global {
  var __piSpawnRoutingConfigCache: {
    path: string;
    mtimeMs: number;
    size: number;
    config: SpawnRoutingConfig;
  } | undefined;
  var __piSpawnRoutingRegistryCache: {
    path: string;
    mtimeMs: number;
    atMs: number;
    worktrees: RegisteredWorktree[];
  } | undefined;
  var __piPendingZoneBriefs: Map<string, string> | undefined;
}

export function routingConfigPath(options?: SpawnRoutingOptions): string {
  return options?.configPath ?? join(homedir(), ".config", "exohuman", "routing.json");
}

function realPathOrSelf(filePath: string): string {
  try {
    return realpathSync(filePath);
  } catch {
    return filePath;
  }
}

/**
 * Read routing.json, cached by mtime+size (it changes with every encargo).
 * A missing file means the feature is absent → null (plain behaviour). A file
 * that exists but cannot be parsed throws RoutingConfigError: enforcement
 * must fail loudly, never silently pass sessions into a tree it could not
 * classify.
 */
export function loadSpawnRoutingConfig(options?: SpawnRoutingOptions): SpawnRoutingConfig | null {
  const configPath = routingConfigPath(options);
  let stats: { mtimeMs: number; size: number };
  try {
    stats = statSync(configPath);
  } catch {
    return null;
  }
  const cached = globalThis.__piSpawnRoutingConfigCache;
  if (cached && cached.path === configPath && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.config;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    throw new RoutingConfigError(
      `cannot parse ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const record = (raw ?? {}) as Record<string, unknown>;
  const projects: Record<string, RoutingProjectConfig> = {};
  if (record.projects && typeof record.projects === "object") {
    for (const [key, value] of Object.entries(record.projects as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const base = (value as { base?: unknown }).base;
      if (typeof base !== "string" || !base) continue;
      projects[key] = {
        base,
        baseBranch: typeof (value as { baseBranch?: unknown }).baseBranch === "string"
          ? (value as { baseBranch?: string }).baseBranch
          : undefined,
        git: (value as { git?: unknown }).git === true,
        notes: typeof (value as { notes?: unknown }).notes === "string" ? (value as { notes?: string }).notes : undefined,
      };
    }
  }
  if (Object.keys(projects).length === 0) {
    throw new RoutingConfigError(`${configPath} has no usable projects`);
  }
  const rawProtectedPorts = record.protectedPorts;
  const config: SpawnRoutingConfig = {
    worktreesRoot: typeof record.worktreesRoot === "string" ? record.worktreesRoot : "",
    portRegistry: typeof record.portRegistry === "string" ? record.portRegistry : undefined,
    worktreeRegistry: typeof record.worktreeRegistry === "string" ? record.worktreeRegistry : undefined,
    protectedPorts: Array.isArray(rawProtectedPorts)
      ? rawProtectedPorts.filter((p): p is number => typeof p === "number")
      : [],
    protectedWorktrees: Array.isArray(record.protectedWorktrees)
      ? (record.protectedWorktrees.filter((p): p is string => typeof p === "string") as string[])
      : [],
    projects,
  };
  globalThis.__piSpawnRoutingConfigCache = {
    path: configPath,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    config,
  };
  return config;
}

function isWithin(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return p === c || c.startsWith(p + sep);
}

/**
 * Decide what a spawn at `requestedCwd` means under `config`.
 *
 * Order of authority: the longest GIT project base containing the cwd wins
 * (its own zone — even when that base is itself a protected tree, e.g. the
 * shared dev base); then the protected trees refuse the spawn outright (prod
 * and pre are never a place a session is born); then the longest non-git
 * base passes through (the session starts in the base, per routing.json —
 * `general` is the whole home folder, so it must not shadow a protected
 * tree); everything else passes through.
 */
export function classifySpawnCwd(requestedCwd: string, config: SpawnRoutingConfig): SpawnCwdClassification {
  const cwd = realPathOrSelf(requestedCwd);

  const hits = Object.entries(config.projects)
    .map(([key, project]) => ({
      key,
      base: realPathOrSelf(project.base),
      git: project.git === true,
      length: resolve(project.base).length,
    }))
    .filter((hit) => isWithin(hit.base, cwd));
  const longest = (gitOnly: boolean) =>
    hits.reduce<{ key: string; base: string; length: number } | null>(
      (best, hit) => (hit.git === gitOnly && (!best || hit.length > best.length) ? hit : best),
      null,
    );

  const gitHit = longest(true);
  if (gitHit) {
    return { kind: "zone_required", project: gitHit.key, base: gitHit.base };
  }

  for (const protectedTree of config.protectedWorktrees) {
    if (isWithin(realPathOrSelf(protectedTree), cwd)) {
      return {
        kind: "refused",
        reason: `${protectedTree} is a protected tree (production/pre): new sessions cannot start there. Start in the project's base tree instead; it gets its own worktree.`,
      };
    }
  }

  const anyHit = longest(false);
  if (anyHit) {
    return { kind: "base_nogit", project: anyHit.key, base: anyHit.base };
  }
  return { kind: "passthrough" };
}

/** Parse `rg-worktree create` output: the last JSON line carries the zone. */
export function parseRgWorktreeCreateOutput(stdout: string): {
  name: string;
  path: string;
  branch: string;
  port?: string;
  reused?: boolean;
} {
  for (const line of [...stdout.split("\n")].reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        name?: unknown; path?: unknown; branch?: unknown; port?: unknown; reused?: unknown;
      };
      if (typeof parsed.path === "string" && typeof parsed.branch === "string") {
        return {
          name: typeof parsed.name === "string" ? parsed.name : "",
          path: parsed.path,
          branch: parsed.branch,
          port: typeof parsed.port === "string" ? parsed.port : undefined,
          reused: parsed.reused === true,
        };
      }
    } catch {
      // a log line that happens to start with "{" — keep looking
    }
  }
  throw new Error("rg-worktree create produced no worktree (no JSON in its output)");
}

/**
 * Create the zone for a spawn into a git project's shared base: the encargo's
 * worktree and dev port allocated by `rg-worktree` (the canonical registry
 * owner, idempotent per encargo), plus the zone's ~/.cache/<encargo>
 * artifact area.
 *
 * Serialized process-wide: rg-worktree's registry is a read-modify-write file
 * with no lock of its own, so two concurrent spawns must not interleave.
 */
export async function createSpawnZone(
  project: string,
  base: string,
  options?: SpawnRoutingOptions,
): Promise<SpawnZone> {
  const bin = options?.rgWorktreeBin ?? join(options?.homeDir ?? homedir(), ".local", "bin", "rg-worktree");
  const home = options?.homeDir ?? homedir();

  return serializeByKey(ZONE_CREATE_LOCK, bin, async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const hex8 = randomBytes(4).toString("hex");
      const encargo = `enc-${hex8}`;
      try {
        const { stdout } = await execFileAsync(bin, ["create", encargo, "--project", project], {
          timeout: RG_WORKTREE_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        });
        const parsed = parseRgWorktreeCreateOutput(stdout);
        const cacheDir = join(home, ".cache", encargo);
        mkdirSync(cacheDir, { recursive: true });
        return {
          encargo,
          project,
          base,
          worktreePath: parsed.path,
          worktreeName: parsed.name || `wt-${hex8}`,
          branch: parsed.branch,
          port: parsed.port ?? "",
          cacheDir,
        };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const detail = (error as { stderr?: string }).stderr?.trim();
        // A random id colliding with an existing worktree is the only retryable
        // case (4 bytes of entropy, ~1 in 4 billion); anything else is real.
        if (!/ya existe|already exists/i.test(detail ? `${message} ${detail}` : message)) {
          throw new Error(
            `rg-worktree create failed for ${encargo}: ${detail || message}`,
          );
        }
      }
    }
    throw new Error(
      `could not allocate a worktree: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  });
}

/**
 * The rg-worktree registry, cached briefly: recognizing that a cwd already IS
 * a zone (resume) lets the allow path attach the exact project/encargo/port.
 */
export function readRegisteredWorktrees(config: SpawnRoutingConfig, options?: SpawnRoutingOptions): RegisteredWorktree[] {
  const registryPath =
    config.worktreeRegistry ?? join(options?.homeDir ?? homedir(), ".local", "state", "exohuman", "worktrees.json");
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(registryPath).mtimeMs;
  } catch {
    globalThis.__piSpawnRoutingRegistryCache = undefined;
    return [];
  }
  const cached = globalThis.__piSpawnRoutingRegistryCache;
  const now = Date.now();
  if (cached && cached.path === registryPath && cached.mtimeMs === mtimeMs && now - cached.atMs < 5_000) {
    return cached.worktrees;
  }
  const worktrees: RegisteredWorktree[] = [];
  try {
    const raw = JSON.parse(readFileSync(registryPath, "utf-8")) as { worktrees?: Record<string, unknown> };
    for (const [name, value] of Object.entries(raw.worktrees ?? {})) {
      if (!value || typeof value !== "object") continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.encargo !== "string") continue;
      worktrees.push({
        name,
        encargo: entry.encargo,
        project: typeof entry.project === "string" ? entry.project : "",
        base: typeof entry.base === "string" ? entry.base : undefined,
        branch: typeof entry.branch === "string" ? entry.branch : undefined,
        path: typeof entry.path === "string" ? entry.path : undefined,
        port: typeof entry.port === "string" ? entry.port : "",
      });
    }
  } catch {
    // Unreadable registry: spawns still work; only allow-metadata is poorer.
    return [];
  }
  globalThis.__piSpawnRoutingRegistryCache = { path: registryPath, mtimeMs, atMs: now, worktrees };
  return worktrees;
}

function registeredWorktreeFor(cwd: string, config: SpawnRoutingConfig, options?: SpawnRoutingOptions): RegisteredWorktree | null {
  const resolved = resolve(realPathOrSelf(cwd));
  let best: RegisteredWorktree | null = null;
  let bestLength = -1;
  for (const entry of readRegisteredWorktrees(config, options)) {
    const entryPath = entry.path ?? (isAbsolute(entry.name) ? entry.name : "");
    if (!entryPath) continue;
    if (!isWithin(realPathOrSelf(entryPath), resolved)) continue;
    const length = resolve(realPathOrSelf(entryPath)).length;
    if (length > bestLength) {
      best = entry;
      bestLength = length;
    }
  }
  return best;
}

/** Reference docs for the brief: at most 2, from the zone's own checkout. */
export function pickZoneDocs(worktreePath: string): string[] {
  const candidates = ["AGENTS.md", "README.md"];
  return candidates.filter((name) => existsSync(join(worktreePath, name))).slice(0, 2);
}

/** The bounded brief every zoned spawn carries: path, port, ≤2 docs, artifact rules. */
export function buildZoneBrief(zone: SpawnZone, protectedPorts: number[], docs: readonly string[]): string {
  const briefDocs = docs.slice(0, 2);
  const lines: string[] = [];
  lines.push(`[ZONA DE TRABAJO ASIGNADA · ${zone.encargo} · proyecto ${zone.project}]`);
  lines.push(
    `Trabaja SIEMPRE aislado en tu zona: ${zone.worktreePath} (rama ${zone.branch}). El árbol base compartido ${zone.base} es intocable: no escribas ni ejecutes trabajo en él.`,
  );
  const portNote = zone.port
    ? `Puerto dev asignado (registro rg-port): ${zone.port}.`
    : `Sin puerto dev asignado: no arranques servidores en puertos ajenos.`;
  lines.push(
    protectedPorts.length > 0
      ? `${portNote} Puertos protegidos e intocables: ${protectedPorts.join(", ")}.`
      : portNote,
  );
  if (briefDocs.length > 0) {
    lines.push(`Docs de referencia (lee como máximo 2): ${briefDocs.join(" · ")}.`);
  }
  lines.push(
    `Reglas de artefactos: escribe SOLO dentro de tu zona (${zone.worktreePath}) o en ${zone.cacheDir} — nunca en ~ ni en ningún árbol fuera de tu zona.`,
  );
  return lines.join("\n");
}

/** Prepend the zone brief to a prompt message, clearly delimited. */
export function withZoneBrief(brief: string, message: string): string {
  return `${brief}\n\n---\n\n${message}`;
}

// ============================================================================
// The structured decision log: one JSON line per spawn decision, next to the
// other exohuman state (~/.local/state/exohuman/spawn-routing.log), so an
// audit of "where was this session born" never depends on the UI being up.
// ============================================================================

export interface SpawnRoutingLogRecord {
  event: "redirect" | "reject";
  [key: string]: unknown;
}

export function spawnRoutingLogPath(home = homedir()): string {
  return join(home, ".local", "state", "exohuman", "spawn-routing.log");
}

/** Append one decision record to the spawn log (best-effort, never throws). */
export function logSpawnRedirect(record: SpawnRoutingLogRecord, home = homedir()): void {
  try {
    const path = spawnRoutingLogPath(home);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify({ ...record, at: new Date().toISOString() })}\n`);
  } catch (error) {
    console.error("[spawn-routing] could not write decision log:", error);
  }
}

/** Zone info for a cwd inside a registered worktree, or null (exact match wins over `exists`). */
export function lookupWorktreeZone(cwd: string, options?: SpawnRoutingOptions): WorktreeZoneInfo | null {
  const config = loadSpawnRoutingConfig(options);
  if (!config) return null;
  const registered = registeredWorktreeFor(cwd, config, options);
  if (!registered) return null;
  return {
    project: registered.project,
    encargo: registered.encargo,
    ...(registered.branch ? { branch: registered.branch } : {}),
    ...(registered.port ? { port: registered.port } : {}),
  };
}

/**
 * The route-level decision for a spawn: a fresh zone (with its bounded brief),
 * plain passthrough, or refusal. Throws RoutingConfigError (fail closed) when
 * the config cannot be used, and rethrows zone-creation failures — a spawn
 * into a shared base NEVER falls back to starting there.
 */
export async function resolveSpawnRouting(
  requestedCwd: string,
  options?: SpawnRoutingOptions,
): Promise<SpawnRoutingOutcome> {
  const config = loadSpawnRoutingConfig(options);
  if (!config) return { kind: "passthrough" };

  const decision = classifySpawnCwd(requestedCwd, config);
  const home = options?.homeDir ?? homedir();

  if (decision.kind === "refused") {
    logSpawnRedirect({ event: "reject", cwd: requestedCwd, reason: "protected_tree" }, home);
    return {
      kind: "refused",
      reason: `Spawn refused: ${requestedCwd} is a protected tree. ${decision.reason}`,
    };
  }

  if (decision.kind === "zone_required") {
    const zone = await createSpawnZone(decision.project, decision.base, options);
    const brief = buildZoneBrief(zone, config.protectedPorts, pickZoneDocs(zone.worktreePath));
    logSpawnRedirect(
      { event: "redirect", from: requestedCwd, to: zone.worktreePath, project: zone.project, encargo: zone.encargo, port: zone.port || null },
      home,
    );
    return { kind: "zone", zone, brief };
  }

  return { kind: "passthrough" };
}

// ============================================================================
// Pending briefs: ensure_session spawns create the runtime before any message
// exists, so the brief waits (in memory for speed, on disk to survive a server
// restart) and `/api/agent/[id]` prepends it to the session's first prompt.
// ============================================================================

export function spawnZonesRoot(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-spawn-zones");
}

function pendingBriefFile(sessionId: string, agentDir?: string): string {
  return join(spawnZonesRoot(agentDir), `${sessionId}.json`);
}

const PENDING_BRIEF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Best-effort sweep of markers whose session never received its prompt. */
function sweepStalePendingBriefs(agentDir?: string): void {
  try {
    const root = spawnZonesRoot(agentDir);
    const now = Date.now();
    for (const file of readdirSync(root)) {
      if (!file.endsWith(".json")) continue;
      const path = join(root, file);
      try {
        if (now - statSync(path).mtimeMs > PENDING_BRIEF_MAX_AGE_MS) rmSync(path, { force: true });
      } catch {
        // unreadable marker: leave it; consumption removes what it can
      }
    }
  } catch {
    // no directory yet, or a concurrent removal: nothing to sweep
  }
}

export function registerPendingZoneBrief(sessionId: string, brief: string, agentDir?: string): void {
  (globalThis.__piPendingZoneBriefs ??= new Map()).set(sessionId, brief);
  const file = pendingBriefFile(sessionId, agentDir);
  mkdirSync(spawnZonesRoot(agentDir), { recursive: true });
  writeFileSync(file, JSON.stringify({ sessionId, brief }, null, 2), { mode: 0o600 });
  sweepStalePendingBriefs(agentDir);
}

/** One-shot: returns the brief the session's first prompt must carry, if any. */
export function consumePendingZoneBrief(sessionId: string, agentDir?: string): string | null {
  const file = pendingBriefFile(sessionId, agentDir);
  const map = globalThis.__piPendingZoneBriefs;
  const fromMemory = map?.get(sessionId);
  if (fromMemory !== undefined) {
    map!.delete(sessionId);
    try {
      rmSync(file, { force: true });
    } catch {
      // the in-memory brief is authoritative here
    }
    return fromMemory;
  }
  if (!existsSync(file)) return null;
  try {
    const record = JSON.parse(readFileSync(file, "utf-8")) as { brief?: unknown };
    const brief = typeof record.brief === "string" ? record.brief : null;
    rmSync(file, { force: true });
    return brief;
  } catch {
    try {
      rmSync(file, { force: true });
    } catch {
      // unreadable marker: dropped either way
    }
    return null;
  }
}
