import { NextResponse } from "next/server";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { allowFileRoot } from "@/lib/file-access";
import { invalidateSessionListCache } from "@/lib/session-reader";
import { startRpcSession } from "@/lib/rpc-manager";
import { startDetachedSession } from "@/lib/detached-runner";
import {
  lookupWorktreeZone,
  registerPendingZoneBrief,
  resolveSpawnRouting,
  withZoneBrief,
  type SpawnRoutingOutcome,
} from "@/lib/spawn-routing";
import { writeSpawnMetadata, type SpawnMetadata } from "@/lib/spawn-metadata";

const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && THINKING_LEVELS.has(value as ThinkingLevel)) {
    return value as ThinkingLevel;
  }
  throw new Error(`Invalid thinking level: ${String(value)}`);
}

/** The `routing` block a spawn response carries when routing decided something. */
function routingResponseBlock(outcome: SpawnRoutingOutcome, briefInjected: boolean, requestedCwd: string) {
  if (outcome.kind === "zone") {
    const { zone } = outcome;
    return {
      routing: {
        action: "zone" as const,
        from: requestedCwd,
        to: zone.worktreePath,
        project: zone.project,
        encargo: zone.encargo,
        worktree: zone.worktreePath,
        branch: zone.branch,
        port: zone.port || null,
        cacheDir: zone.cacheDir,
        briefInjected,
      },
    };
  }
  return {};
}

