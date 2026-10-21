/**
 * Instagram music bridge — real IG library search through the instagrapi
 * session hosted on CT126 (exo-services), the same always-on route the
 * instagram-self-data skill documents. This VM never holds IG credentials:
 * the SSH command runs the venv python on CT126, the session file stays
 * there, and only typed track metadata (audio_id, title, artist, duration)
 * or preview audio bytes come back.
 *
 * Probed against instagrapi 3.0.20 (2026-10-20): search_music works off the
 * saved session; the direct audio/<id>/ endpoint 404s, so a preview resolves
 * by re-searching the query and matching the audio_id — the track object
 * carries a signed progressive_download_url that streams the m4a preview.
 *
 * Wire format: the python script arrives on stdin as a heredoc; `python -`
 * (dash = script from stdin) takes the one JSON request line as base64 argv,
 * so the payload never rides the command line. Search answers one JSON line
 * on stdout; preview answers the raw m4a bytes (exit codes distinguish
 * failures). No remote files are created and nothing is mutated on the
 * account: search_music is read-only.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { PostStudioIgTrack } from "./post-studio-shared";

const execFileAsync = promisify(execFile);

/** CT126 SSH alias (Tailscale) that hosts the instagrapi venv + session. */
export const IG_BRIDGE_HOST = process.env.POST_STUDIO_IG_HOST || "exo-services-ts";
const IG_BRIDGE_PY = "/home/rgsaura/.local/share/instagrapi-venv/bin/python";
const IG_SESSION_FILE = "/home/rgsaura/.config/instagrapi/rgsaura.json";

/**
 * The remote script. Keep it small and defensive; it must never print the
 * session file or any credential material. The request arrives as one
 * base64 argv word (async execFile has no stdin option); exit codes:
 *  0 ok · 2 IG/session error · 3 track not found · 4 preview download failed · 5 bad request
 * (Client() takes no timeout kwarg in instagrapi 3.x — request_timeout is an attribute.)
 */
const BRIDGE_SCRIPT = `
import base64, json, sys
try:
    req = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
except Exception:
    sys.exit(5)
from instagrapi import Client
try:
    cl = Client()
    cl.request_timeout = 25
    cl.load_settings("${IG_SESSION_FILE}")
except Exception:
    sys.exit(2)
def track_out(t):
    url = ""
    try:
        url = str(t.progressive_download_url or t.fast_start_progressive_download_url or "")
    except Exception:
        pass
    cover = ""
    try:
        cover = str(t.cover_artwork_thumbnail_uri or "")
    except Exception:
        pass
    return {
        "audioId": str(t.id),
        "audioClusterId": str(t.audio_cluster_id or ""),
        "title": (t.title or "")[:200],
        "artist": (t.display_artist or "")[:200],
        "durationMs": int(t.duration_in_ms or 0),
        "hasLyrics": bool(t.has_lyrics),
        "isExplicit": bool(t.is_explicit),
        "coverUrl": cover,
        "previewUrl": url,
    }
def find_track(query, audio_id):
    for t in cl.search_music(query):
        if str(t.id) == audio_id:
            return t
    return None
if req.get("mode") == "search":
    try:
        tracks = [track_out(t) for t in cl.search_music(req["query"])[:12]]
    except Exception:
        sys.exit(2)
    sys.stdout.write(json.dumps({"ok": True, "tracks": tracks}, ensure_ascii=False))
    sys.stdout.flush()
elif req.get("mode") == "preview":
    try:
        track = find_track(req["query"], req["audioId"])
    except Exception:
        sys.exit(2)
    if track is None:
        sys.exit(3)
    url = ""
    try:
        url = str(track.progressive_download_url or track.fast_start_progressive_download_url or "")
    except Exception:
        pass
    if not url:
        sys.exit(4)
    import urllib.request
    try:
        r = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(r, timeout=30).read(9 * 1024 * 1024)
    except Exception:
        sys.exit(4)
    if len(data) < 1024:
        sys.exit(4)
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()
else:
    sys.exit(5)
`;

export interface IgMusicSearchTrack extends PostStudioIgTrack {
  coverUrl?: string;
  previewUrl?: string;
}

export type IgMusicSearchResult =
  | { ok: true; tracks: IgMusicSearchTrack[] }
  | { ok: false; error: "BAD_QUERY" | "BRIDGE_UNREACHABLE" | "IG_SESSION_ERROR" | "BRIDGE_UNKNOWN" };

