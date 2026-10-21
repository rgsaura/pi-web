import { NextResponse } from "next/server";
import { listPanelsSync, type PanelMeta } from "@/lib/paneles";
import { isPanelVisibility } from "@/lib/panel-catalog";
import { writePanelState } from "@/lib/panel-state";

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

interface PanelStateBody {
  slug?: unknown;
  visibilidad?: unknown;
  expira?: unknown;
}

/**
 * POST /api/paneles — the catalog's one write: { slug, visibilidad,
 * expira? } sets a panel's sidebar state (📌 fijado / 🔍 demanda / 🗄️
 * archivado) in its panel.json. `expira: "YYYY-MM-DD"` makes a pin
 * temporal (and registers it with the expiry watcher); `expira: "none"`
 * (or null) clears it. Response: the panel's fresh PanelMeta. Only
 * panel.json of an existing panel directory is ever touched.
 */
export async function POST(request: Request) {
  let body: PanelStateBody;
  try {
    body = (await request.json()) as PanelStateBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const visibilidad = typeof body.visibilidad === "string" ? body.visibilidad : "";
  const expira = body.expira === undefined ? undefined
    : body.expira === null || body.expira === "none" ? null
    : typeof body.expira === "string" ? body.expira
    : undefined;
  if (expira === undefined && body.expira !== undefined) {
    return NextResponse.json({ error: "expira debe ser YYYY-MM-DD, \"none\" o null" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!isPanelVisibility(visibilidad)) {
    return NextResponse.json({ error: "visibilidad debe ser fijado, demanda o archivado" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const result = await writePanelState(slug, {
    visibilidad,
    ...(expira === undefined ? {} : { expira }),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  }
  cache = null;
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), panel: result.panel },
    { headers: { "Cache-Control": "no-store" } },
  );
}
