/**
 * The catalog's one write: a panel's visibility (and its temporal expiry)
 * in its own panel.json, preserving every other field rg-panel or an agent
 * wrote. POST /api/paneles is the only caller. Locked per panel
 * (serializeByKey) and atomic (writePrivateFileAtomicSync), so two tabs
 * racing the same panel never interleave writes.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { serializeByKey } from "./key-serializer";
import { isPanelDirName, parsePanelMeta, panelesRoot, type PanelMeta } from "./paneles";
import { isPanelVisibility, normalizePanelExpiry, type PanelVisibility } from "./panel-catalog";
import { syncPanelExpiryRegistry } from "./panel-expiry";

const PANEL_STATE_LOCK = Symbol.for("pi-web.paneles.state");

export interface PanelStateUpdate {
  visibilidad: PanelVisibility;
  /** null leaves it as-is; "none" clears it; "YYYY-MM-DD" sets it. */
  expira?: string | null;
}

export type PanelStateResult =
  | { ok: true; panel: PanelMeta }
  | { ok: false; error: string; status: number };

/** The panel's directory under the root, when the slug is a real panel name. */
export function panelDirFor(slug: string): string | null {
  if (!isPanelDirName(slug) || slug.includes("/") || slug.includes("\\")) return null;
  return join(panelesRoot(), slug);
}

/** Read one panel's current metadata (panel.json included); null when absent. */
export function readPanelMetaSync(slug: string): PanelMeta | null {
  const dir = panelDirFor(slug);
  if (!dir) return null;
  if (!existsSync(join(dir, "index.html"))) return null;
  let raw: unknown = null;
  try {
    raw = JSON.parse(readFileSync(join(dir, "panel.json"), "utf8"));
  } catch {
    return null;
  }
  let mtime = "";
  try {
    mtime = statSync(dir).mtime.toISOString();
  } catch {
    // The panel still lists with an empty mtime.
  }
  return { ...parsePanelMeta(slug, raw), mtime };
}

/**
 * Apply a visibility (and optional expiry) change to the panel's panel.json:
 * `estado` becomes the visibility itself, `expira` is set or cleared, and
 * every other field (sessions, titulo, resumen…) is preserved byte for
 * byte in meaning. A temporal pin also keeps the expiry registry in step
 * (lib/panel-expiry.ts), so the existing watcher proposes archiving when
 * the date nears. The expiry is refused on a non-pinned panel: it only
 * means something while pinned.
 */
export async function writePanelState(slug: string, update: PanelStateUpdate): Promise<PanelStateResult> {
  if (!isPanelVisibility(update.visibilidad)) {
    return { ok: false, error: "visibilidad inválida", status: 400 };
  }
  const dir = panelDirFor(slug);
  if (!dir) return { ok: false, error: "slug de panel inválido", status: 400 };
  if (!existsSync(join(dir, "index.html")) || !existsSync(join(dir, "panel.json"))) {
    return { ok: false, error: "panel no encontrado", status: 404 };
  }
  let nextExpira: string | null | undefined;
  if (update.visibilidad !== "fijado") {
    // An expiry only means something while pinned: unpinned or archived,
    // it goes (and so does its watcher entry), whatever the request said.
    nextExpira = null;
  } else if (update.expira !== undefined) {
    if (update.expira === null || update.expira === "none") {
      nextExpira = null;
    } else {
      nextExpira = normalizePanelExpiry(update.expira);
      if (!nextExpira) return { ok: false, error: "expira debe ser YYYY-MM-DD, \"none\" o null", status: 400 };
    }
  }

  return serializeByKey(PANEL_STATE_LOCK, slug, async () => {
    let raw: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir!, "panel.json"), "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false as const, error: "panel.json no es un objeto", status: 500 };
      }
      raw = parsed as Record<string, unknown>;
    } catch {
      return { ok: false as const, error: "panel.json ilegible", status: 500 };
    }
    raw.estado = update.visibilidad;
    if (nextExpira === null) delete raw.expira;
    else if (nextExpira) raw.expira = nextExpira;
    try {
      writePrivateFileAtomicSync(join(dir!, "panel.json"), `${JSON.stringify(raw, null, 2)}\n`);
    } catch {
      return { ok: false as const, error: "no se pudo escribir panel.json", status: 500 };
    }
    const finalExpira = nextExpira !== undefined ? nextExpira : normalizePanelExpiry(raw.expira);
    if (update.visibilidad !== "archivado" && finalExpira) {
      const titulo = typeof raw.titulo === "string" && raw.titulo.trim() ? raw.titulo.trim() : slug;
      syncPanelExpiryRegistry(slug, { dir: dir!, titulo, expira: finalExpira });
    } else {
      syncPanelExpiryRegistry(slug, null);
    }
    const panel = readPanelMetaSync(slug);
    if (!panel) return { ok: false as const, error: "panel no encontrado tras escribir", status: 500 };
    return { ok: true as const, panel };
  });
}
