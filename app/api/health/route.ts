import { NextResponse } from "next/server";

/**
 * Liveness/readiness probe (enc-29d7943d flujo-mejoras): same contract for
 * every role. No sensitive data — role, app version and timestamp only.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      role: process.env.PI_WEB_ROLE ?? "full",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      runner: process.env.EXO_RUNNER_MODE ?? "systemd",
      time: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
