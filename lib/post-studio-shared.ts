/**
 * Post Studio — client-safe types and the pure action engine behind
 * /api/post-studio. The studio definition (photos, music, presets) lives on
 * disk; this module owns every state transition so the server route stays a
 * thin validated shell and the UI can predict outcomes.
 *
 * v2 (enc-ebe31041): the studio is plan-driven and generic. A plan (EXO
 * context: place, dates, people) rides with the definition; every media item
 * carries provenance (capture date/time, sender, place) parsed at
 * authoring time; a full-post vision validation gates `decide`; and the only
 * publishable music is a REAL Instagram track (audio_id) — generated
 * reference loops never reach OpenPost.
 *
 * Nothing here touches the network: `applyStudioAction` is the single source
 * of truth for what a POST may change, and `buildDecision` shapes the
 * decision.json contract the OpenPost/Postiz dispatcher consumes.
 */

export type PostStudioFormat = "carousel" | "reel";
export type PostStudioVerdict = "ok" | "alt" | "rejected";
export type PostStudioReviewStatus = "pending" | "ok" | "flagged";
export type PostStudioVisionVerdict = "fit" | "unclear" | "off";

/** The EXO plan a post tells (place, dates, people) — the curation anchor. */
export interface PostStudioPlan {
  summary: string;
  location: string;
  dateStart: string;
  dateEnd: string;
  people: string[];
  /** Optional free-form notes for the validator prompt. */
  notes?: string;
}

export interface PostStudioMusicOption {
  id: string;
  letter: string;
  label: string;
  style: string;
  bpm: string;
  why: string;
  recommended?: boolean;
  file: string;
  /** Local reference loops generated for review; never a publishable track. */
  generated?: boolean;
  /** v2: a real Instagram library track persisted as an option. */
  source?: "instagram" | "local";
  /** Instagram audio_id (the publishable identifier for OpenPost/Postiz). */
  audioId?: string;
  artist?: string;
  durationMs?: number;
  explicit?: boolean;
  addedAt?: string;
}

/** One real Instagram music track (search result or the picked one). */
export interface PostStudioIgTrack {
  audioId: string;
  audioClusterId: string;
  title: string;
  artist: string;
  durationMs: number;
  hasLyrics?: boolean;
  isExplicit?: boolean;
}

export interface PostStudioMediaItem {
  id: string;
  file: string;
  kind: "photo" | "video";
  caption: string;
  star?: boolean;
  /** Capture/share date parsed from the filename (YYYY-MM-DD). */
  date?: string;
  /** Capture/share time parsed from the filename (HH:MM). */
  time?: string;
  /** Who shared it (parsed from the filename / WhatsApp pool). */
  sender?: string;
  /** Plan-derived place label for the item's date. */
  place?: string;
  /** Where the file came from (thread, album, device). */
  provenance?: string;
  /** Vision-curation verdict; rejected items are never selectable. */
  verdict?: PostStudioVerdict;
  /** Human-readable reason: why it fits the plan, or why it was rejected. */
  reason?: string;
  /** What the vision pass saw in the file. */
  content?: string;
  /** v2: what the full-post validator saw (fit/unclear/off + description). */
  vision?: PostStudioVisionAssessment;
}

/** What the vision validator saw in one media item (by the model or authored). */
export interface PostStudioVisionAssessment {
  verdict: PostStudioVisionVerdict;
  desc: string;
  issues?: string[];
  by: string;
  at: string;
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
  /** Destination network (instagram, …) — display only. */
  network?: string;
  /** v2: the EXO plan this post tells (curation anchor for vision). */
  plan?: PostStudioPlan;
  /** v2: window shorthand (from plan) — files dated outside are errors. */
  window?: { start: string; end: string };
  /** People the plan is about (mirror of plan.people). */
  people?: string[];
  /** Motifs the plan's photos should show. */
  motifs?: string[];
  /** EXO context line(s) the plan was built from. */
  context?: string;
  /** Where the media pool came from. */
  provenance?: string;
  /** Instagram music search hints. */
  musicSearch?: { queries: string[]; note?: string };
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
  /** The real Instagram track picked for the post (publishable audio_id). */
  musicTrack?: { track: PostStudioIgTrack; query: string; pickedAt: string } | null;
  /** Final visual review of each selected slide, by media id. */
  review?: Record<string, { status: PostStudioReviewStatus; note?: string }>;
}

