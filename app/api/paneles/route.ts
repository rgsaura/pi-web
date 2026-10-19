import { NextResponse } from "next/server";
import { listPanelsSync, type PanelMeta } from "@/lib/paneles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 10_000;

let cache: { data: PanelMeta[]; readAt: number } | null = null;

/** GET /api/paneles — metadata of every panel directory (read-only list). */
export async function GET() {
  try {
    if (!cache || Date.now() - cache.readAt >= CACHE_MS) {
      cache = { data: listPanelsSync(), readAt: Date.now() };
    }
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), paneles: cache.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Paneles unavailable", paneles: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
