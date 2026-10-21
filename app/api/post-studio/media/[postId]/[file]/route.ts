import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { resolvePostStudioAsset } from "@/lib/post-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/post-studio/media/<post>/<file> — one studio asset (photo, reel
 * video or music loop). The filename must be owned by the definition; the
 * bytes come from the post's media/ or music/ directory. Audio and video
 * answer HTTP Range requests (206) because Safari/iOS refuses media
 * elements whose server never ranges.
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
};

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function notFound(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "ASSET_NOT_FOUND" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request, context: { params: Promise<{ postId: string; file: string }> }) {
  const { postId, file } = await context.params;
  const asset = resolvePostStudioAsset(postId, decodeURIComponent(file));
  if (!asset) return notFound();

  const ext = extOf(asset.path);
  const contentType = MIME[ext];
  if (!contentType) return notFound();
  const streamable = contentType.startsWith("audio/") || contentType.startsWith("video/");

  const range = streamable ? parseRange(request.headers.get("range"), asset.size) : null;
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": streamable ? "bytes" : "none",
    "Cache-Control": streamable ? "private, max-age=300" : "private, max-age=3600",
  };

  if (range) {
    const nodeStream = createReadStream(asset.path, { start: range.start, end: range.end }) as unknown as ReadableStream;
    return new Response(nodeStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${asset.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }

  const nodeStream = createReadStream(asset.path) as unknown as ReadableStream;
  return new Response(nodeStream, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(asset.size) },
  });
}