/** One slide's verdict inside a saved validation report. */
export interface PostStudioValidationItem {
  id: string;
  verdict: PostStudioVisionVerdict;
  desc: string;
  issues: string[];
}

/** validation.json: the selectionHash-scoped full-post vision report. */
export interface PostStudioValidation {
  status: "ok" | "issues";
  at: string;
  model: string;
  selectionHash: string;
  items: PostStudioValidationItem[];
  issues: string[];
  notes?: string;
}

/** The durable decision record (decision.json) the OpenPost/Postiz feed reads. */
export interface PostStudioDecision {
  post: string;
  target: "openpost";
  source: string;
  account: string;
  format: PostStudioFormat;
  music:
    | {
        source: "instagram";
        audioId: string;
        audioClusterId: string;
        title: string;
        artist: string;
        durationMs: number;
        label: string;
        note: string;
      }
    | { source: "local"; id: string; label: string; note: string }
    | null;
  slides: { id: string; file: string; caption: string; kind: string; date?: string; place?: string }[];
  reel: { videoId: string | null; storyboard: { t: string; shot: string }[]; duration: string };
  caption: string;
  hashtags: string;
  checklist: string[];
  /** The vision pass that gated this decision (model + moment). */
  vision: { at: string; model: string; status: string; selectionHash: string } | null;
  validation: { reviewed: number; total: number; flagged: string[]; checks: string[]; checkedAt: string };
  decidedAt: string;
}

export type PostStudioAction =
  | { action: "apply-preset"; presetId: string }
  | { action: "toggle-media"; id: string }
  | { action: "move-media"; id: string; direction: -1 | 1 }
  | { action: "reorder"; ids: string[] }
  | { action: "choose-music"; musicId: string | null }
  | { action: "choose-ig-track"; track: PostStudioIgTrack | null; query?: string }
  | { action: "choose-format"; format: PostStudioFormat }
  | { action: "choose-reel-video"; videoId: string | null }
  | { action: "review-media"; id: string; status: PostStudioReviewStatus; note?: string }
  | { action: "decide" }
  | { action: "reopen" };

export interface PostStudioApplyResult {
  ok: boolean;
  error?: string;
  issues?: string[];
  state?: PostStudioState;
  decision?: PostStudioDecision;
}

export const POST_ID_RE = /^[a-z0-9][a-z0-9-]{0,48}$/;

/** Server URL of one media/music asset; filenames are definition-owned. */
export function postStudioMediaSrc(postId: string, file: string): string {
  return `/api/post-studio/media/${encodeURIComponent(postId)}/${encodeURIComponent(file)}`;
}

/** Server URL of one live Instagram music preview (streams from the bridge). */
export function postStudioIgPreviewSrc(query: string, audioId: string): string {
  return `/api/post-studio/music?q=${encodeURIComponent(query)}&id=${encodeURIComponent(audioId)}`;
}

export function initialStateFor(definition: PostStudioDefinition): PostStudioState {
  const preset = definition.presets.find((p) => p.slides.length > 0) ?? definition.presets[0];
  return {
    revision: 0,
    presetId: preset ? preset.id : null,
    selection: preset ? [...preset.slides] : [],
    musicId: null,
    format: "carousel",
    reelVideoId: definition.reel.defaultVideo ?? null,
    decidedAt: null,
    updatedAt: null,
    musicTrack: null,
    review: {},
  };
}

/** One row of the studio list (GET /api/post-studio/list). */
export interface PostStudioListEntry {
  id: string;
  title: string;
  subtitle: string;
  account: string;
  status: string;
  location: string;
  mediaCount: number;
  selectionCount: number;
  realMusicCount: number;
  decidedAt: string | null;
  updatedAt: string | null;
}

