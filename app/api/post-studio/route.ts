import { NextResponse } from "next/server";
import { DEFAULT_POST_ID, getPostStudio, getValidation, mutatePostStudio } from "@/lib/post-studio";
import { POST_ID_RE } from "@/lib/post-studio-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/post-studio?post=<id> — the studio definition plus the live
 * working state (selection, music, format, decision). Read-only.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const post = url.searchParams.get("post") ?? DEFAULT_POST_ID;
  if (!POST_ID_RE.test(post)) {
    return NextResponse.json({ error: "BAD_POST_ID" }, { status: 400, headers: NO_STORE });
  }
  const snapshot = getPostStudio(post);
  if (!snapshot) {
    return NextResponse.json({ error: "POST_NOT_FOUND" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json(
    { ...snapshot, validation: getValidation(post) },
    { headers: NO_STORE },
  );
}

/**
 * POST /api/post-studio — one studio action: { post, ...action }. Every
 * mutation goes through the pure engine; a decided studio refuses edits
 * until `reopen`. `decide` also writes decision.json (the OpenPost feed).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400, headers: NO_STORE });
  }
  const post = typeof body.post === "string" ? body.post : DEFAULT_POST_ID;
  if (!POST_ID_RE.test(post)) {
    return NextResponse.json({ error: "BAD_POST_ID" }, { status: 400, headers: NO_STORE });
  }
  const { action, ...rest } = body;
  if (typeof action !== "string" || action.length > 40) {
    return NextResponse.json({ error: "BAD_ACTION" }, { status: 400, headers: NO_STORE });
  }
  // Shape the raw body into a typed action; unknown fields are dropped.
  const shaped: Record<string, unknown> = { action };
  for (const key of ["presetId", "id", "musicId", "videoId", "format", "direction", "query", "status", "note"] as const) {
    if (key in rest) shaped[key] = rest[key];
  }
  if (Array.isArray(rest.ids)) shaped.ids = rest.ids;
  if (rest.track === null) shaped.track = null;
  else if (rest.track && typeof rest.track === "object") shaped.track = rest.track;
  const result = await mutatePostStudio(post, shaped as never);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.details ? { details: result.details } : {}) },
      { status: result.status, headers: NO_STORE },
    );
  }
  return NextResponse.json(
    { ...result.snapshot, decision: result.decision ?? null },
    { headers: NO_STORE },
  );
}
