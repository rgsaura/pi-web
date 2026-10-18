import type { SessionInfo } from "@/lib/types";

/** The "active now" window: a session with activity this recent counts as active. */
export const ACTIVE_NOW_WINDOW_MS = 15 * 60_000;

/**
 * Whether a session is active right now: a pi process is running in it (or
 * it is waiting for the user's input), or it was modified within the
 * active-now window. `modified` is the session file's last write; an
 * unparsable or missing date never counts as recent.
 */
export function isSessionActiveNow(
  session: Pick<SessionInfo, "id" | "modified">,
  now: number,
  runningIds: ReadonlySet<string>,
  awaitingIds: ReadonlySet<string>,
  windowMs: number = ACTIVE_NOW_WINDOW_MS,
): boolean {
  if (runningIds.has(session.id) || awaitingIds.has(session.id)) return true;
  const modified = Date.parse(session.modified);
  // A future date (clock skew) has a negative age and still counts as recent.
  return Number.isFinite(modified) && now - modified < windowMs;
}

/**
 * The ids of the sessions that are active now (isSessionActiveNow), as a Set.
 */
export function activeNowSessionIds(
  sessions: readonly SessionInfo[],
  now: number,
  runningIds: ReadonlySet<string>,
  awaitingIds: ReadonlySet<string>,
  windowMs: number = ACTIVE_NOW_WINDOW_MS,
): Set<string> {
  const ids = new Set<string>();
  for (const session of sessions) {
    if (isSessionActiveNow(session, now, runningIds, awaitingIds, windowMs)) ids.add(session.id);
  }
  return ids;
}
