import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/json-response";
import {
  attachSessionProjectInfo,
  getSessionListVersion,
  listAllSessions,
  listSessionSummaries,
  mergeSessionLists,
} from "@/lib/session-reader";
import {
  getAwaitingInputRpcSessionIds,
  getCompletionNotificationSuppressedRpcSessionIds,
  getRpcSessionInfos,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { readSpawnMetadataMap, sessionRoutingFields } from "@/lib/spawn-metadata";
import { startServerPerf } from "@/lib/perf";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const perf = startServerPerf("GET /api/sessions");
  try {
    const searchParams = new URL(req.url).searchParams;
    const force = searchParams.get("force") === "1";
    // `summary=1` serves header/stat metadata so the sidebar can paint without
    // waiting for every session transcript to be parsed.
    const summary = searchParams.get("summary") === "1";
    perf?.span("start");
    const persistedSessionsPromise = summary
      ? listSessionSummaries()
      : listAllSessions({ force });
    // Capture before awaiting: mutations during the scan still require a later refresh.
    const sessionListVersion = getSessionListVersion();
    const [persistedSessions, runtimeSessions] = await Promise.all([
      persistedSessionsPromise,
      attachSessionProjectInfo(getRpcSessionInfos()),
    ]);
    perf?.span("scan+projects");
    const merged = mergeSessionLists(persistedSessions, runtimeSessions);
    // Spawn metadata (enc-a81dfe71): attach project/encargo/port routing to each
    // session the server spawned, and support server-side ?project=/?encargo=
    // filtering so hundreds of assets stay queryable without client fan-out.
    const spawnMeta = readSpawnMetadataMap();
    const projectFilter = searchParams.get("project");
    const encargoFilter = searchParams.get("encargo");
    const sessions = merged
      .map((session) => {
        const meta = spawnMeta.get(session.id);
        return meta ? { ...session, routing: sessionRoutingFields(meta) } : session;
      })
      .filter((session) => {
        if (!projectFilter && !encargoFilter) return true;
        const routing = session.routing;
        if (!routing) return false;
        if (projectFilter && routing.project !== projectFilter) return false;
        if (encargoFilter && routing.encargo !== encargoFilter) return false;
        return true;
      });
    return perf?.attach(jsonResponse(
      req,
      {
        sessions,
        sessionListVersion,
        runningSessionIds: getRunningRpcSessionIds(),
        awaitingInputSessionIds: getAwaitingInputRpcSessionIds(),
        completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
      },
      { headers: { "Cache-Control": "no-store" } },
    )) ?? jsonResponse(
      req,
      {
        sessions,
        sessionListVersion,
        runningSessionIds: getRunningRpcSessionIds(),
        awaitingInputSessionIds: getAwaitingInputRpcSessionIds(),
        completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