/** FNV-1a 32-bit over the joined selection ids — the validation freshness key. */
export function selectionHashFor(state: PostStudioState): string {
  const joined = state.selection.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** True when the item's capture date is inside the plan window; null if unknown. */
export function takenAtInPlan(item: PostStudioMediaItem, plan?: PostStudioPlan): boolean | null {
  if (!plan || !item.date) return null;
  if (item.date < plan.dateStart || item.date > plan.dateEnd) return false;
  return true;
}

export type ValidationCover =
  | { ok: true; validation: PostStudioValidation }
  | { ok: false; reason: "MISSING" | "STALE" | "OFF_SLIDE" | "ISSUES"; validation?: PostStudioValidation };

/**
 * Whether a saved validation still gates the CURRENT state: it must exist,
 * match the selection hash, judge every selected slide, carry no "off"
 * verdict and report no blocking issues. The UI and `decide` both consult
 * this — a selection edit stales the report instantly.
 */
export function validationCovers(validation: PostStudioValidation | null, state: PostStudioState): ValidationCover {
  if (!validation) return { ok: false, reason: "MISSING" };
  if (validation.selectionHash !== selectionHashFor(state)) return { ok: false, reason: "STALE", validation };
  const byId = new Map(validation.items.map((it) => [it.id, it]));
  const selected = new Set(state.selection);
  if (validation.items.length !== selected.size || state.selection.some((id) => !byId.has(id))) {
    return { ok: false, reason: "OFF_SLIDE", validation };
  }
  if (validation.status === "issues" || validation.items.some((it) => it.verdict === "off")) {
    return { ok: false, reason: "ISSUES", validation };
  }
  return { ok: true, validation };
}

/** Defensive parse of validation.json (or null when unusable). */
export function parseStudioValidation(raw: unknown): PostStudioValidation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if ((v.status !== "ok" && v.status !== "issues") || typeof v.at !== "string" || typeof v.model !== "string" || typeof v.selectionHash !== "string") {
    return null;
  }
  const items = Array.isArray(v.items)
    ? v.items.filter(
        (it): it is PostStudioValidationItem =>
          !!it && typeof it === "object" &&
          typeof (it as PostStudioValidationItem).id === "string" &&
          typeof (it as PostStudioValidationItem).verdict === "string" &&
          typeof (it as PostStudioValidationItem).desc === "string",
      ).map((it) => ({
        id: it.id,
        verdict: it.verdict as PostStudioVisionVerdict,
        desc: it.desc,
        issues: Array.isArray(it.issues) ? it.issues.filter((x): x is string => typeof x === "string") : [],
      }))
    : [];
  return {
    status: v.status,
    at: v.at,
    model: v.model,
    selectionHash: v.selectionHash,
    items,
    issues: Array.isArray(v.issues) ? v.issues.filter((x): x is string => typeof x === "string") : [],
    ...(typeof v.notes === "string" ? { notes: v.notes } : {}),
  };
}

