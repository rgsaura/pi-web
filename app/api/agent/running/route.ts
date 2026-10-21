import { NextResponse } from "next/server";
import { getSessionListVersion } from "@/lib/session-reader";
import {
  getAwaitingInputRpcSessionIds,
  getCompletionNotificationSuppressedRpcSessionIds,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import { getActiveDetachedSessionIds } from "@/lib/detached-runner";
import { getSessionUiStateRevision } from "@/lib/session-ui-state";

export const dynamic = "force-dynamic";

// GET /api/agent/running - Lightweight snapshot for visible-tab polling.
// sessionUiStateRevision (null when unreadable) tells the sidebar its pins and
// archive changed elsewhere; it costs one stat while the file is unchanged.
export async function GET() {
  // Detached runs (enc-7c2d78ac) run outside this process; their ids join the
  // running list so the sidebar spins them like any other active session.
  const detachedIds = await getActiveDetachedSessionIds();
  return NextResponse.json(
    {
      sessionListVersion: getSessionListVersion(),
      runningSessionIds: [...new Set([...getRunningRpcSessionIds(), ...detachedIds])],
      awaitingInputSessionIds: getAwaitingInputRpcSessionIds(),
      completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
      sessionUiStateRevision: getSessionUiStateRevision(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
