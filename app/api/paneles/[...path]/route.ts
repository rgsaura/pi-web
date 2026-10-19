import { NextResponse } from "next/server";
import { createReadStream, realpathSync, readFileSync, statSync } from "fs";
import { join, extname } from "path";
import { PANEL_MIME, isServablePanelSegment, panelesRoot } from "@/lib/paneles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paneles/<dir>[/<asset>] — serves one panel's files from the
 * paneles root, the same bytes the standalone :30150 server used to serve:
 * a directory serves its index.html, so an iframe (or a new tab) pointed at
 * `/api/paneles/<dir>/` renders the deliverable with its relative assets.
 *
 * Only plain segments under the root: no dotfiles, no `_`-prefixed internal
 * entries (templates), no traversal; symlinks must resolve back inside the
 * root. Read-only GET, size-capped, inline + nosniff.
 */

const MAX_BYTES = 64 * 1024 * 1024;
/** HTML files bigger than this are streamed untouched (no <base> injection). */
const MAX_INJECTED_HTML_BYTES = 2 * 1024 * 1024;

function notFound(code: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: code },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Panels are authored with relative asset URLs (images, css, fetches), which
 * resolve against the page URL. Next normalizes `/api/paneles/<dir>/` to the
 * slashless form, so without a <base> every relative ref would land on the
 * parent `/api/paneles/` path. Injecting <base href> pins them to the panel's
 * own directory, whichever form the browser loaded.
 */
function injectBaseTag(html: string, segments: string[]): string {
  const dirSegments = extname(segments[segments.length - 1] ?? "")
    ? segments.slice(0, -1)
    : segments;
  const href = `/api/paneles/${dirSegments.map(encodeURIComponent).join("/")}/`;
  const tag = `<base href="${href}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (htmlTag) => `${htmlTag}<head>${tag}</head>`);
  return `${tag}${html}`;
}

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : [];
  if (segments.length === 0 || !segments.every(isServablePanelSegment)) {
    return notFound("PANEL_NOT_FOUND");
  }

  const root = panelesRoot();
  let target = join(root, ...segments);
  if (!target.startsWith(root + "/")) return notFound("PANEL_NOT_FOUND");

  let stat;
  try {
    stat = statSync(target);
  } catch {
    return notFound("PANEL_NOT_FOUND");
  }
  if (stat.isDirectory()) target = join(target, "index.html");

  // Resolve symlinks: a panel directory must not serve files from outside
  // the paneles root (same rule as the upload target check).
  try {
    const realTarget = realpathSync(target);
    const realRoot = realpathSync(root);
    if (!realTarget.startsWith(realRoot + "/")) return notFound("PANEL_NOT_FOUND");
  } catch {
    return notFound("PANEL_NOT_FOUND");
  }

  try {
    stat = statSync(target);
  } catch {
    return notFound("PANEL_NOT_FOUND");
  }
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) {
    return notFound("PANEL_NOT_FOUND");
  }

  const ext = extname(target).toLowerCase();
  const contentType = PANEL_MIME[ext] ?? "application/octet-stream";
  const isVolatile = contentType.startsWith("text/html") || ext === ".json";

  if (contentType.startsWith("text/html") && stat.size <= MAX_INJECTED_HTML_BYTES) {
    const html = injectBaseTag(readFileSync(target, "utf8"), segments);
    const body = Buffer.from(html, "utf8");
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }

  const stream = createReadStream(target) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": isVolatile ? "no-store" : "private, max-age=60",
    },
  });
}