/** Defensive parse of studio.json: every list field the UI relies on must be sane. */
export function parseStudioDefinition(raw: unknown): PostStudioDefinition | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const id = str(d.id);
  if (!POST_ID_RE.test(id)) return null;
  const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const planRaw = (d.plan && typeof d.plan === "object" && !Array.isArray(d.plan) ? d.plan : null) as
    | { summary?: unknown; location?: unknown; dateStart?: unknown; dateEnd?: unknown; people?: unknown; notes?: unknown }
    | null;
  const plan =
    planRaw && typeof planRaw.summary === "string" && typeof planRaw.location === "string" &&
    typeof planRaw.dateStart === "string" && typeof planRaw.dateEnd === "string" &&
    dateRe.test(planRaw.dateStart) && dateRe.test(planRaw.dateEnd)
      ? {
          summary: planRaw.summary,
          location: planRaw.location,
          dateStart: planRaw.dateStart,
          dateEnd: planRaw.dateEnd,
          people: Array.isArray(planRaw.people) ? planRaw.people.filter((p): p is string => typeof p === "string") : [],
          ...(typeof planRaw.notes === "string" ? { notes: planRaw.notes } : {}),
        }
      : undefined;
  const media = Array.isArray(d.media)
    ? d.media.filter(
        (m): m is PostStudioMediaItem =>
          !!m && typeof m === "object" &&
          typeof (m as PostStudioMediaItem).id === "string" &&
          typeof (m as PostStudioMediaItem).file === "string" &&
          ((m as PostStudioMediaItem).kind === "photo" || (m as PostStudioMediaItem).kind === "video"),
      ).map((m) => ({
        ...m,
        caption: typeof m.caption === "string" ? m.caption : "",
        verdict: m.verdict === "ok" || m.verdict === "alt" || m.verdict === "rejected" ? m.verdict : undefined,
      }))
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
  if (media.length === 0) return null;
  const windowRaw = (d.window && typeof d.window === "object" ? d.window : null) as
    | { start?: unknown; end?: unknown }
    | null;
  const win =
    (windowRaw && typeof windowRaw.start === "string" && typeof windowRaw.end === "string"
      ? { start: windowRaw.start, end: windowRaw.end }
      : plan
        ? { start: plan.dateStart, end: plan.dateEnd }
        : undefined);
  const musicSearchRaw = (d.musicSearch && typeof d.musicSearch === "object" ? d.musicSearch : null) as
    | { queries?: unknown; note?: unknown }
    | null;
  const musicSearch =
    musicSearchRaw && Array.isArray(musicSearchRaw.queries)
      ? {
          queries: musicSearchRaw.queries.filter((q): q is string => typeof q === "string").slice(0, 8),
          note: typeof musicSearchRaw.note === "string" ? musicSearchRaw.note : undefined,
        }
      : undefined;
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
    network: optStr(d.network),
    plan,
    window: win,
    people: plan?.people,
    motifs: Array.isArray(d.motifs) ? d.motifs.filter((p): p is string => typeof p === "string") : undefined,
    context: optStr(d.context),
    provenance: optStr(d.provenance),
    musicSearch,
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
  const review: Record<string, { status: PostStudioReviewStatus; note?: string }> = {};
  if (s.review && typeof s.review === "object" && !Array.isArray(s.review)) {
    for (const [key, value] of Object.entries(s.review as Record<string, unknown>)) {
      if (!known.has(key) || !value || typeof value !== "object") continue;
      const v = value as { status?: unknown; note?: unknown };
      if (v.status === "ok" || v.status === "flagged" || v.status === "pending") {
        const entry: { status: PostStudioReviewStatus; note?: string } = { status: v.status };
        if (typeof v.note === "string") entry.note = v.note;
        review[key] = entry;
      }
    }
  }
  let musicTrack: PostStudioState["musicTrack"] = null;
  if (s.musicTrack && typeof s.musicTrack === "object" && !Array.isArray(s.musicTrack)) {
    const mt = s.musicTrack as { track?: unknown; query?: unknown; pickedAt?: unknown };
    const t = mt.track as Record<string, unknown> | undefined;
    if (
      t && typeof t.audioId === "string" && /^\d{1,32}$/.test(t.audioId) && typeof t.title === "string" &&
      typeof t.artist === "string" && typeof t.durationMs === "number"
    ) {
      musicTrack = {
        track: {
          audioId: t.audioId,
          audioClusterId: typeof t.audioClusterId === "string" && /^\d{1,32}$/.test(t.audioClusterId) ? t.audioClusterId : "",
          title: t.title,
          artist: t.artist,
          durationMs: t.durationMs,
          hasLyrics: t.hasLyrics === true,
          isExplicit: t.isExplicit === true,
        },
        query: typeof mt.query === "string" ? mt.query : "",
        pickedAt: typeof mt.pickedAt === "string" ? mt.pickedAt : "",
      };
    }
  }
  return {
    revision: typeof s.revision === "number" && s.revision >= 0 ? Math.floor(s.revision) : 0,
    presetId: typeof s.presetId === "string" ? s.presetId : base.presetId,
    selection: selection.length > 0 ? selection : base.selection,
    musicId: typeof s.musicId === "string" ? s.musicId : null,
    format: format ?? base.format,
    reelVideoId: typeof s.reelVideoId === "string" && known.has(s.reelVideoId) ? s.reelVideoId : base.reelVideoId,
    decidedAt: typeof s.decidedAt === "string" ? s.decidedAt : null,
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : null,
    musicTrack,
    review,
  };
}

