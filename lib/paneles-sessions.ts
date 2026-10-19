import { sessionDisplayTitle } from "./session-fork-name";
import type { SessionInfo } from "./types";

/**
 * Panel ↔ session links, both directions of the trace:
 *  - `panel.json` registers the Pi sessions that created/linked the panel
 *    (rg-panel new/link write PI_SESSION_ID there) — source "panel.json".
 *  - a transcript scan finds sessions that mention the panel's slug —
 *    source "mencion", carrying the snippet (and entry id) where it happened,
 *    so every link says why it is a link.
 *
 * Shared by app/api/paneles/sessions (server) and the client types.
 */

export type PanelSessionSource = "panel.json" | "mencion";

export interface PanelSessionSnippet {
  before: string;
  match: string;
  after: string;
  /** Entry of the matched message, for a deep link to it. */
  entryId?: string;
}

export interface PanelSessionLink {
  id: string;
  /** The sidebar row's title (name, else first message, else id prefix). */
  title: string;
  /** ISO mtime of the session file, newest-first sort key for the UI. */
  modified: string;
  source: PanelSessionSource;
  /** Why a "mencion" (or registered session found by the scan) is related. */
  snippet?: PanelSessionSnippet;
}

/** One transcript hit as searchSessionContents() returns it. */
export interface PanelSessionMention {
  session: SessionInfo;
  entryId?: string;
  before: string;
  match: string;
  after: string;
}

/**
 * The needle scanned across session transcripts: the slug without its date
 * prefix, so both forms match — the dated directory/URL a delivery message
 * carries (`…?view=paneles&panel=2026-10-16-surf-platano`) and the bare slug
 * an agent typed into `rg-panel new|link`. Undated or too-short names fall
 * back to the whole directory name.
 */
export function panelSessionNeedle(slug: string): string {
  const bare = slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return bare.length >= 3 ? bare : slug;
}

function toLink(
  session: SessionInfo,
  source: PanelSessionSource,
  mention?: PanelSessionMention,
): PanelSessionLink {
  return {
    id: session.id,
    title: sessionDisplayTitle(session),
    modified: session.modified,
    source,
    ...(mention
      ? {
          snippet: {
            before: mention.before,
            match: mention.match,
            after: mention.after,
            ...(typeof mention.entryId === "string" ? { entryId: mention.entryId } : {}),
          } satisfies PanelSessionSnippet,
        }
      : {}),
  };
}

/**
 * Merge the two directions into one list: registered sessions first in
 * panel.json order, then transcript mentions in scan order (newest first —
 * searchSessionContents sorts candidates that way). A session found by both
 * keeps its "panel.json" source and gains the snippet as evidence; ids that
 * neither the catalog nor the scan could resolve land in `missing`.
 */
export function mergePanelSessions(
  registeredIds: readonly string[],
  catalog: readonly SessionInfo[],
  mentions: readonly PanelSessionMention[],
): { sessions: PanelSessionLink[]; missing: string[] } {
  const catalogById = new Map(catalog.map((session) => [session.id, session]));
  const firstMention = new Map<string, PanelSessionMention>();
  for (const mention of mentions) {
    if (!firstMention.has(mention.session.id)) firstMention.set(mention.session.id, mention);
  }
  const sessions: PanelSessionLink[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const id of registeredIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const info = catalogById.get(id);
    const mention = firstMention.get(id);
    if (!info && !mention) {
      missing.push(id);
      continue;
    }
    sessions.push(toLink(info ?? mention!.session, "panel.json", mention));
  }
  for (const mention of mentions) {
    const id = mention.session.id;
    if (seen.has(id)) continue;
    seen.add(id);
    sessions.push(toLink(mention.session, "mencion", mention));
  }
  return { sessions, missing };
}