export type IgMusicPreviewResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; error: "TRACK_NOT_FOUND" | "PREVIEW_DOWNLOAD_FAILED" | "IG_SESSION_ERROR" | "BRIDGE_UNREACHABLE" | "BRIDGE_UNKNOWN" };

function bridgeExitError(code: number | undefined, fallback: "search" | "preview"): IgMusicSearchResult | IgMusicPreviewResult {
  if (code === 2) return { ok: false, error: "IG_SESSION_ERROR" } as IgMusicSearchResult;
  if (code === 3) return { ok: false, error: "TRACK_NOT_FOUND" } as IgMusicPreviewResult;
  if (code === 4) return { ok: false, error: "PREVIEW_DOWNLOAD_FAILED" } as IgMusicPreviewResult;
  if (fallback === "search") return { ok: false, error: "BRIDGE_UNKNOWN" } as IgMusicSearchResult;
  return { ok: false, error: "BRIDGE_UNKNOWN" } as IgMusicPreviewResult;
}

async function runBridge(
  request: Record<string, unknown>,
  timeoutMs: number,
  maxBuffer: number,
): Promise<{ stdout: Buffer; code: number | undefined; unreachable: boolean }> {
  const argv = Buffer.from(JSON.stringify(request), "utf8").toString("base64");
  // NB: the dash — `python -` reads the script from the heredoc on stdin and
  // the base64 word becomes sys.argv[1]. Without it python treats the base64
  // as a script path and exits 2.
  const remote = `${IG_BRIDGE_PY} - ${argv} <<'PYEOF'\n${BRIDGE_SCRIPT.trim()}\nPYEOF`;
  try {
    const { stdout } = await execFileAsync(
      "ssh",
      ["-o", "ConnectTimeout=10", "-o", "BatchMode=yes", "--", IG_BRIDGE_HOST, remote],
      { timeout: timeoutMs, maxBuffer, encoding: "buffer" },
    );
    return { stdout, code: 0, unreachable: false };
  } catch (error) {
    const err = error as { code?: number; killed?: boolean; stdout?: Buffer };
    if (err.killed) return { stdout: Buffer.alloc(0), code: undefined, unreachable: true };
    if (typeof err.code === "number") return { stdout: err.stdout ?? Buffer.alloc(0), code: err.code, unreachable: false };
    return { stdout: Buffer.alloc(0), code: undefined, unreachable: true };
  }
}

/** Search the real Instagram music library. Read-only on the account. */
export async function igMusicSearch(query: string): Promise<IgMusicSearchResult> {
  const q = query.trim();
  if (!q || q.length > 80) return { ok: false, error: "BAD_QUERY" };
  const { stdout, code, unreachable } = await runBridge({ mode: "search", query: q }, 45_000, 4 * 1024 * 1024);
  if (unreachable) return { ok: false, error: "BRIDGE_UNREACHABLE" };
  if (code !== 0) return bridgeExitError(code, "search") as IgMusicSearchResult;
  try {
    const parsed = JSON.parse(stdout.toString("utf8")) as { ok?: boolean; tracks?: IgMusicSearchTrack[] };
    if (parsed.ok !== true || !Array.isArray(parsed.tracks)) return { ok: false, error: "BRIDGE_UNKNOWN" };
    const tracks = parsed.tracks.filter(
      (t) => typeof t.audioId === "string" && /^\d{1,32}$/.test(t.audioId) && typeof t.title === "string" && typeof t.durationMs === "number",
    );
    return { ok: true, tracks };
  } catch {
    return { ok: false, error: "BRIDGE_UNKNOWN" };
  }
}

/** Download one track's audible preview (m4a bytes straight from IG's CDN). */
export async function igMusicPreview(query: string, audioId: string): Promise<IgMusicPreviewResult> {
  const q = query.trim();
  if (!q || q.length > 80 || !/^\d{1,32}$/.test(audioId)) return { ok: false, error: "TRACK_NOT_FOUND" };
  const { stdout, code, unreachable } = await runBridge({ mode: "preview", query: q, audioId }, 90_000, 40 * 1024 * 1024);
  if (unreachable) return { ok: false, error: "BRIDGE_UNREACHABLE" };
  if (code !== 0) return bridgeExitError(code, "preview") as IgMusicPreviewResult;
  if (stdout.length < 1024) return { ok: false, error: "PREVIEW_DOWNLOAD_FAILED" };
  return { ok: true, bytes: stdout };
}