// POST /api/agent/new  body: { cwd: string; type: string; message?: string; ... }
// Spawns a brand-new pi session. Most calls immediately send the first command;
// type:"ensure_session" only creates the runtime so clients can query commands.
// Returns pi's real session id plus the model/thinking state selected at startup.
//
// Spawn routing (enc-a81dfe71): ~/.config/exohuman/routing.json is enforced
// HERE, at the only place sessions are born. A cwd inside the shared BASE tree
// of a git project never starts there: the spawn gets its own zone (worktree
// wt-<hex8> + branch fork/<hex8> via rg-worktree, dev port from rg-port) and a
// bounded brief — injected into a message-carrying spawn directly, or staged
// for the session's first prompt when the caller used ensure_session. A cwd in
// a protected tree (prod/pre) is refused outright; zone creation failure fails
// the spawn (fail closed: never a fallback into the shared tree). Without a
// routing config the endpoint behaves exactly as before. Every spawn born in a
// zone (fresh or pre-registered, e.g. by the task dispatcher) records session
// metadata (project/encargo/port) for the session index.
export async function POST(req: Request) {
  let commandType: string | undefined;
  let promptAccepted = false;
  try {
    const body = await req.json() as { cwd?: string; [key: string]: unknown };
    const { cwd, ...command } = body;
    commandType = typeof command.type === "string" ? command.type : undefined;

    if (!cwd || typeof cwd !== "string") {
      return NextResponse.json({
        error: "cwd is required",
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 400 });
    }
    if (!existsSync(cwd)) {
      return NextResponse.json({
        error: `Directory does not exist: ${cwd}`,
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 400 });
    }

    // ── Payload validation BEFORE routing: a zone (worktree + port) must
    // never be allocated for a request that dies on its own arguments
    // (invalid model pair, thinking level, …). ──────────────────────
    const { provider, modelId, toolNames, thinkingLevel, ...promptCommand } = command as { provider?: string; modelId?: string; toolNames?: string[]; thinkingLevel?: unknown; [key: string]: unknown };
    if ((provider && !modelId) || (!provider && modelId)) {
      throw new Error("provider and modelId must be provided together");
    }
    const explicitThinkingLevel = parseThinkingLevel(thinkingLevel);

    // ── Spawn routing: classify the cwd BEFORE anything is born. ────────────
    let outcome: SpawnRoutingOutcome;
    try {
      outcome = await resolveSpawnRouting(cwd);
    } catch (error) {
      // Fail closed: an unclassifiable config or a zone that cannot be created
      // blocks the spawn; it never falls back to the shared tree.
      return NextResponse.json({
        error: `Spawn blocked: ${error instanceof Error ? error.message : String(error)}`,
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : { code: "cwd_not_allowed" }),
      }, { status: 503 });
    }
    if (outcome.kind === "refused") {
      return NextResponse.json({
        error: outcome.reason,
        ...(commandType === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : { code: "cwd_not_allowed" }),
      }, { status: 400 });
    }

    let effectiveCwd = cwd;
    let spawnMeta: Partial<SpawnMetadata> | null = null;
    let briefInjected = false;
    let pendingBrief: string | null = null;
    if (outcome.kind === "zone") {
      effectiveCwd = outcome.zone.worktreePath;
      if (typeof promptCommand.message === "string" && promptCommand.message.trim()) {
        // The message travels with the spawn: the brief rides along now.
        promptCommand.message = withZoneBrief(outcome.brief, promptCommand.message);
        briefInjected = true;
      } else {
        // ensure_session births the runtime before any message exists: the
        // brief waits (memory + disk) for the first prompt via /api/agent/[id].
        pendingBrief = outcome.brief;
      }
      spawnMeta = {
        project: outcome.zone.project,
        encargo: outcome.zone.encargo,
        worktreePath: outcome.zone.worktreePath,
        branch: outcome.zone.branch,
        ...(outcome.zone.port ? { port: outcome.zone.port } : {}),
        routedFrom: cwd,
      };
    } else {
      // Passthrough: a session born inside an already-registered worktree
      // (e.g. dispatched by rg-task-dispatcher) still gets index metadata.
      const zone = lookupWorktreeZone(cwd);
      if (zone && (zone.project || zone.encargo)) {
        spawnMeta = {
          ...(zone.project ? { project: zone.project } : {}),
          ...(zone.encargo ? { encargo: zone.encargo } : {}),
          worktreePath: cwd,
          ...(zone.branch ? { branch: zone.branch } : {}),
          ...(zone.port ? { port: zone.port } : {}),
        };
      }
    }

    // Detached mode (enc-7c2d78ac): the session runs as its own `pi --print`
    // process in a systemd scope, so it survives server restarts and keeps its
    // helper processes out of the production cgroup. The session file lands in
    // the normal catalog; the sidebar shows it as running via /api/agent/running.
    // Fire-and-forget callers (the task dispatcher) opt in with detached: true.
    if (body.detached === true) {
      if (typeof promptCommand.message !== "string" || !promptCommand.message.trim()) {
        return NextResponse.json({
          error: "detached: true requires a message",
          ...(commandType === "prompt" ? { code: "prompt_rejected", accepted: false } : {}),
        }, { status: 400 });
      }
      const run = await startDetachedSession({
        cwd: effectiveCwd,
        message: promptCommand.message,
        ...(provider && modelId ? { provider, modelId } : {}),
        ...(explicitThinkingLevel ? { thinkingLevel: explicitThinkingLevel } : {}),
      });
      allowFileRoot(effectiveCwd);
      invalidateSessionListCache();
      if (spawnMeta) {
        writeSpawnMetadata({ ...spawnMeta, sessionId: run.sessionId, detached: true, spawnedAt: new Date().toISOString() });
      }
      return NextResponse.json({
        success: true,
        sessionId: run.sessionId,
        detached: true,
        data: null,
        model: run.model,
        thinkingLevel: run.thinkingLevel ?? undefined,
        ...routingResponseBlock(outcome, briefInjected, cwd),
      });
    }

    // Must be unique per request: startRpcSession coalesces concurrent callers
    // that share a key onto one session. Date.now() (ms resolution) collides for
    // requests in the same millisecond, merging two new sessions into one.
    const tempKey = `__new__${randomUUID()}`;
    const { session, realSessionId } = await startRpcSession(tempKey, "", effectiveCwd, {
      ...(toolNames ? { toolNames } : {}),
      ...(provider && modelId ? { initialModel: { provider, modelId } } : {}),
      ...(explicitThinkingLevel ? { thinkingLevel: explicitThinkingLevel } : {}),
    });

    // Keep the files-route allowed-roots cache (see app/api/files/[...path]/route.ts)
    // in sync so the new cwd is immediately readable via /api/files. Without this,
    // a file request under a brand-new cwd would 403 for up to the cache TTL.
    // The originally requested cwd stays allowed too: browsing the base tree a
    // redirect came from keeps working.
    allowFileRoot(effectiveCwd);
    if (effectiveCwd !== cwd) allowFileRoot(cwd);
    invalidateSessionListCache();
    if (spawnMeta) {
      writeSpawnMetadata({ ...spawnMeta, sessionId: realSessionId, detached: false, spawnedAt: new Date().toISOString() });
    }
    if (pendingBrief) registerPendingZoneBrief(realSessionId, pendingBrief);

    const state = await session.send({ type: "get_state" }) as {
      model?: { id: string; provider: string };
      thinkingLevel?: string;
    };

    if (promptCommand.type === "ensure_session") {
      return NextResponse.json({
        success: true,
        sessionId: realSessionId,
        data: null,
        model: state.model
          ? { provider: state.model.provider, modelId: state.model.id }
          : null,
        thinkingLevel: state.thinkingLevel,
        ...routingResponseBlock(outcome, briefInjected, cwd),
      });
    }

    const result = await session.send(promptCommand);
    promptAccepted = promptCommand.type === "prompt";

    return NextResponse.json({
      success: true,
      sessionId: realSessionId,
      data: result,
      model: state.model
        ? { provider: state.model.provider, modelId: state.model.id }
        : null,
      thinkingLevel: state.thinkingLevel,
      ...routingResponseBlock(outcome, briefInjected, cwd),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}
