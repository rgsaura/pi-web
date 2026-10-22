/**
 * Server-side reader of the EXO paneles root (~/.local/share/exohuman/paneles), the same
 * directories `rg-panel new` creates: <AAAA-MM-DD>-<slug>/ with index.html +
 * panel.json (+ assets). The ExoHuman UI panel module lists and serves them
 * so deliverables render inside the app with no external port (:30150 stays
 * a compatibility route until it is retired).
 *
 * Two roots are served: the canonical one above (panels promoted by Rodrigo)
 * and the staging root under ~/.local/state/exohuman/paneles, where agent
 * sessions create panels because the write-guard keeps ~/.local/share
 * read-only. A slug in both roots resolves to the canonical copy (promotion
 * wins over its draft), so the same URL keeps working after a promotion.
 *
 * Read-only: creating and archiving panels remains `rg-panel`'s job.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface PanelMeta {
  /** Directory name under the root, e.g. "2026-10-16-surf-platano" — the panel's slug. */
  slug: string;
  titulo: string;
  tipo: string;
  fecha: string;
  resumen: string;
  estado: string;
  /** Pi session ids registered in panel.json (rg-panel new/link write PI_SESSION_ID here). */
  sessions: string[];
  /** Last modification of the panel directory, ISO ("" when unknown). */
  mtime: string;
}

/** Same MIME map the rg-paneles server serves; unknown types fall back to a download. */
export const PANEL_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function panelesRoot(): string {
  return process.env.PANELES_ROOT
    ? process.env.PANELES_ROOT
    : join(homedir(), ".local", "share", "exohuman", "paneles");
}

/** The staging root: panels agent sessions create (write-guard keeps
 *  ~/.local/share read-only, so `rg-panel` writes here during F1 previews).
 *  Served by the same /api/paneles routes, same-origin, no promotion needed. */
export function panelesStagingRoot(): string {
  return process.env.PANELES_STAGING_ROOT
    ? process.env.PANELES_STAGING_ROOT
    : join(homedir(), ".local", "state", "exohuman", "paneles");
}

/** Every root a panel file may resolve against, canonical first, deduped
 *  (the same dir configured twice reads once). */
export function panelesRoots(): string[] {
  const roots = [panelesRoot(), panelesStagingRoot()];
  return roots.filter((root, index) => roots.indexOf(root) === index);
}

/** The directory of one panel slug across roots (canonical wins), or null
 *  when no root holds it. Callers still validate what they serve from it. */
export function resolvePanelDirSync(slug: string): string | null {
  for (const root of panelesRoots()) {
    const dir = join(root, slug);
    try {
      if (statSync(dir).isDirectory()) return dir;
    } catch {
      // Not in this root; try the next.
    }
  }
  return null;
}

/** A panel directory name is dated; templates (_plantillas) and dotfiles are internal. */
export function isPanelDirName(name: string): boolean {
  return /^\d{4}-/.test(name);
}

/** Session ids a panel.json may register: same shape rg-panel accepts (8–64
 * alphanumeric/dash), deduped and capped at the 20 rg-panel link keeps. */
export function parsePanelSessionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const entry of raw) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!/^[0-9a-zA-Z-]{8,64}$/.test(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= 20) break;
  }
  return ids;
}

/** Registered ids out of a raw parsed panel.json value: the object's
 *  `sessions` array; anything else (a bare array, null, broken text)
 *  registers nothing. Shared by the list and the sessions routes so both
 *  read the panel.json the same way. */
export function registeredSessionIds(raw: unknown): string[] {
  return parsePanelSessionIds(
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>).sessions
      : null,
  );
}

/** Parse one panel.json defensively; every field falls back to the directory. */
export function parsePanelMeta(slug: string, raw: unknown): PanelMeta {
  const meta = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const str = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;
  return {
    slug,
    titulo: str(meta.titulo) ?? slug,
    tipo: str(meta.tipo) ?? "otro",
    fecha: str(meta.fecha) ?? slug.slice(0, 10),
    resumen: str(meta.resumen) ?? "",
    estado: str(meta.estado) ?? "activo",
    sessions: registeredSessionIds(meta),
    mtime: "",
  };
}

/** Newest-first by fecha|slug, the rg-paneles index order. */
export function sortPanels(panels: PanelMeta[]): PanelMeta[] {
  return [...panels].sort((a, b) =>
    `${b.fecha}|${b.slug}`.localeCompare(`${a.fecha}|${a.slug}`));
}

/**
 * One path segment of a panel file request is servable when it is a plain
 * name: no dotfiles, no internal `_`-prefixed entries (templates), no
 * traversal. Directory-index resolution happens after the segments check.
 */
export function isServablePanelSegment(segment: string): boolean {
  return segment.length > 0 && !segment.startsWith(".") && !segment.startsWith("_");
}

/** Read the metadata of every panel directory under one root (best-effort per dir). */
function listPanelsInRootSync(root: string): PanelMeta[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const panels: PanelMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isPanelDirName(entry.name)) continue;
    const dir = join(root, entry.name);
    // A panel renders only when it has its index.html; metadata alone does not list.
    if (!existsSync(join(dir, "index.html"))) continue;
    let raw: unknown = null;
    try {
      raw = JSON.parse(readFileSync(join(dir, "panel.json"), "utf8"));
    } catch {
      // Missing or broken panel.json: the directory alone still lists.
    }
    let mtime = "";
    try {
      mtime = statSync(dir).mtime.toISOString();
    } catch {
      // Unreadable stat keeps an empty mtime; the panel still lists.
    }
    panels.push({ ...parsePanelMeta(entry.name, raw), mtime });
  }
  return panels;
}

/** Read the metadata of every panel across roots: canonical panels first,
 *  then staging ones whose slug was not already promoted. */
export function listPanelsSync(): PanelMeta[] {
  const bySlug = new Map<string, PanelMeta>();
  for (const root of panelesRoots()) {
    for (const panel of listPanelsInRootSync(root)) {
      if (!bySlug.has(panel.slug)) bySlug.set(panel.slug, panel);
    }
  }
  return sortPanels([...bySlug.values()]);
}
