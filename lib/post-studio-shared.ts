/**
 * Post Studio — client-safe types and the pure action engine behind
 * /api/post-studio. The studio definition (photos, music, presets) lives on
 * disk; this module owns every state transition so the server route stays a
 * thin validated shell and the UI can predict outcomes.
 *
 * Nothing here touches the network: `applyStudioAction` is the single source
 * of truth for what a POST may change, and `buildDecision` shapes the
 * decision.json contract the OpenPost dispatcher consumes.
 */

export type PostStudioFormat = "carousel" | "reel";

export interface PostStudioMusicOption {
  id: string;
  letter: string;
  label: string;
  style: string;
  bpm: string;
  why: string;
  recommended?: boolean;
  file: string;
  generated?: boolean;
}

export interface PostStudioMediaItem {
  id: string;
  file: string;
  kind: "photo" | "video";
  caption: string;
  star?: boolean;
}

export interface PostStudioPreset {
  id: string;
  letter: string;
  name: string;
  desc: string;
  slides: string[];
}

export interface PostStudioDefinition {
  id: string;
  title: string;
  subtitle: string;
  account: string;
  status: string;
  maxSlides: number;
  music: PostStudioMusicOption[];
  presets: PostStudioPreset[];
  media: PostStudioMediaItem[];
  videos: string[];
  reel: { duration: string; storyboard: { t: string; shot: string }[]; defaultVideo: string };
  caption: string;
  hashtags: string;
  checklist: string[];
}

export interface PostStudioState {
  revision: number;
  presetId: string | null;
  selection: string[];
  musicId: string | null;
  format: PostStudioFormat | null;
  reelVideoId: string | null;
  decidedAt: string | null;
  updatedAt: string | null;
}

/** The durable decision record (decision.json) the OpenPost feed reads. */
export interface PostStudioDecision {
  post: string;
  target: "openpost";
  source: string;
  account: string;
  format: PostStudioFormat;
  music: { id: string; label: string; note: string } | null;
  slides: { id: string; file: string; caption: string; kind: string }[];
  reel: { videoId: string | null; storyboard: { t: string; shot: string }[]; duration: string };
  caption: string;
  hashtags: string;
  checklist: string[];
  decidedAt: string;
}

export type PostStudioAction =
  | { action: "apply-preset"; presetId: string }
  | { action: "toggle-media"; id: string }
  | { action: "move-media"; id: string; direction: -1 | 1 }
  | { action: "reorder"; ids: string[] }
  | { action: "choose-music"; musicId: string | null }
  | { action: "choose-format"; format: PostStudioFormat }
  | { action: "choose-reel-video"; videoId: string | null }
  | { action: "decide" }
  | { action: "reopen" };

export interface PostStudioApplyResult {
  ok: boolean;
  error?: string;
  state?: PostStudioState;
  decision?: PostStudioDecision;
}

export const POST_ID_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

/** Server URL of one media/music asset; filenames are definition-owned. */
export function postStudioMediaSrc(postId: string, file: string): string {
  return `/api/post-studio/media/${encodeURIComponent(postId)}/${encodeURIComponent(file)}`;
}

export function initialStateFor(definition: PostStudioDefinition): PostStudioState {
  const preset = definition.presets[0];
  return {
    revision: 0,
    presetId: preset ? preset.id : null,
    selection: preset ? [...preset.slides] : [],
    musicId: null,
    format: "carousel",
    reelVideoId: definition.reel.defaultVideo ?? null,
    decidedAt: null,
    updatedAt: null,
  };
}

