"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  postStudioIgPreviewSrc,
  postStudioMediaSrc,
  reviewStatusOf,
  reviewSummary,
  studioCoherence,
  validationCovers,
  type PostStudioDefinition,
  type PostStudioIgTrack,
  type PostStudioListEntry,
  type PostStudioMediaItem,
  type PostStudioState,
  type PostStudioValidation,
  type PostStudioVisionVerdict,
} from "@/lib/post-studio-shared";

/**
 * Post Studio v2 — interactive review of a social post before OpenPost:
 * full carousel/reel preview in a phone frame, REAL Instagram music
 * (search → listen → pick, audio_id kept for the receipt), provenance of
 * every photo (date, time, who shared it), a full-post vision validation
 * that gates the decision, and a per-slide final review. Read-only about
 * publishing: nothing here ever posts; the receipt is a file the
 * OpenPost/Postiz dispatcher consumes.
 */

export interface PostStudioViewProps {
  onClose?: () => void;
  /** Post id under ~/.local/state/exohuman/post-studio; undefined → picker. */
  postId?: string;
}

type Snapshot = { definition: PostStudioDefinition; state: PostStudioState };

type IgSearchState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "error"; error: string }
  | { phase: "done"; tracks: PostStudioIgTrack[] };

const FORMAT_LABEL: Record<string, string> = { carousel: "Carrusel", reel: "Reel" };

