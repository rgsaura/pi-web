/**
 * Client-safe resolution of a proposal option's live preview panel.
 *
 * Ledger entries (written alongside `options` when an F1 proposal carries
 * comparative previews) are `paneles/<slug>` or `paneles/<slug>/<file>`: a
 * panel directory under one of the roots /api/paneles serves (canonical or
 * staging), optionally one specific file of it. The resolver maps them to a
 * same-origin `/api/paneles/…` URL only — never an external origin or port —
 * so a bad ledger entry can neither point the iframe somewhere else nor
 * inject markup into the Decisiones panel.
 *
 * Alignment matches `option_images`: position i of `option_panels` is the
 * preview of position i of `options`; null keeps that option preview-less.
 */

/** A panel slug is a dated directory name the routes would list. */
export const PANEL_SLUG_RE = /^\d{4}-[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9]$/;

/** One subpath segment of a panel entry: a plain servable name, no dotfiles,
 *  no `_` internal entries, no traversal. The route re-validates everything;
 *  this only keeps junk from ever becoming a URL. */
export function isServablePreviewSegment(segment: string): boolean {
  return segment.length > 0 && !segment.startsWith(".") && !segment.startsWith("_") && !segment.includes("/") && !segment.includes("\\");
}

/**
 * Maps one ledger `option_panels` entry to a same-origin preview src, or null
 * when the entry must not be embedded. `paneles/<slug>` (trailing slash
 * optional) resolves to the panel's index; `paneles/<slug>/<file>` to that
 * one file, for multi-page comparative panels.
 */
export function resolveOptionPanelSrc(entry: unknown): string | null {
  if (typeof entry !== "string") return null;
  const value = entry.trim();
  if (!value.startsWith("paneles/")) return null;
  const rest = value.slice("paneles/".length);
  if (!rest) return null;
  const parts = rest.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 6) return null;
  const [slug, ...files] = parts;
  if (!PANEL_SLUG_RE.test(slug)) return null;
  if (slug.includes("..")) return null;
  if (!files.every(isServablePreviewSegment)) return null;
  const encoded = [slug, ...files].map(encodeURIComponent).join("/");
  // A bare panel gets the directory form (trailing slash) so the route
  // injects <base> and the panel's relative assets resolve to themselves.
  return files.length > 0 ? `/api/paneles/${encoded}` : `/api/paneles/${encoded}/`;
}

/** Zips ledger option labels with their preview panel entries, null-padded. */
export function optionPanelsFor(
  optionCount: number,
  rawPanels: unknown,
): (string | null)[] {
  const entries = Array.isArray(rawPanels)
    ? rawPanels
    : typeof rawPanels === "string" && rawPanels
      ? [rawPanels]
      : [];
  const resolved = entries.map(resolveOptionPanelSrc);
  return Array.from({ length: optionCount }, (_, index) => resolved[index] ?? null);
}
