import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sdp = await request.text();
    if (!sdp || !sdp.includes("v=0")) {
      return NextResponse.json(
        { error: "SDP offer required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const res = await fetch("http://127.0.0.1:8787/api/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
      },
      body: sdp,
    });

    const answer = await res.text();
    if (!res.ok) {
      return new NextResponse(answer, {
        status: res.status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    return new NextResponse(answer, {
      status: 200,
      headers: { "Content-Type": "application/sdp; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Failed to proxy voice session: ${msg}` },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
