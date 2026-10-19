import { homedir } from "os";
import { isAbsolute, join } from "path";
import { toSlashPath } from "./paths";

// In-memory roots that should be browsable in addition to roots derived from
// persisted sessions. Stored on globalThis so Next.js hot-reload keeps them.
declare global {
  var __piAllowedRootsCache: { roots: Set<string>; expiresAt: number } | undefined;
  var __piAdditionalAllowedRoots: Set<string> | undefined;
  var __piRemoteRoot: string | undefined;
}

/**
 * Allowed roots are internal bookkeeping keys that are never displayed, so they
 * are stored slash-normalized for consistent Set membership. Correctness does
 * not depend on it — isPathWithinRoots() re-normalizes whatever it is given.
 */
export function normalizeSlashes(filePath: string): string {
  return toSlashPath(filePath);
}

export function getAdditionalAllowedRoots(): Set<string> {
  if (!globalThis.__piAdditionalAllowedRoots) {
    globalThis.__piAdditionalAllowedRoots = new Set();
  }
  return globalThis.__piAdditionalAllowedRoots;
}

export function allowFileRoot(root: string): void {
  if (!root) return;
  const normalizedRoot = normalizeSlashes(root);
  getAdditionalAllowedRoots().add(normalizedRoot);
  globalThis.__piAllowedRootsCache?.roots.add(normalizedRoot);
}

/** The env var that names the remote-hosts root (see getRemoteRoot()). */
export const REMOTE_ROOT_ENV = "PI_WEB_REMOTE_ROOT";

/**
 * Resolve the remote-hosts root from its env value: `~` expands, a relative
 * path is refused (it would shift with the process cwd), and an empty value
 * falls back to the caller's default. Slash-normalized like every root key.
 */
export function resolveRemoteRoot(raw: string | undefined, homeDir: string, fallback: string): string {
  const trimmed = (raw ?? "").trim();
  const candidate = !trimmed ? fallback
    : trimmed === "~" ? homeDir
    : trimmed.startsWith("~/") || trimmed.startsWith("~\\") ? join(homeDir, trimmed.slice(2))
    : trimmed;
  if (!isAbsolute(candidate)) return fallback;
  return normalizeSlashes(candidate);
}

/**
 * The folder holding remote hosts mounted over SSHFS (`~/remote` by default,
 * `PI_WEB_REMOTE_ROOT` to move it). It is an allowed file root even before
 * any session exists in it, so the sidebar's files and new sessions can
 * start there; /api/remote-roots lists its hosts as projects. Resolved once
 * per process.
 */
export function getRemoteRoot(): string {
  return (globalThis.__piRemoteRoot ??= resolveRemoteRoot(
    process.env[REMOTE_ROOT_ENV],
    homedir(),
    normalizeSlashes(join(homedir(), "remote")),
  ));
}