function bumped(state: PostStudioState): PostStudioState {
  return { ...state, revision: state.revision + 1, updatedAt: new Date().toISOString() };
}

export function reviewStatusOf(state: PostStudioState, id: string): PostStudioReviewStatus {
  return state.review?.[id]?.status ?? "pending";
}

export interface ReviewSummary {
  total: number;
  ok: number;
  flagged: number;
  pending: number;
  complete: boolean;
}

export function reviewSummary(state: PostStudioState): ReviewSummary {
  let ok = 0;
  let flagged = 0;
  for (const id of state.selection) {
    const status = reviewStatusOf(state, id);
    if (status === "ok") ok += 1;
    else if (status === "flagged") flagged += 1;
  }
  const total = state.selection.length;
  return { total, ok, flagged, pending: total - ok - flagged, complete: total > 0 && ok === total };
}

/** Publishable music: a real IG track, or a plan-local track that is not a generated loop. */
export function publishableMusic(
  definition: PostStudioDefinition,
  state: PostStudioState,
): { source: "instagram" | "local"; label: string } | null {
  if (state.musicTrack) return { source: "instagram", label: `${state.musicTrack.track.title} · ${state.musicTrack.track.artist}` };
  if (state.musicId) {
    const option = definition.music.find((m) => m.id === state.musicId);
    if (option && !option.generated) return { source: "local", label: option.label };
  }
  return null;
}

/**
 * Every coherence rule the final decision enforces. Empty array = ready.
 * The UI renders this list live; `decide` blocks on any issue.
 */
export function studioCoherence(definition: PostStudioDefinition, state: PostStudioState): string[] {
  const issues: string[] = [];
  const byId = new Map(definition.media.map((m) => [m.id, m]));
  for (const id of state.selection) {
    const item = byId.get(id);
    if (!item) continue;
    if (item.verdict === "rejected") issues.push(`REJECTED_MEDIA:${id}`);
    if (definition.window && item.date && (item.date < definition.window.start || item.date > definition.window.end)) {
      issues.push(`OUT_OF_WINDOW:${id}`);
    }
  }
  if (!publishableMusic(definition, state)) issues.push("MUSIC_IG_REQUIRED");
  if (state.format === "reel" && !state.reelVideoId) issues.push("REEL_VIDEO_REQUIRED");
  const review = reviewSummary(state);
  if (review.pending > 0) issues.push(`REVIEW_PENDING:${review.pending}`);
  if (review.flagged > 0) issues.push(`REVIEW_FLAGGED:${review.flagged}`);
  return issues;
}

/** The decision.json payload for the current state (OpenPost/Postiz feed contract). */
export function buildDecision(
  definition: PostStudioDefinition,
  state: PostStudioState,
  decidedAt: string,
  vision?: { at: string; model: string; status: string; selectionHash: string } | null,
): PostStudioDecision {
  const byId = new Map(definition.media.map((m) => [m.id, m]));
  const review = reviewSummary(state);
  const music = publishableMusic(definition, state);
  const musicBlock: PostStudioDecision["music"] = state.musicTrack
    ? {
        source: "instagram",
        audioId: state.musicTrack.track.audioId,
        audioClusterId: state.musicTrack.track.audioClusterId,
        title: state.musicTrack.track.title,
        artist: state.musicTrack.track.artist,
        durationMs: state.musicTrack.track.durationMs,
        label: `${state.musicTrack.track.title} · ${state.musicTrack.track.artist}`,
        note: `audio_id real de Instagram (búsqueda «${state.musicTrack.query}»); utilizable por OpenPost/Postiz y por el puente instagrapi`,
      }
    : music
      ? {
          source: "local",
          id: state.musicId ?? "",
          label: music.label,
          note: "pista local del plan (no generada)",
        }
      : null;
  return {
    post: definition.id,
    target: "openpost",
    source: "exohuman-ui post-studio",
    account: definition.account,
    format: state.format ?? "carousel",
    music: musicBlock,
    slides: state.selection
      .map((id) => byId.get(id))
      .filter((m): m is PostStudioMediaItem => !!m)
      .map((m) => ({ id: m.id, file: m.file, caption: m.caption, kind: m.kind, date: m.date, place: m.place })),
    reel: {
      videoId: state.format === "reel" ? state.reelVideoId : null,
      storyboard: definition.reel.storyboard,
      duration: definition.reel.duration,
    },
    caption: definition.caption,
    hashtags: definition.hashtags,
    checklist: definition.checklist,
    vision: vision ?? null,
    validation: {
      reviewed: review.ok,
      total: review.total,
      flagged: state.selection.filter((id) => reviewStatusOf(state, id) === "flagged"),
      checks: studioCoherence(definition, state),
      checkedAt: decidedAt,
    },
    decidedAt,
  };
}

