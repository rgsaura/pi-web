import { NextResponse } from "next/server";
import { listPostStudios } from "@/lib/post-studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/post-studio/list — every studio post under the store root, newest
 * activity first. Generic entry point (no post hardcoded): the picker and
 * deep links both start here.
 */
export async function GET() {
  return NextResponse.json({ posts: listPostStudios() }, { headers: NO_STORE });
}
