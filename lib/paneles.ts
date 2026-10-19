/**
 * Server-side reader of the EXO paneles root (~/srv/paneles), the same
 * directories `rg-panel new` creates: <AAAA-MM-DD>-<slug>/ with index.html +
 * panel.json (+ assets). The ExoHuman UI panel module lists and serves them
 * so deliverables render inside the app with no external port (:30150 stays
 * a compatibility route until it is retired).
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
    : join(homedir(), "srv", "paneles");
}

/** A panel directory name is dated; templates (_plantillas) and dotfiles are internal. */
export function isPanelDirName(name: string): boolean {
  return /^\d{4}-/.test(name);
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

/** Read the metadata of every panel directory under root (best-effort per dir). */
export function listPanelsSync(): PanelMeta[] {
  const root = panelesRoot();
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
  return sortPanels(panels);
}
