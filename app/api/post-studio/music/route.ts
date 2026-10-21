import { NextResponse } from "next/server";
import { addMusicOption } from "@/lib/post-studio";
import { igMusicPreview, igMusicSearch } from "@/lib/post-studio-ig-music";
import { POST_ID_RE, type PostStudioIgTrack, type PostStudioMusicOption } from "@/lib/post-studio-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const AUDIO_ID_RE = /^[0-9]{6,32}$/;

function parseTrack(raw: unknown): PostStudioIgTrack | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const audioId = typeof t.audioId === "string" ? t.audioId : "";
  if (!AUDIO_ID_RE.test(audioId)) return null;
  const title = typeof t.title === "string" ? t.title.trim().slice(0, 200) : "";
  if (!title) return null;
  const durationMs = typeof t.durationMs === "number" && Number.isFinite(t.durationMs) && t.durationMs >= 0 ? Math.round(t.durationMs) : NaN;
  if (Number.isNaN(durationMs)) return null;
  return {
    audioId,
    audioClusterId: typeof t.audioClusterId === "string" && /^\d{1,32}$/.test(t.audioClusterId) ? t.audioClusterId : "",
    title,
    artist: typeof t.artist === "string" ? t.artist.slice(0, 200) : "",
    durationMs,
    hasLyrics: t.hasLyrics === true,
    isExplicit: t.isExplicit === true,
  };
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * GET /api/post-studio/music?q=<query> — live search of Instagram's REAL
 * music library through the CT126 instagrapi session. Honest failure: the
 * error code tells the UI the API is not exposing music right now; nothing
 * is ever fabricated here.
 *
 * GET /api/post-studio/music?q=<query>&id=<audioId> — the track's audible
 * preview (m4a bytes streamed from IG's CDN via the bridge) so the studio
 * can LISTEN before choosing. Short private cache: the bytes are immutable
 * per audio_id.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const id = params.get("id");
  if (!q || q.length > 80) {
    return NextResponse.json({ ok: false, error: "BAD_QUERY", tracks: [] }, { headers: NO_STORE });
  }
  if (id) {
    if (!AUDIO_ID_RE.test(id)) {
      return NextResponse.json({ ok: false, error: "BAD_AUDIO_ID" }, { status: 400, headers: NO_STORE });
    }
    const preview = await igMusicPreview(q, id);
    if (!preview.ok) {
      return NextResponse.json({ ok: false, error: preview.error }, { status: 502, headers: NO_STORE });
    }
    return new Response(new Uint8Array(preview.bytes), {
      status: 200,
      headers: {
        "Content-Type": "audio/mp4",
        "Content-Length": String(preview.bytes.length),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "none",
      },
    });
  }
  const result = await igMusicSearch(q);
  return NextResponse.json(result, { headers: NO_STORE });
}

/**
 * POST /api/post-studio/music — add one REAL Instagram track to a studio:
 * { post, track: { audioId, title, artist, … }, query }. The preview audio
 * (the IG progressive stream) is downloaded into the post's music/ dir so
 * playback never depends on expiring CDN URLs; the audioId rides to
 * decision.json for OpenPost/Postiz. Adding does NOT pick the track: the
 * client follows with the choose-ig-track action.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400, headers: NO_STORE });
  }
  const post = typeof body.post === "string" ? body.post : "";
  if (!POST_ID_RE.test(post)) {
    return NextResponse.json({ error: "BAD_POST_ID" }, { status: 400, headers: NO_STORE });
  }
  const track = parseTrack(body.track);
  const query = typeof body.query === "string" ? body.query.trim().slice(0, 80) : track?.title ?? "";
  if (!track || !query) {
    return NextResponse.json({ error: "BAD_TRACK" }, { status: 400, headers: NO_STORE });
  }
  const preview = await igMusicPreview(query, track.audioId);
  const option: PostStudioMusicOption = {
    id: `ig-${track.audioId}`,
    letter: "IG",
    label: track.title,
    style: track.artist || "Instagram Music",
    bpm: fmtDuration(track.durationMs),
    why: "Pista real de la biblioteca de Instagram, elegida en el estudio.",
    recommended: false,
    file: `ig-${track.audioId}.m4a`,
    source: "instagram",
    audioId: track.audioId,
    artist: track.artist || undefined,
    durationMs: track.durationMs,
    explicit: track.isExplicit || undefined,
    addedAt: new Date().toISOString(),
  };
  const result = await addMusicOption(post, option, preview.ok ? preview.bytes : null);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, previewOk: preview.ok, ...(preview.ok ? {} : { previewError: preview.error }) },
      { status: result.status, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ...result.snapshot, previewOk: preview.ok }, { headers: NO_STORE });
}
