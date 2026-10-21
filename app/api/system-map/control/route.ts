import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOVERNOR_OVERRIDE_PATH = join(homedir(), ".config/token-governor/override.json");

function runSystemctl(action: "start" | "stop", unit: string): Promise<boolean> {
  return new Promise((resolve) => {
    const uid = typeof process.getuid === "function" ? process.getuid() : 1000;
    const env = { ...process.env };
    env.DBUS_SESSION_BUS_ADDRESS ??= `unix:path=/run/user/${uid}/bus`;
    env.XDG_RUNTIME_DIR ??= `/run/user/${uid}`;

    execFile("systemctl", ["--user", action, unit], { env }, (err) => {
      resolve(!err);
    });
  });
}

/** POST /api/system-map/control — toggle timers or switch token governor mode */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, unit, mode, temporary } = body;

    if (action === "toggle-timer" && unit) {
      // Validar que sea un timer del sistema
      if (!/^(rg|rot)-.*\.timer$/.test(unit)) {
        return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
      }

      const isStop = body.enable === false;
      const success = await runSystemctl(isStop ? "stop" : "start", unit);
      return NextResponse.json({ ok: success, unit, state: isStop ? "inactive" : "active" });
    }

    if (action === "set-governor-mode" && mode) {
      if (!["turbo", "normal", "eco"].includes(mode)) {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
      }

      // Guardar override
      const dir = join(homedir(), ".config/token-governor");
      try {
        if (!existsSync(dir)) {
          const { mkdirSync } = await import("fs");
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(
          GOVERNOR_OVERRIDE_PATH,
          JSON.stringify({
            mode,
            temporary: Boolean(temporary),
            updated_at: new Date().toISOString(),
          }, null, 2)
        );
      } catch {
        return NextResponse.json({ error: "Could not save override" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, mode, temporary: Boolean(temporary) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
