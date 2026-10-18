import { NextResponse } from "next/server";
import { getExoData } from "@/lib/exo-data";

export const dynamic = "force-dynamic";

/** Read-only Exo panel data (decisiones and scheduled tasks). */
export async function GET() {
  try {
    return NextResponse.json(await getExoData(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // No upstream detail reaches the browser.
    return NextResponse.json(
      { error: "Exo data unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
