import { NextResponse } from "next/server";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession, setRpcSessionTools } from "@/lib/rpc-manager";
import { isDetachedRunActive, abortDetachedRun } from "@/lib/detached-runner";
import { consumePendingZoneBrief, withZoneBrief } from "@/lib/spawn-routing";

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;
    const requestedToolNames = body.toolNames;
    if (
      requestedToolNames !== undefined
      && (!Array.isArray(requestedToolNames) || requestedToolNames.some((name) => typeof name !== "string"))
    ) {
      throw new Error("toolNames must be an array of strings");
    }
    const toolNames = requestedToolNames as string[] | undefined;

    // Detached runs own their session file while active: no in-process wrapper
    // may append alongside the out-of-process pi (enc-7c2d78ac). Reads still go
    // through the normal file path; `abort` stops the whole scope.
    if (await isDetachedRunActive(id)) {
      if (body.type === "abort") {
        const stopped = await abortDetachedRun(id);
        return NextResponse.json({ success: true, data: { sessionId: id, detached: true, stopped } });
      }
      return NextResponse.json({
        error: "Session is running in a detached process; commands are refused until it settles. Send abort to stop it.",
        code: "detached_running",
        ...(body.type === "prompt" ? { accepted: false } : {}),
      }, { status: 409 });
    }

    // Spawn-zone brief (enc-a81dfe71): a session born via ensure_session on a
    // routed base tree carries a staged zone brief; the session's FIRST prompt
    // delivers it, so the agent learns its zone rules without any client
    // cooperation. One-shot: later prompts never see it again.
    if (body.type === "prompt" && typeof body.message === "string") {
      const brief = consumePendingZoneBrief(id);
      if (brief) {
        body.message = withZoneBrief(brief, body.message);
      }
    }

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (body.type === "set_tools") {
      const filePath = existing?.sessionFile || await resolveSessionPath(id) || undefined;
      if (!existing?.isAlive() && !filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const changed = await setRpcSessionTools(id, filePath, toolNames);
      return NextResponse.json({
        success: true,
        data: { sessionId: changed.sessionId, recreated: changed.recreated },
      });
    }
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const { session } = await startRpcSession(id, filePath, undefined, {
      ...(toolNames !== undefined ? { toolNames } : {}),
    });
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
