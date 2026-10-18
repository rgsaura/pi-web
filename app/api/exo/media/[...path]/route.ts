import { NextResponse } from "next/server";
import { createReadStream, existsSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { Readable } from "stream";
import { OPTION_IMAGE_EXTENSIONS } from "@/lib/exo-media";

export const dynamic = "force-dynamic";

/**
 * GET /api/exo/media/<file> — serves one image of the decisions ledger's media
 * dir (~/.local/state/proposals/media, populated by `rg-proposal
 * --option-images` / `rg-proposal images`). Only rasters the resolver admits:
 * no SVG, no dotfiles, no subpaths, size-capped, always inline + nosniff.
 */

const MAX_BYTES = 15 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function mediaDir(): string {
  return process.env.RG_PROPOSALS_MEDIA
    ? process.env.RG_PROPOSALS_MEDIA
    : join(homedir(), ".local/state/proposals/media");
}

function notFound(code: string): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  const segments = Array.isArray(path) ? path : [];
  if (segments.length !== 1) return notFound("EXO_MEDIA_NOT_FOUND");

  const name = basename(segments[0]);
  if (!name || name.startsWith(".") || name.includes("/")) return notFound("EXO_MEDIA_NOT_FOUND");
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return notFound("EXO_MEDIA_NOT_FOUND");
  const ext = name.slice(dot).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType || !(OPTION_IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    return notFound("EXO_MEDIA_UNSUPPORTED_TYPE");
  }

  const filePath = join(mediaDir(), name);
  if (!existsSync(filePath)) return notFound("EXO_MEDIA_NOT_FOUND");

  let size: number;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return notFound("EXO_MEDIA_NOT_FOUND");
    size = stat.size;
  } catch {
    return notFound("EXO_MEDIA_NOT_FOUND");
  }
  if (size > MAX_BYTES) return notFound("EXO_MEDIA_TOO_LARGE");
  if (size === 0) return notFound("EXO_MEDIA_NOT_FOUND");

  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=60",
    },
  });
}
