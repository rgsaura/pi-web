/**
 * Client-safe resolution of a proposal option's image entry.
 *
 * Ledger entries (written by `rg-proposal --option-images` / `rg-proposal images`)
 * are either `media/<name>` (a file copied into ~/.local/state/proposals/media,
 * served by /api/exo/media) or an absolute http(s) URL. Anything else is ignored
 * so a bad ledger entry can never inject markup into the Decisiones panel.
 */

const MEDIA_ENTRY_RE = /^media\/([A-Za-z0-9][A-Za-z0-9._-]{0,180})$/;
const HTTP_URL_RE = /^https:\/\/[^\s"'<>]+$/i;
const DATA_URI_RE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]{8,}$/;

/** Extension allowlist mirrored by the media route; SVG stays out (XSS-hardening). */
export const OPTION_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"] as const;

/** True when the media entry's extension is one the route serves. */
export function isAllowedOptionImageName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = name.slice(dot).toLowerCase();
  return (OPTION_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Maps one ledger `option_images` entry to a browser-usable src, or null when
 * the entry must not be rendered. Local files become /api/exo/media/<name>.
 */
export function resolveOptionImageSrc(entry: unknown): string | null {
  if (typeof entry !== "string") return null;
  const value = entry.trim();
  if (!value) return null;
  if (HTTP_URL_RE.test(value)) return value;
  if (DATA_URI_RE.test(value)) return value;
  const match = MEDIA_ENTRY_RE.exec(value);
  if (match) {
    const name = match[1];
    if (name.includes("..")) return null;
    if (!isAllowedOptionImageName(name)) return null;
    return `/api/exo/media/${encodeURIComponent(name)}`;
  }
  return null;
}

/** Zips ledger option labels with their image entries into renderable option images. */
export function optionImagesFor(
  optionCount: number,
  rawImages: unknown,
): (string | null)[] {
  const entries = Array.isArray(rawImages) ? rawImages : typeof rawImages === "string" && rawImages ? [rawImages] : [];
  const resolved = entries.map(resolveOptionImageSrc);
  return Array.from({ length: optionCount }, (_, index) => resolved[index] ?? null);
}