const VISION_CHIP: Record<PostStudioVisionVerdict, { label: string; color: string; bg: string }> = {
  fit: { label: "✓ encaja", color: "#16a34a", bg: "rgba(22,163,74,0.12)" },
  unclear: { label: "? dudosa", color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  off: { label: "✗ no pertenece", color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
};

function star(flag?: boolean) {
  return flag ? " ★" : "";
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDurationMs(ms: number): string {
  return fmtTime(Math.round(ms / 1000));
}

function fmtDateSmart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMin = Math.round((now - d.getTime()) / 60000);
  if (diffMin < 1) return "ahora mismo";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffMin < 60 * 24) return `hace ${Math.floor(diffMin / 60)} h`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One-line provenance of a media item (why it's here, where it came from). */
function provenanceLine(item: PostStudioMediaItem): string {
  const bits: string[] = [];
  if (item.date) bits.push(item.time ? `${item.date} ${item.time}` : item.date);
  if (item.sender) bits.push(`de ${item.sender}`);
  if (item.place) bits.push(item.place);
  return bits.join(" · ");
}

function MediaThumb({ item, postId, size }: { item: PostStudioMediaItem; postId: string; size: number }) {
  const src = postStudioMediaSrc(postId, item.file);
  if (item.kind === "video") {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        style={{ width: size, height: size, objectFit: "cover", display: "block", background: "#000", borderRadius: 8 }}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- local studio asset
    <img
      src={src}
      alt={item.caption || item.file}
      loading="lazy"
      style={{ width: size, height: size, objectFit: "cover", display: "block", borderRadius: 8 }}
    />
  );
}

function VisionChip({ verdict, title }: { verdict: PostStudioVisionVerdict; title?: string }) {
  const chip = VISION_CHIP[verdict];
  return (
    <span
      title={title}
      style={{
        fontSize: 9.5, fontWeight: 800, color: chip.color, background: chip.bg,
        borderRadius: 999, padding: "1px 7px", whiteSpace: "nowrap",
      }}
    >
      {chip.label}
    </span>
  );
}

/** Landing: every studio post, newest activity first. Generic entry point. */
function PostPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose?: () => void }) {
  const [posts, setPosts] = useState<PostStudioListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/post-studio/list", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("LIST_FAILED");
        const body = (await res.json()) as { posts: PostStudioListEntry[] };
        if (!cancelled) setPosts(body.posts);
      })
      .catch(() => {
        if (!cancelled) setError("LIST_FAILED");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg)", overflow: "hidden" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎬</span>
          <div>
            <h1 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "var(--text)" }}>Post Studio</h1>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>Estudio de posts — música real de IG, curación con visión y decisión con recibo</div>
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="config-button config-button-small config-button-secondary" style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}>Cerrar</button>
        )}
      </header>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: 900, width: "100%", margin: "0 auto" }}>
        {error && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No se pudo cargar la lista de posts.</div>
        )}
        {!error && posts === null && (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Cargando…</div>
        )}
        {posts && posts.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
            No hay posts en <code>~/.local/state/exohuman/post-studio</code>.<br />
            Cada post es un directorio con <code>studio.json</code> (definición), <code>media/</code> y <code>music/</code>.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12 }}>
          {(posts ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                textAlign: "left", cursor: "pointer", borderRadius: 12, padding: "14px 16px",
                border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text)",
                display: "flex", flexDirection: "column", gap: 6,
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.title}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{p.subtitle}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span>📍 {p.location || "—"}</span>
                <span>🖼️ {p.selectionCount}/{p.mediaCount}</span>
                <span>🎵 {p.realMusicCount}</span>
                {p.decidedAt && <span style={{ color: "#22c55e", fontWeight: 700 }}>✅ decidido</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PostStudioView({ onClose, postId: initialPostId }: PostStudioViewProps) {
  const isMobile = useIsMobile();
  const [activePostId, setActivePostId] = useState<string | null>(initialPostId ?? null);
  const postId = activePostId;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [validation, setValidation] = useState<PostStudioValidation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lightbox, setLightbox] = useState<PostStudioMediaItem | null>(null);

  // music search (real IG library)
  const [igQuery, setIgQuery] = useState("");
  const [igSearch, setIgSearch] = useState<IgSearchState>({ phase: "idle" });
  const [igAdding, setIgAdding] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [musicTime, setMusicTime] = useState({ t: 0, d: 0 });
  const [validating, setValidating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/post-studio?post=${encodeURIComponent(postId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "POST_NOT_FOUND" : "LOAD_FAILED");
      const body = (await res.json()) as Snapshot & { validation: PostStudioValidation | null };
      setSnapshot({ definition: body.definition, state: body.state });
      setValidation(body.validation ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (postId) void load();
    else setLoading(false);
  }, [postId, load]);

  const act = useCallback(
    async (action: Record<string, unknown>) => {
      if (!postId) return;
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch("/api/post-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post: postId, ...action }),
        });
        const body = (await res.json()) as (Snapshot & { error?: string; details?: string[] }) | { error: string; details?: string[] };
        if (!res.ok || "error" in body) {
          const code = "error" in body ? body.error ?? "ACTION_FAILED" : "ACTION_FAILED";
          const details = body.details?.length ? ` (${body.details.slice(0, 3).join(", ")})` : "";
          setActionError(code + details);
          return;
        }
        setSnapshot({ definition: body.definition, state: body.state });
      } catch {
        setActionError("NETWORK");
      } finally {
        setBusy(false);
      }
    },
    [postId],
  );

  const definition = snapshot?.definition;
  const state = snapshot?.state;
  const byId = useMemo(() => new Map((definition?.media ?? []).map((m) => [m.id, m])), [definition]);
  const selection = useMemo(
    () => (state?.selection ?? []).map((id) => byId.get(id)).filter((m): m is PostStudioMediaItem => !!m),
    [state?.selection, byId],
  );
  const locked = Boolean(state?.decidedAt);

  // The picked real IG track (musicTrack) or the local plan option (musicId).
  const pickedIg = state?.musicTrack?.track ?? null;
  const pickedIgOption = pickedIg ? definition?.music.find((m) => m.audioId === pickedIg.audioId) ?? null : null;
  const localMusic = state?.musicId ? definition?.music.find((m) => m.id === state.musicId) ?? null : null;

  // Live decision gates (the same rules the server enforces on decide).
  const coherence = useMemo(
    () => (definition && state ? studioCoherence(definition, state) : []),
    [definition, state],
  );
  const cover = useMemo(
    () => (state ? validationCovers(validation, state) : { ok: false as const, reason: "MISSING" as const }),
    [validation, state],
  );
  const review = useMemo(() => (state ? reviewSummary(state) : { total: 0, ok: 0, flagged: 0, pending: 0, complete: false }), [state]);
  const canDecide = coherence.length === 0 && cover.ok && selection.length > 0;

  // keep the preview index inside the selection
  useEffect(() => {
    if (previewIndex > 0 && previewIndex >= Math.max(1, selection.length)) setPreviewIndex(0);
  }, [selection.length, previewIndex]);

  // single audio element: follows the picked track or a search-result preview
  const musicSrc = pickedIg
    ? pickedIgOption
      ? postStudioMediaSrc(postId ?? "", pickedIgOption.file)
      : postStudioIgPreviewSrc(state?.musicTrack?.query ?? pickedIg.title, pickedIg.audioId)
    : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !musicSrc) return;
    if (audio.getAttribute("data-src") !== musicSrc) {
      audio.setAttribute("data-src", musicSrc);
      audio.src = musicSrc;
      audio.load();
      setMusicTime({ t: 0, d: 0 });
    }
  }, [musicSrc]);

  const lastProgressTick = useRef(-1);

  const playSrc = useCallback((src: string, key: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (previewingId === key && !audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (previewingId !== key) setMusicTime({ t: 0, d: 0 });
    setPreviewingId(key);
    audio.setAttribute("data-src", src);
    audio.src = src;
    audio.load();
    void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [previewingId]);

  /** Search Instagram's real music library (honest failure, no fabrication). */
  const searchIg = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    setIgSearch({ phase: "searching" });
    try {
      const res = await fetch(`/api/post-studio/music?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; error?: string; tracks?: PostStudioIgTrack[] };
      if (!body.ok || !body.tracks) {
        setIgSearch({ phase: "error", error: body.error ?? "IG_NO_RESULTS" });
        return;
      }
      setIgSearch(body.tracks.length ? { phase: "done", tracks: body.tracks } : { phase: "error", error: "IG_NO_RESULTS" });
    } catch {
      setIgSearch({ phase: "error", error: "NETWORK" });
    }
  }, []);

  /** Add the track to the studio (preview cached on disk) and pick it. */
  const chooseIgTrack = useCallback(
    async (track: PostStudioIgTrack, query: string) => {
      if (!postId) return;
      setIgAdding(track.audioId);
      setActionError(null);
      try {
        const res = await fetch("/api/post-studio/music", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post: postId, track, query }),
        });
        const body = (await res.json()) as Snapshot & { error?: string; previewOk?: boolean };
        if (!res.ok && body.error !== "MUSIC_ALREADY_ADDED") {
          setActionError(body.error ?? "MUSIC_ADD_FAILED");
          return;
        }
        if (body.definition && body.state) setSnapshot({ definition: body.definition, state: body.state });
        await act({ action: "choose-ig-track", track, query });
      } catch {
        setActionError("NETWORK");
      } finally {
        setIgAdding(null);
      }
    },
    [act, postId],
  );

  /** One full-post vision pass over the current selection. */
  const runValidation = useCallback(async () => {
    if (!postId) return;
    setValidating(true);
    setActionError(null);
    try {
      const res = await fetch("/api/post-studio/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: postId }),
      });
      const body = (await res.json()) as (Snapshot & { validation: PostStudioValidation; filled?: string[] }) | { error: string };
      if (!res.ok || !("validation" in body)) {
        setActionError(("error" in body ? body.error : "VISION_FAILED") + " — reintenta en un rato");
        return;
      }
      setSnapshot({ definition: body.definition, state: body.state });
      setValidation(body.validation);
    } catch {
      setActionError("NETWORK");
    } finally {
      setValidating(false);
    }
  }, [postId]);

  // reel slideshow advance when no video is chosen
  useEffect(() => {
    if (!snapshot || state?.format !== "reel" || state.reelVideoId) return;
    const id = window.setInterval(() => {
      setPreviewIndex((i) => (selection.length ? (i + 1) % selection.length : 0));
    }, 3200);
    return () => window.clearInterval(id);
  }, [snapshot, state?.format, state?.reelVideoId, selection.length]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  if (!postId) {
    return <PostPicker onPick={(id) => { setActivePostId(id); setLoading(true); }} onClose={onClose} />;
  }

  if (loading) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", background: "var(--bg)", color: "var(--text-muted)", fontSize: 13 }}>
        Cargando Post Studio…
      </div>
    );
  }
  if (loadError || !definition || !state) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 12, background: "var(--bg)", padding: 24 }}>
        <div style={{ fontSize: 32 }}>🎬</div>
        <div style={{ color: "var(--text)", fontWeight: 600 }}>Post Studio no disponible</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
          {loadError === "POST_NOT_FOUND" ? `No existe el post «${postId}» en ~/.local/state/exohuman/post-studio.` : "Error cargando el post."}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="config-button config-button-small" onClick={() => void load()}>Reintentar</button>
          <button type="button" className="config-button config-button-small config-button-secondary" onClick={() => setActivePostId(null)}>← Posts</button>
        </div>
      </div>
    );
  }

  const current = selection[Math.min(previewIndex, selection.length - 1)];
  const reelVideo = state.reelVideoId ? byId.get(state.reelVideoId) : null;
  const plan = definition.plan;
  const presetChips = definition.presets.map((p) => (
    <button
      key={p.id}
      type="button"
      disabled={busy || locked}
      onClick={() => { setPreviewIndex(0); void act({ action: "apply-preset", presetId: p.id }); }}
      style={{
        padding: "7px 12px",
        borderRadius: 9,
        border: `1px solid ${state.presetId === p.id ? "var(--accent)" : "var(--border)"}`,
        background: state.presetId === p.id ? "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))" : "var(--bg-panel)",
        color: "var(--text)",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: locked ? "not-allowed" : "pointer",
        opacity: locked ? 0.6 : 1,
      }}
      title={p.desc}
    >
      <span style={{ color: "var(--accent)", marginRight: 6 }}>{p.letter}</span>
      {p.name} · {p.slides.length}
    </button>
  ));

  const igPickedCard = pickedIg && (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 10,
        border: "1px solid var(--accent)",
        background: "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))",
      }}
    >
      <button
        type="button"
        aria-label={playing ? "Pausar" : "Escuchar"}
        onClick={() =>
          musicSrc
            ? playSrc(musicSrc, `picked-${pickedIg.audioId}`)
            : undefined
        }
        style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff",
          fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {playing && previewingId === `picked-${pickedIg.audioId}` ? "⏸" : "▶"}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 999, padding: "0 6px" }}>MÚSICA DEL POST · IG REAL</span>
          {pickedIg.isExplicit && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4, padding: "0 4px" }}>E</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {pickedIg.title} · {pickedIg.artist}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
          {fmtDurationMs(pickedIg.durationMs)} · audio_id {pickedIg.audioId.slice(0, 10)}… · para OpenPost/Postiz
        </div>
        {playing && previewingId === `picked-${pickedIg.audioId}` && (
          <div style={{ marginTop: 5 }}>
            <div style={{ height: 4, borderRadius: 2, background: "var(--bg)", overflow: "hidden" }}>
              <div style={{ width: `${musicTime.d ? (musicTime.t / musicTime.d) * 100 : 0}%`, height: "100%", background: "var(--accent)" }} />
            </div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{fmtTime(musicTime.t)} / {fmtTime(musicTime.d)}</div>
          </div>
        )}
      </div>
      {!locked && (
        <button
          type="button"
          onClick={() => void act({ action: "choose-ig-track", track: null })}
          disabled={busy}
          style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "#ef4444", cursor: "pointer", fontSize: 12 }}
          title="Quitar la pista del post"
        >
          ✕
        </button>
      )}
    </div>
  );

  const localMusicCards = definition.music
    .filter((m) => m.source !== "instagram")
    .map((m) => {
      const selected = state.musicId === m.id;
      return (
        <div
          key={m.id}
          style={{
            display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", borderRadius: 10,
            border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
            background: selected ? "color-mix(in srgb, var(--accent) 8%, var(--bg-panel))" : "var(--bg-panel)",
            opacity: 0.85,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
              <span style={{ color: "var(--accent)" }}>{m.letter}</span> · {m.label}
              {m.generated && (
                <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, color: "#d97706", background: "rgba(217,119,6,0.12)", borderRadius: 999, padding: "1px 7px" }}>
                  referencia — no publicable
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{m.style} · {m.bpm} BPM</div>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => void act({ action: "choose-music", musicId: selected ? null : m.id })}
              disabled={busy}
              style={{ padding: "4px 10px", borderRadius: 7, fontSize: 10.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--border)", background: selected ? "var(--accent)" : "var(--bg)", color: selected ? "#fff" : "var(--text-muted)" }}
            >
              {selected ? "elegida" : m.generated ? "solo ref" : "elegir"}
            </button>
          )}
        </div>
      );
    });

  const igResults = igSearch.phase === "done"
    ? igSearch.tracks.map((t) => (
        <div
          key={t.audioId}
          style={{
            display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10,
            border: `1px solid ${pickedIg?.audioId === t.audioId ? "var(--accent)" : "var(--border)"}`, background: "var(--bg-panel)",
          }}
        >
          <button
            type="button"
            aria-label="Escuchar preview"
            onClick={() => playSrc(postStudioIgPreviewSrc(igQuery, t.audioId), t.audioId)}
            style={{
              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
              border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
              fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {playing && previewingId === t.audioId ? "⏸" : "▶"}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.title} {t.isExplicit && <span style={{ fontSize: 9, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4, padding: "0 3px" }}>E</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.artist || "—"} · {fmtDurationMs(t.durationMs)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void chooseIgTrack(t, igQuery)}
            disabled={busy || igAdding !== null || locked}
            style={{
              padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: "pointer",
              border: "1px solid var(--accent)", background: pickedIg?.audioId === t.audioId ? "var(--accent)" : "transparent",
              color: pickedIg?.audioId === t.audioId ? "#fff" : "var(--accent)", whiteSpace: "nowrap",
            }}
          >
            {igAdding === t.audioId ? "…" : pickedIg?.audioId === t.audioId ? "elegida" : "Elegir"}
          </button>
        </div>
      ))
    : null;

  const musicSection = (
    <>
      {igPickedCard}
      {!locked && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <form
            onSubmit={(e) => { e.preventDefault(); void searchIg(igQuery); }}
            style={{ display: "flex", gap: 6 }}
          >
            <input
              value={igQuery}
              onChange={(e) => setIgQuery(e.target.value)}
              placeholder="Buscar en la biblioteca real de Instagram…"
              maxLength={80}
              style={{
                flex: 1, minWidth: 0, padding: "8px 12px", borderRadius: 9, fontSize: 12.5,
                border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={igSearch.phase === "searching"}
              style={{ padding: "0 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: "1px solid var(--accent)", background: "var(--accent)", color: "#fff" }}
            >
              {igSearch.phase === "searching" ? "…" : "Buscar"}
            </button>
          </form>
          {definition.musicSearch?.queries && definition.musicSearch.queries.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {definition.musicSearch.queries.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setIgQuery(q); void searchIg(q); }}
                  style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 11, cursor: "pointer",
                    border: "1px solid var(--border)", background: "var(--bg-panel)", color: "var(--text-muted)",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {igSearch.phase === "error" && (
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", padding: "6px 10px", borderRadius: 9, border: "1px dashed var(--border)" }}>
              {igSearch.error === "IG_NO_RESULTS"
                ? "Sin resultados para esa búsqueda — prueba otra palabra."
                : igSearch.error === "IG_SESSION_ERROR"
                  ? "La sesión de Instagram no responde ahora mismo (honesto: sin música hasta que vuelva)."
                  : igSearch.error === "BRIDGE_UNREACHABLE"
                    ? "No se llega al puente instagrapi (CT126). Nada se inventa: reintenta más tarde."
                    : `Música no disponible (${igSearch.error}).`}
            </div>
          )}
          {igResults && igResults.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto", padding: 2 }}>{igResults}</div>}
        </div>
      )}
      {localMusicCards.length > 0 && (
        <details style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-panel)", padding: "8px 12px" }}>
          <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)" }}>
            Referencias locales del plan ({localMusicCards.length}) — no se publican si son loops generados
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>{localMusicCards}</div>
        </details>
      )}
    </>
  );

  const slideSrc = (item: PostStudioMediaItem) => postStudioMediaSrc(postId, item.file);
  const showReel = state.format === "reel";
  const musicBadgeLabel = pickedIg ? `${pickedIg.title} · ${pickedIg.artist}` : localMusic?.label ?? null;

  const phonePreview = (
    <div
      style={{
        width: "100%",
        maxWidth: isMobile ? 300 : 320,
        margin: "0 auto",
        aspectRatio: "9 / 16",
        borderRadius: 26,
        border: "1px solid var(--border)",
        background: "#000",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
        touchAction: "pan-y",
      }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = e.changedTouches[0]?.clientX ?? null;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) < 40) return;
        setPreviewIndex((i) => {
          const n = Math.max(1, selection.length);
          return dx < 0 ? (i + 1) % n : (i - 1 + n) % n;
        });
      }}
    >
      {/* media */}
      {showReel && reelVideo ? (
        <video
          key={reelVideo.id}
          src={slideSrc(reelVideo)}
          muted
          playsInline
          autoPlay
          loop
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : current ? (
        current.kind === "video" ? (
          <video
            key={current.id}
            src={slideSrc(current)}
            muted
            playsInline
            controls
            preload="metadata"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- local studio asset
          <img
            key={current.id}
            src={slideSrc(current)}
            alt={current.caption}
            onClick={() => setLightbox(current)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", cursor: "zoom-in" }}
          />
        )
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
          Sin fotos seleccionadas
        </div>
      )}

      {/* IG-like chrome */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "10px 12px", background: "linear-gradient(rgba(0,0,0,0.55), transparent)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>R</div>
        <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {definition.account.replace("@", "")}
          {plan?.location && <span style={{ opacity: 0.7, fontWeight: 400 }}> · {plan.location}</span>}
        </div>
      </div>

      {/* music badge */}
      {musicBadgeLabel && showReel && (
        <div style={{ position: "absolute", top: 44, right: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "4px 9px", color: "#fff", fontSize: 10.5, fontWeight: 600, maxWidth: "80%" }}>
          <span>{playing ? "♫" : "♪"}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{musicBadgeLabel}</span>
        </div>
      )}

      {/* bottom bar: counter, caption, controls */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.72))", padding: "26px 12px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>
            {showReel && reelVideo ? "REEL" : `${Math.min(previewIndex + 1, Math.max(selection.length, 1))}/${selection.length}`}
            {showReel && !reelVideo ? " · slideshow" : ""}
          </span>
          {current && (
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
              {current.caption}{star(current.star)}
            </span>
          )}
        </div>
        {!showReel && selection.length > 1 && (
          <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 8 }}>
            {selection.slice(0, 12).map((item, i) => (
              <span key={item.id} style={{ width: i === Math.min(previewIndex, selection.length - 1) ? 14 : 5, height: 5, borderRadius: 3, background: i === Math.min(previewIndex, selection.length - 1) ? "var(--accent)" : "rgba(255,255,255,0.5)", transition: "width 0.2s" }} />
            ))}
            {selection.length > 12 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginLeft: 2 }}>+{selection.length - 12}</span>}
          </div>
        )}
      </div>

      {/* arrows (desktop / fine pointer) */}
      {!showReel && selection.length > 1 && !isMobile && (
        <>
          <button type="button" aria-label="Anterior" onClick={() => setPreviewIndex((i) => (i - 1 + selection.length) % selection.length)}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>‹</button>
          <button type="button" aria-label="Siguiente" onClick={() => setPreviewIndex((i) => (i + 1) % selection.length)}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 30, height: 30, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>›</button>
        </>
      )}
    </div>
  );

  const library = definition.media.map((item) => {
    const order = state.selection.indexOf(item.id);
    const picked = order >= 0;
    const vision = item.vision?.verdict;
    const outOfWindow = definition.window && item.date &&
      (item.date < definition.window.start || item.date > definition.window.end);
    const rejected = item.verdict === "rejected";
    return (
      <div
        key={item.id}
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border: `2px solid ${picked ? "var(--accent)" : rejected || outOfWindow ? "#d97706" : "var(--border)"}`,
          cursor: locked ? "default" : "pointer",
          opacity: locked ? 0.75 : rejected ? 0.5 : 1,
          background: "var(--bg-panel)",
        }}
        onClick={() => {
          if (!locked) void act({ action: "toggle-media", id: item.id });
        }}
        title={`${item.caption || item.file}\n${provenanceLine(item) || "sin procedencia"}${item.vision ? `\nvisión: ${item.vision.desc}` : ""}${outOfWindow ? "\n⚠ fecha fuera del plan" : ""}${rejected ? `\nrechazada: ${item.reason ?? ""}` : ""}`}
      >
        <MediaThumb item={item} postId={postId} size={isMobile ? 84 : 96} />
        {picked && (
          <span style={{ position: "absolute", top: 4, left: 4, minWidth: 18, height: 18, borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {order + 1}
          </span>
        )}
        {item.star && <span style={{ position: "absolute", top: 4, right: 5, fontSize: 11, color: "#e3b341" }}>★</span>}
        {(vision || outOfWindow || rejected) && (
          <span style={{ position: "absolute", top: 4, right: item.star ? 22 : 5, display: "flex", gap: 3 }}>
            {vision && <VisionChip verdict={vision} title={item.vision?.desc} />}
            {!vision && (outOfWindow || rejected) && (
              <span style={{ fontSize: 10, fontWeight: 800, color: "#d97706", background: "rgba(217,119,6,0.85)", borderRadius: 999, padding: "1px 6px" }}>⚠</span>
            )}
          </span>
        )}
        <span
          onClick={(e) => { e.stopPropagation(); setLightbox(item); }}
          style={{ position: "absolute", bottom: 18, right: 4, width: 22, height: 22, borderRadius: 7, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}
          title="Ver en grande"
        >
          🔍
        </span>
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 9, color: "#fff", padding: "12px 5px 3px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.caption ? `${item.caption} · ` : ""}{item.date ? `${item.date.slice(5)}${item.sender ? ` · ${item.sender}` : ""}` : "sin fecha"}
        </span>
      </div>
    );
  });

  const validationById = new Map((validation?.items ?? []).map((it) => [it.id, it]));

  const selectionRows = selection.map((item, index) => {
    const status = reviewStatusOf(state, item.id);
    const vItem = validationById.get(item.id);
    const vision = item.vision?.verdict ?? vItem?.verdict;
    const visionDesc = item.vision?.desc ?? vItem?.desc ?? "";
    const outOfWindow = definition.window && item.date &&
      (item.date < definition.window.start || item.date > definition.window.end);
    return (
      <div
        key={item.id}
        draggable={!locked && !isMobile}
        onDragStart={(e) => { e.dataTransfer.setData("text/post-studio-index", String(index)); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData("text/post-studio-index");
          const from = Number(raw);
          if (!Number.isInteger(from) || from === index || from < 0 || from >= selection.length) return;
          const ids = [...state.selection];
          const [moved] = ids.splice(from, 1);
          ids.splice(index, 0, moved);
          void act({ action: "reorder", ids });
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 8px",
          borderRadius: 9,
          border: `1px solid ${status === "flagged" ? "#ef4444" : "var(--border)"}`,
          background: "var(--bg-panel)",
          opacity: locked ? 0.75 : 1,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)", minWidth: 20, textAlign: "right" }}>{index + 1}</span>
        <MediaThumb item={item} postId={postId} size={38} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.caption || item.file}{star(item.star)}
          {item.kind === "video" && <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 10 }}>vídeo</span>}
          <span style={{ display: "block", fontSize: 9.5, color: "var(--text-dim)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {provenanceLine(item) || "sin procedencia"}{outOfWindow ? " · ⚠ fuera del plan" : ""}
          </span>
          {vision && (
            <span style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center" }}>
              <VisionChip verdict={vision} title={visionDesc} />
              {vision !== "fit" && visionDesc && (
                <span style={{ fontSize: 9.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{visionDesc}</span>
              )}
            </span>
          )}
        </span>
        {!locked && (
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <button type="button" aria-label="Vista buena" disabled={busy}
              onClick={() => void act({ action: "review-media", id: item.id, status: status === "ok" ? "pending" : "ok" })}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${status === "ok" ? "#22c55e" : "var(--border)"}`, background: status === "ok" ? "rgba(34,197,94,0.15)" : "var(--bg)", color: status === "ok" ? "#22c55e" : "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>✓</button>
            <button type="button" aria-label="Marcar problema" disabled={busy}
              onClick={() => void act({ action: "review-media", id: item.id, status: status === "flagged" ? "pending" : "flagged" })}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${status === "flagged" ? "#ef4444" : "var(--border)"}`, background: status === "flagged" ? "rgba(239,68,68,0.12)" : "var(--bg)", color: status === "flagged" ? "#ef4444" : "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>⚠</button>
            <button type="button" aria-label="Subir" disabled={index === 0 || busy} onClick={() => void act({ action: "move-media", id: item.id, direction: -1 })}
              style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: index === 0 ? "default" : "pointer", fontSize: 12, opacity: index === 0 ? 0.4 : 1 }}>↑</button>
            <button type="button" aria-label="Bajar" disabled={index === selection.length - 1 || busy} onClick={() => void act({ action: "move-media", id: item.id, direction: 1 })}
              style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: index === selection.length - 1 ? "default" : "pointer", fontSize: 12, opacity: index === selection.length - 1 ? 0.4 : 1 }}>↓</button>
            <button type="button" aria-label="Quitar" disabled={busy} onClick={() => void act({ action: "toggle-media", id: item.id })}
              style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕</button>
          </span>
        )}
      </div>
    );
  });

  // Live gate list rendered above the decision bar.
  const gateBits: { ok: boolean; label: string }[] = [
    { ok: Boolean(pickedIg) || (Boolean(localMusic) && !localMusic?.generated), label: pickedIg ? "música IG real ✓" : "música real de Instagram" },
    { ok: cover.ok, label: cover.ok ? `visión validada (${validation?.model}, ${fmtDateSmart(validation?.at ?? "")})` : !validation ? "validación visual pendiente" : cover.reason === "STALE" ? "validación caducada (revalida)" : cover.reason === "ISSUES" ? "visión con diapositivas que no pertenecen" : cover.reason === "OFF_SLIDE" ? "la selección cambió tras validar" : "sin validación" },
    { ok: review.complete, label: review.complete ? `revisión ${review.ok}/${review.total} ✓` : `revisión ${review.ok}/${review.total}` },
    ...(state.format === "reel" ? [{ ok: Boolean(state.reelVideoId), label: "vídeo del reel" }] : []),
    ...coherence
      .filter((c) => !c.startsWith("MUSIC_") && !c.startsWith("REVIEW_") && !c.startsWith("REEL_"))
      .map((c) => ({ ok: false, label: c })),
  ];

  const decisionSummary = `${FORMAT_LABEL[state.format ?? "carousel"]} · ${selection.length} fotos · ${pickedIg ? `🎵 ${pickedIg.title}` : musicBadgeLabel ? `🎵 ${musicBadgeLabel}` : "sin música publicable"}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg)", overflow: "hidden" }}>
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const tick = Math.floor(el.currentTime * 2);
          if (tick === lastProgressTick.current) return;
          lastProgressTick.current = tick;
          setMusicTime({ t: el.currentTime, d: el.duration || 0 });
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {/* header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button type="button" onClick={() => setActivePostId(null)} title="Volver a la lista de posts" style={{ border: "none", background: "transparent", color: "var(--text-muted)", fontSize: 16, cursor: "pointer", padding: 4 }}>🎬</button>
          <div style={{ minWidth: 0 }}>
            <h1 title={`${definition.title} · ${definition.subtitle}`} style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Post Studio · {definition.title}</h1>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {plan && <span>📍 {plan.location}</span>}
              {plan && <span>📅 {plan.dateStart.slice(5)} → {plan.dateEnd.slice(5)}</span>}
              {plan?.people && plan.people.length > 0 && <span>👥 {plan.people.length}</span>}
              <span>{definition.subtitle}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b" }}>PRE · nada se publica</span>
          {locked && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e" }}>DECIDIDO ✅</span>}
          {onClose && (
            <button type="button" onClick={onClose} className="config-button config-button-small config-button-secondary" style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}>Cerrar</button>
          )}
        </div>
      </header>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px 120px", paddingBottom: isMobile ? "calc(150px + env(safe-area-inset-bottom))" : 140 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(300px, 380px) 1fr", gap: 20, maxWidth: 1180, margin: "0 auto" }}>
          {/* preview column */}
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(["carousel", "reel"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  disabled={busy}
                  onClick={() => void act({ action: "choose-format", format: f })}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                    border: `1px solid ${state.format === f ? "var(--accent)" : "var(--border)"}`,
                    background: state.format === f ? "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))" : "var(--bg-panel)",
                    color: state.format === f ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {f === "carousel" ? "🖼️ Carrusel" : "🎞️ Reel"}
                </button>
              ))}
            </div>
            {phonePreview}
            {showReel && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em" }}>FUENTE DEL REEL</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {definition.media.filter((m) => m.kind === "video").map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={busy || locked}
                      onClick={() => void act({ action: "choose-reel-video", videoId: v.id })}
                      style={{
                        padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${state.reelVideoId === v.id ? "var(--accent)" : "var(--border)"}`,
                        background: state.reelVideoId === v.id ? "color-mix(in srgb, var(--accent) 12%, var(--bg-panel))" : "var(--bg-panel)",
                        color: "var(--text)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      title={v.caption || v.file}
                    >
                      🎥 {v.caption || v.file.slice(11, 30)}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy || locked}
                    onClick={() => void act({ action: "choose-reel-video", videoId: null })}
                    style={{
                      padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${state.reelVideoId === null ? "var(--accent)" : "var(--border)"}`,
                      background: state.reelVideoId === null ? "color-mix(in srgb, var(--accent) 12%, var(--bg-panel))" : "var(--bg-panel)",
                      color: "var(--text)",
                    }}
                    title="Las fotos del carrusel pasando solas — sólo para probar la música"
                  >
                    🖼️ Fotos (prueba)
                  </button>
                </div>
                <div style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-panel)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>STORYBOARD {definition.reel.duration}</div>
                  {definition.reel.storyboard.map((s) => (
                    <div key={s.t} style={{ display: "flex", gap: 8, fontSize: 11, lineHeight: 1.6 }}>
                      <span style={{ color: "var(--accent)", fontWeight: 700, whiteSpace: "nowrap", minWidth: 58 }}>{s.t}</span>
                      <span style={{ color: "var(--text-muted)" }}>{s.shot}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* steps column */}
          <section style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>1 · NARRATIVA DEL CARRUSEL</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{presetChips}</div>
              {!state.presetId && (
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>✏️ selección personalizada (no coincide con un preset)</div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                2 · MÚSICA REAL DE INSTAGRAM — busca, escucha y elige
              </div>
              {musicSection}
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>
                3 · TUS FOTOS — EN EL CARRUSEL ({selection.length}/{definition.maxSlides})
              </div>
              {selection.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 380, overflowY: "auto", padding: 2 }}>{selectionRows}</div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>Sin fotos — elige un preset o añade desde la biblioteca.</div>
              )}
            </div>

            {/* validation panel */}
            <div style={{ borderRadius: 10, border: `1px solid ${cover.ok ? "rgba(34,197,94,0.4)" : "var(--border)"}`, background: "var(--bg-panel)", padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                  4 · VALIDACIÓN VISUAL DEL POST {validation ? (cover.ok ? "· VIGENTE ✓" : "· caducada") : ""}
                </div>
                <button
                  type="button"
                  onClick={() => void runValidation()}
                  disabled={validating || locked || selection.length === 0}
                  style={{
                    padding: "5px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                    border: "1px solid var(--accent)", background: validating ? "var(--bg)" : "var(--accent)",
                    color: validating ? "var(--text-muted)" : "#fff",
                  }}
                >
                  {validating ? "Viendo las fotos…" : "Validar con visión"}
                </button>
              </div>
              {validation && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {validation.model} · {fmtDateSmart(validation.at)} · {validation.items.length} slides ·{" "}
                    <span style={{ color: validation.status === "ok" ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                      {validation.status === "ok" ? "todo encaja" : "con problemas"}
                    </span>
                  </div>
                  {validation.items
                    .filter((it) => it.verdict !== "fit" || (validationById.get(it.id)?.issues?.length ?? 0) > 0 || it.issues.length > 0)
                    .slice(0, 6)
                    .map((it) => {
                      const item = byId.get(it.id);
                      return (
                        <div key={it.id} style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 11.5 }}>
                          <VisionChip verdict={it.verdict} />
                          <span style={{ color: "var(--text)" }}>
                            {item ? (item.caption || item.file) : it.id}
                          </span>
                          <span style={{ color: "var(--text-dim)", flex: 1, minWidth: 0 }}>{it.desc}{it.issues.length ? ` — ${it.issues.join("; ")}` : ""}</span>
                        </div>
                      );
                    })}
                  {validation.issues.length > 0 && (
                    <div style={{ fontSize: 11, color: "#b45309" }}>
                      {validation.issues.slice(0, 4).map((issue, i) => <div key={i}>⚠ {issue}</div>)}
                    </div>
                  )}
                  {validation.notes && <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{validation.notes}</div>}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>
                BIBLIOTECA ({definition.media.length}) — fecha · quién la compartió
              </div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 84 : 96}px, 1fr))`, gap: 8 }}>{library}</div>
            </div>

            <details style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-panel)", padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>Ficha del post (caption, hashtags y pendientes)</summary>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                {definition.context && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic" }}>EXO: {definition.context}</div>}
                <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.7, color: "var(--text)" }}>{definition.caption}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{definition.hashtags}</div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                  {definition.checklist.map((c) => (
                    <li key={c} style={{ fontSize: 12, color: "var(--text-muted)" }}>{c}</li>
                  ))}
                </ul>
              </div>
            </details>
          </section>
        </div>
      </div>

      {/* sticky decision bar */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "10px 20px calc(10px + env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--border)", background: "var(--bg-panel)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", zIndex: 5,
          boxShadow: "0 -6px 20px rgba(0,0,0,0.18)",
        }}
      >
        {locked && state.decidedAt ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>
              ✅ Decisión registrada · {selection.length} fotos · {pickedIg ? `${pickedIg.title} (IG)` : "música local"} · alimenta OpenPost
            </span>
            <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => void act({ action: "reopen" })} style={{ cursor: "pointer" }}>
              Reabrir edición
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: "100%" }}>
              {gateBits.map((g, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: g.ok ? "#22c55e" : "var(--text-dim)", background: g.ok ? "rgba(34,197,94,0.1)" : "var(--bg)", border: `1px solid ${g.ok ? "rgba(34,197,94,0.3)" : "var(--border)"}` }}>
                  {g.ok ? "✓" : "○"} {g.label}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="config-button config-button-small"
              disabled={busy || !canDecide}
              onClick={() => void act({ action: "decide" })}
              style={{
                cursor: canDecide ? "pointer" : "not-allowed", opacity: canDecide ? 1 : 0.5,
                background: canDecide ? "var(--accent)" : "var(--bg)", color: canDecide ? "#fff" : "var(--text-muted)",
                border: `1px solid ${canDecide ? "var(--accent)" : "var(--border)"}`, fontWeight: 700,
              }}
            >
              {busy ? "…" : "Confirmar decisión → OpenPost"}
            </button>
          </>
        )}
        <span style={{ fontSize: 11, color: "var(--text-dim)", width: "100%", textAlign: "center" }}>{decisionSummary}</span>
      </div>

      {actionError && (
        <div
          onClick={() => setActionError(null)}
          style={{ position: "absolute", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 9, background: "var(--bg-panel)", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 9, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", maxWidth: "90%" }}
        >
          ⚠️ {actionError} — pulsa para cerrar
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, cursor: "zoom-out", padding: 16 }}
        >
          {lightbox.kind === "video" ? (
            <video src={postStudioMediaSrc(postId, lightbox.file)} controls autoPlay playsInline style={{ maxWidth: "96%", maxHeight: "88%", borderRadius: 10 }} onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local studio asset
            <img src={postStudioMediaSrc(postId, lightbox.file)} alt={lightbox.caption} style={{ maxWidth: "96%", maxHeight: "88%", borderRadius: 10, objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
          )}
          <div style={{ position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.85)", fontSize: 12.5, padding: "0 16px" }}>
            {lightbox.caption}{star(lightbox.star)} · {provenanceLine(lightbox)}
            {lightbox.vision && <span style={{ display: "block", fontSize: 11, opacity: 0.75, marginTop: 2 }}>visión ({lightbox.vision.by}): {lightbox.vision.desc}</span>}
            <span style={{ opacity: 0.6 }}> · Esc para cerrar</span>
          </div>
        </div>
      )}
    </div>
  );
}