/** Defensive parse of studio.json: every list field the UI relies on must be sane. */
export function parseStudioDefinition(raw: unknown): PostStudioDefinition | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const id = str(d.id);
  if (!POST_ID_RE.test(id)) return null;
  const media = Array.isArray(d.media)
    ? d.media.filter(
        (m): m is PostStudioMediaItem =>
          !!m && typeof m === "object" &&
          typeof (m as PostStudioMediaItem).id === "string" &&
          typeof (m as PostStudioMediaItem).file === "string" &&
          ((m as PostStudioMediaItem).kind === "photo" || (m as PostStudioMediaItem).kind === "video"),
      ).map((m) => ({ ...m, caption: typeof m.caption === "string" ? m.caption : "" }))
    : [];
  const music = Array.isArray(d.music)
    ? d.music.filter(
        (m): m is PostStudioMusicOption =>
          !!m && typeof m === "object" &&
          typeof (m as PostStudioMusicOption).id === "string" &&
          typeof (m as PostStudioMusicOption).file === "string",
      )
    : [];
  const presets = Array.isArray(d.presets)
    ? d.presets.filter(
        (p): p is PostStudioPreset =>
          !!p && typeof p === "object" &&
          typeof (p as PostStudioPreset).id === "string" &&
          Array.isArray((p as PostStudioPreset).slides),
      )
    : [];
  const reelRaw = (d.reel && typeof d.reel === "object" ? d.reel : {}) as Record<string, unknown>;
  const storyboard = Array.isArray(reelRaw.storyboard)
    ? reelRaw.storyboard.filter(
        (s): s is { t: string; shot: string } =>
          !!s && typeof s === "object" &&
          typeof (s as { t: string }).t === "string" &&
          typeof (s as { shot: string }).shot === "string",
      )
    : [];
  const videos = Array.isArray(d.videos)
    ? d.videos.filter((v): v is string => typeof v === "string")
    : media.filter((m) => m.kind === "video").map((m) => m.id);
  if (media.length === 0 || presets.length === 0 || music.length === 0) return null;
  return {
    id,
    title: str(d.title) || id,
    subtitle: str(d.subtitle),
    account: str(d.account),
    status: str(d.status) || "pre",
    maxSlides: typeof d.maxSlides === "number" && d.maxSlides > 0 ? d.maxSlides : 20,
    music,
    presets,
    media,
    videos,
    reel: {
      duration: str(reelRaw.duration),
      storyboard,
      defaultVideo: typeof reelRaw.defaultVideo === "string" ? reelRaw.defaultVideo : videos[0] ?? "",
    },
    caption: str(d.caption),
    hashtags: str(d.hashtags),
    checklist: Array.isArray(d.checklist)
      ? d.checklist.filter((c): c is string => typeof c === "string")
      : [],
  };
}

/** Defensive parse of state.json; falls back to the initial state when broken. */
export function parseStudioState(raw: unknown, definition: PostStudioDefinition): PostStudioState {
  const base = initialStateFor(definition);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const s = raw as Record<string, unknown>;
  const known = new Set(definition.media.map((m) => m.id));
  const selection = Array.isArray(s.selection)
    ? s.selection.filter((v): v is string => typeof v === "string" && known.has(v))
    : base.selection;
  const format = s.format === "reel" ? "reel" : s.format === "carousel" ? "carousel" : null;
  return {
    revision: typeof s.revision === "number" && s.revision >= 0 ? Math.floor(s.revision) : 0,
    presetId: typeof s.presetId === "string" ? s.presetId : base.presetId,
    selection: selection.length > 0 ? selection : base.selection,
    musicId: typeof s.musicId === "string" ? s.musicId : null,
    format: format ?? base.format,
    reelVideoId: typeof s.reelVideoId === "string" && known.has(s.reelVideoId) ? s.reelVideoId : base.reelVideoId,
    decidedAt: typeof s.decidedAt === "string" ? s.decidedAt : null,
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
  };
}

function bumped(state: PostStudioState): PostStudioState {
  return { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString() };
}

/** The decision.json payload for the current state (OpenPost feed contract). */
export function buildDecision(
  definition: PostStudioDefinition,
  state: PostStudioState,
  decidedAt: string,
): PostStudioDecision {
  const byId = new Map(definition.media.map((m) => [m.id, m]));
  const music = definition.music.find((m) => m.id === state.musicId) ?? null;
  return {
    post: definition.id,
    target: "openpost",
    source: "exohuman-ui post-studio",
    account: definition.account,
    format: state.format ?? "carousel",
    music: music
      ? {
          id: music.id,
          label: `${music.letter} · ${music.label}`,
          note: music.generated
            ? "loop de referencia generado para la review; sustituir por el audio real de IG en producción"
            : "",
        }
      : null,
    slides: state.selection
      .map((id) => byId.get(id))
      .filter((m): m is PostStudioMediaItem => !!m)
      .map((m) => ({ id: m.id, file: m.file, caption: m.caption, kind: m.kind })),
    reel: {
      videoId: state.format === "reel" ? state.reelVideoId : null,
      storyboard: definition.reel.storyboard,
      duration: definition.reel.duration,
    },
    caption: definition.caption,
    hashtags: definition.hashtags,
    checklist: definition.checklist,
    decidedAt,
  };
}