function parseTrackInput(raw: unknown): PostStudioIgTrack | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  const audioId = typeof t.audioId === "string" ? t.audioId : "";
  if (!/^\d{1,32}$/.test(audioId)) return null;
  if (typeof t.title !== "string" || !t.title || t.title.length > 200) return null;
  if (typeof t.artist !== "string" || t.artist.length > 200) return null;
  if (typeof t.durationMs !== "number" || !Number.isFinite(t.durationMs) || t.durationMs < 0 || t.durationMs > 3.6e7) return null;
  return {
    audioId,
    audioClusterId: typeof t.audioClusterId === "string" && /^\d{1,32}$/.test(t.audioClusterId) ? t.audioClusterId : "",
    title: t.title,
    artist: t.artist,
    durationMs: Math.floor(t.durationMs),
    hasLyrics: t.hasLyrics === true,
    isExplicit: t.isExplicit === true,
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
      if (item.verdict === "rejected") return { ok: false, error: "MEDIA_REJECTED", issues: [item.reason ?? ""] };
      if (state.selection.includes(action.id)) {
        const selection = state.selection.filter((id) => id !== action.id);
        if (selection.length === 0) return { ok: false, error: "SELECTION_EMPTY" };
        return { ok: true, state: { ...bumped(state), selection, presetId: null } };
      }
      if (state.selection.length >= definition.maxSlides) {
        return { ok: false, error: `MAX_SLIDES_${definition.maxSlides}` };
      }
      if (definition.window && item.date && (item.date < definition.window.start || item.date > definition.window.end)) {
        return { ok: false, error: "MEDIA_OUT_OF_WINDOW", issues: [`${item.date} fuera de ${definition.window.start}…${definition.window.end}`] };
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
    case "choose-ig-track": {
      if (action.track === null || action.track === undefined) {
        return { ok: true, state: { ...bumped(state), musicTrack: null } };
      }
      const track = parseTrackInput(action.track);
      if (!track) return { ok: false, error: "BAD_TRACK" };
      const query = typeof action.query === "string" ? action.query.slice(0, 80) : "";
      return {
        ok: true,
        state: { ...bumped(state), musicTrack: { track, query, pickedAt: new Date().toISOString() }, musicId: null },
      };
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
    case "review-media": {
      if (!definition.media.some((m) => m.id === action.id)) return { ok: false, error: "MEDIA_NOT_FOUND" };
      if (action.status !== "ok" && action.status !== "flagged" && action.status !== "pending") {
        return { ok: false, error: "BAD_REVIEW_STATUS" };
      }
      const review = { ...(state.review ?? {}) };
      if (action.status === "pending") delete review[action.id];
      else {
        const entry: { status: PostStudioReviewStatus; note?: string } = { status: action.status };
        if (typeof action.note === "string") entry.note = action.note.slice(0, 200);
        review[action.id] = entry;
      }
      return { ok: true, state: { ...bumped(state), review } };
    }
    case "decide": {
      if (state.selection.length === 0) return { ok: false, error: "SELECTION_EMPTY" };
      const issues = studioCoherence(definition, state);
      if (issues.length > 0) return { ok: false, error: "COHERENCE_FAILED", issues };
      const decidedAt = new Date().toISOString();
      const decided = { ...bumped(state), decidedAt };
      return { ok: true, state: decided, decision: buildDecision(definition, decided, decidedAt) };
    }
    default:
      return { ok: false, error: "UNKNOWN_ACTION" };
  }
}
