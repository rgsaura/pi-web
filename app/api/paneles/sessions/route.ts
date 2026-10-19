import { NextResponse } from "next/server";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { isPanelDirName, panelesRoot, registeredSessionIds } from "@/lib/paneles";
import { mergePanelSessions, panelSessionNeedle } from "@/lib/paneles-sessions";
import { listAllSessions } from "@/lib/session-reader";
import { searchSessionContents } from "@/lib/session-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/paneles/sessions?slug=<dir> — the Pi sessions related to one panel:
 * those registered in its panel.json (rg-panel new/link with PI_SESSION_ID)
 * plus every session whose transcript mentions the slug, each mention with the
 * snippet that proves it. Read-only; the scan reuses the session-search
 * machinery (stale catalogue, 3 s budget, literal needle).
 */

const CACHE_MS = 20_000;
const CACHE_MAX = 48;
const cache = new Map<string, { body: object; at: number }>();

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const slug = (new URL(request.url).searchParams.get("slug") ?? "").trim();
  if (!isPanelDirName(slug) || slug.includes("/") || slug.includes("\\")) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400, headers });
  }

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.body, { headers });
  }

  const dir = join(panelesRoot(), slug);
  try {
    if (!statSync(dir).isDirectory()) throw new Error("not a directory");
  } catch {
    return NextResponse.json({ error: "Panel not found" }, { status: 404, headers });
  }

  let registered: string[] = [];
  try {
    // panel.json's `sessions` array is the registered direction; the whole
    // meta object is not an array and would parse to nothing.
    registered = registeredSessionIds(JSON.parse(readFileSync(join(dir, "panel.json"), "utf8")));
  } catch {
    // A broken panel.json still allows the transcript scan; it just registers nothing.
  }

  try {
    const catalog = await listAllSessions({ allowStale: true });
    const search = await searchSessionContents(catalog, panelSessionNeedle(slug), request.signal);
    const { sessions, missing } = mergePanelSessions(registered, catalog, search.results);
    const body = { slug, sessions, missing, truncated: search.truncated };
    cache.set(slug, { body, at: Date.now() });
    if (cache.size > CACHE_MAX) {
      cache.delete(cache.keys().next().value as string);
    }
    return NextResponse.json(body, { headers });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500, headers });
  }
}