/**
 * Pure transition. Every POST body lands here; unknown or invalid input
 * returns `ok:false` with a short error instead of touching state. A decided
 * studio is frozen until `reopen`.
 */
export function applyStudioAction(
  definition: PostStudioDefinition,
  state: PostStudioState,
  action: PostStudioAction,
): PostStudioApplyResult {
  if (action.action === "reopen") {
    if (!state.decidedAt) return { ok: false, error: "STUDIO_NOT_DECIDED" };
    return { ok: true, state: { ...bumped(state), decidedAt: null } };
  }
  if (state.decidedAt) return { ok: false, error: "STUDIO_LOCKED" };

  switch (action.action) {
    case "apply-preset": {
      const preset = definition.presets.find((p) => p.id === action.presetId);
      if (!preset) return { ok: false, error: "PRESET_NOT_FOUND" };
      return { ok: true, state: { ...bumped(state), presetId: preset.id, selection: [...preset.slides] } };
    }
    case "toggle-media": {
      const item = definition.media.find((m) => m.id === action.id);
      if (!item) return { ok: false, error: "MEDIA_NOT_FOUND" };
      if (state.selection.includes(action.id)) {
        const selection = state.selection.filter((id) => id !== action.id);
        if (selection.length === 0) return { ok: false, error: "SELECTION_EMPTY" };
        return { ok: true, state: { ...bumped(state), selection, presetId: null } };
      }
      if (state.selection.length >= definition.maxSlides) {
        return { ok: false, error: `MAX_SLIDES_${definition.maxSlides}` };
      }
      return { ok: true, state: { ...bumped(state), selection: [...state.selection, action.id], presetId: null } };
    }
    case "move-media": {
      if (action.direction !== -1 && action.direction !== 1) return { ok: false, error: "BAD_DIRECTION" };
      const index = state.selection.indexOf(action.id);
      if (index < 0) return { ok: false, error: "MEDIA_NOT_SELECTED" };
      const target = index + action.direction;
      if (target < 0 || target >= state.selection.length) return { ok: true, state };
      const selection = [...state.selection];
      [selection[index], selection[target]] = [selection[target], selection[index]];
      return { ok: true, state: { ...bumped(state), selection, presetId: null } };
    }
    case "reorder": {
      if (!Array.isArray(action.ids)) return { ok: false, error: "BAD_ORDER" };
      const current = new Set(state.selection);
      const next = new Set<string>();
      for (const id of action.ids) {
        if (typeof id !== "string" || !current.has(id) || next.has(id)) {
          return { ok: false, error: "BAD_ORDER" };
        }
        next.add(id);
      }
      if (next.size !== current.size) return { ok: false, error: "BAD_ORDER" };
      return { ok: true, state: { ...bumped(state), selection: [...action.ids], presetId: null } };
    }
    case "choose-music": {
      if (action.musicId === null) return { ok: true, state: { ...bumped(state), musicId: null } };
      const music = definition.music.find((m) => m.id === action.musicId);
      if (!music) return { ok: false, error: "MUSIC_NOT_FOUND" };
      return { ok: true, state: { ...bumped(state), musicId: music.id } };
    }
    case "choose-format": {
      if (action.format !== "carousel" && action.format !== "reel") {
        return { ok: false, error: "BAD_FORMAT" };
      }
      return { ok: true, state: { ...bumped(state), format: action.format } };
    }
    case "choose-reel-video": {
      if (action.videoId === null) return { ok: true, state: { ...bumped(state), reelVideoId: null } };
      const video = definition.media.find((m) => m.id === action.videoId && m.kind === "video");
      if (!video) return { ok: false, error: "VIDEO_NOT_FOUND" };
      return { ok: true, state: { ...bumped(state), reelVideoId: video.id } };
    }
    case "decide": {
      if (state.selection.length === 0) return { ok: false, error: "SELECTION_EMPTY" };
      if (!state.musicId) return { ok: false, error: "MUSIC_REQUIRED" };
      if (state.format === "reel" && !state.reelVideoId) return { ok: false, error: "REEL_VIDEO_REQUIRED" };
      const decidedAt = new Date().toISOString();
      const decided = { ...bumped(state), decidedAt };
      return { ok: true, state: decided, decision: buildDecision(definition, decided, decidedAt) };
    }
    default:
      return { ok: false, error: "UNKNOWN_ACTION" };
  }
}
