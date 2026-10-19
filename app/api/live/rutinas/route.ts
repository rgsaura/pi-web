import { execFile } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/live/rutinas — next fire time of the rg-* user timers, the same
 * projection the standalone paneles server exposed. Panels fetch it at
 * `/api/live/rutinas`; serving it here keeps existing panel HTML working
 * unchanged once it renders inside ExoHuman UI.
 */

interface Rutina {
  name: string;
  nextIso: string | null;
}

function listRutinas(): Promise<Rutina[]> {
  return new Promise((resolve) => {
    // A server started from a bare shell has no session bus; fill in the
    // per-user defaults so systemctl --user works (same fix as /api/timeline).
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const env = { ...process.env };
    env.DBUS_SESSION_BUS_ADDRESS ??= `unix:path=/run/user/${uid}/bus`;
    env.XDG_RUNTIME_DIR ??= `/run/user/${uid}`;
    execFile(
      "systemctl",
      ["--user", "list-timers", "rg-*", "--no-legend", "--plain", "-o", "json"],
      { timeout: 10_000, maxBuffer: 1 << 20, env },
      (error, stdout) => {
        if (error || !stdout.trim()) return resolve([]);
        try {
          const timers = JSON.parse(stdout)
            .filter((t: { unit?: unknown }) => typeof t.unit === "string" && t.unit.endsWith(".timer"))
            .map((t: { unit: string; next?: number }) => {
              const next = Number(t.next);
              return {
                name: t.unit.replace(/\.timer$/, ""),
                nextIso: Number.isFinite(next) && next > 0
                  ? new Date(next / 1000).toISOString()
                  : null,
              };
            })
            .sort((a: Rutina, b: Rutina) => (a.nextIso ?? "9").localeCompare(b.nextIso ?? "9"));
          resolve(timers as Rutina[]);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

export async function GET() {
  const rutinas = await listRutinas();
  return NextResponse.json(
    { generatedAt: new Date().toISOString(), rutinas },
    { headers: { "Cache-Control": "no-store" } },
  );
}
