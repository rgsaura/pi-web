"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  postStudioMediaSrc,
  type PostStudioDefinition,
  type PostStudioMediaItem,
  type PostStudioState,
} from "@/lib/post-studio-shared";

/**
 * Post Studio — interactive review of a social post before OpenPost: full
 * carousel/reel preview in a phone frame, audible music per option, custom
 * photo selection (add/remove/reorder) and a final decision that writes the
 * OpenPost feed (decision.json). Read-only about publishing: nothing here
 * ever posts; the receipt is a file the dispatcher consumes.
 */

export interface PostStudioViewProps {
  onClose?: () => void;
  /** Post id under ~/.local/state/exohuman/post-studio (default herradura-2026). */
  postId?: string;
}

type Snapshot = { definition: PostStudioDefinition; state: PostStudioState };

const FORMAT_LABEL: Record<string, string> = { carousel: "Carrusel", reel: "Reel" };

function star(flag?: boolean) {
  return flag ? " ★" : "";
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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

export function PostStudioView({ onClose, postId = "herradura-2026" }: PostStudioViewProps) {
  const isMobile = useIsMobile();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lightbox, setLightbox] = useState<PostStudioMediaItem | null>(null);
  const [playingMusic, setPlayingMusic] = useState(false);
  const [musicTime, setMusicTime] = useState({ t: 0, d: 0 });
  const [decidedInfo, setDecidedInfo] = useState<{ at: string; slides: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/post-studio?post=${encodeURIComponent(postId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 404 ? "POST_NOT_FOUND" : "LOAD_FAILED");
      setSnapshot((await res.json()) as Snapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "LOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: Record<string, unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        const res = await fetch("/api/post-studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post: postId, ...action }),
        });
        const body = (await res.json()) as (Snapshot & { error?: string }) | { error: string };
        if (!res.ok || "error" in body) {
          setActionError("error" in body ? body.error ?? "ACTION_FAILED" : "ACTION_FAILED");
          return;
        }
        setSnapshot({ definition: body.definition, state: body.state });
        if (action.action === "decide") setDecidedInfo({ at: body.state.decidedAt ?? "", slides: body.state.selection.length });
        if (action.action === "reopen") setDecidedInfo(null);
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
  const music = definition?.music.find((m) => m.id === state?.musicId) ?? null;
  const locked = Boolean(state?.decidedAt);

  // keep the preview index inside the selection
  useEffect(() => {
    if (previewIndex > 0 && previewIndex >= Math.max(1, selection.length)) setPreviewIndex(0);
  }, [selection.length, previewIndex]);

  // single audio element follows the chosen option
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !music) return;
    const src = postStudioMediaSrc(postId, music.file);
    if (audio.getAttribute("data-src") !== src) {
      audio.setAttribute("data-src", src);
      audio.src = src;
      audio.load();
      setMusicTime({ t: 0, d: 0 });
      if (playingMusic) void audio.play().catch(() => setPlayingMusic(false));
    }
  }, [music, postId, playingMusic]);

  const lastProgressTick = useRef(-1);

  const toggleMusic = useCallback(
    (musicId: string) => {
      const audio = audioRef.current;
      const isCurrent = state?.musicId === musicId;
      if (!isCurrent) void act({ action: "choose-music", musicId });
      if (!audio) return;
      if (isCurrent) {
        if (audio.paused) {
          void audio.play().then(() => setPlayingMusic(true)).catch(() => setPlayingMusic(false));
        } else {
          audio.pause();
          setPlayingMusic(false);
        }
      } else {
        // src switches via the effect above; play resumes from the gesture
        setPlayingMusic(true);
        const src = postStudioMediaSrc(postId, definition?.music.find((m) => m.id === musicId)?.file ?? "");
        audio.setAttribute("data-src", src);
        audio.src = src;
        audio.load();
        void audio.play().then(() => setPlayingMusic(true)).catch(() => setPlayingMusic(false));
      }
    },
    [act, definition?.music, postId, state?.musicId],
  );

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
          {loadError === "POST_NOT_FOUND" ? "No existe el post «" + postId + "» en ~/.local/state/exohuman/post-studio." : "Error cargando el post."}
        </div>
        <button type="button" className="config-button config-button-small" onClick={() => void load()}>Reintentar</button>
      </div>
    );
  }

  const current = selection[Math.min(previewIndex, selection.length - 1)];
  const reelVideo = state.reelVideoId ? byId.get(state.reelVideoId) : null;
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

  const musicCards = definition.music.map((m) => {
    const selected = state.musicId === m.id;
    const isPlaying = selected && playingMusic;
    return (
      <div
        key={m.id}
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
          background: selected ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))" : "var(--bg-panel)",
          cursor: locked ? "default" : "pointer",
          opacity: locked ? 0.75 : 1,
        }}
        onClick={() => !locked && toggleMusic(m.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !locked) { e.preventDefault(); toggleMusic(m.id); } }}
      >
        <button
          type="button"
          aria-label={isPlaying ? "Pausar" : "Escuchar"}
          onClick={(e) => { e.stopPropagation(); if (!locked) toggleMusic(m.id); }}
          style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
            background: selected ? "var(--accent)" : "var(--bg)",
            color: selected ? "#fff" : "var(--text)",
            fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>
              <span style={{ color: "var(--accent)" }}>{m.letter}</span> · {m.label}
            </span>
            {m.recommended && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#e3b341", border: "1px solid #e3b341", borderRadius: 999, padding: "0 6px" }}>RECO</span>
            )}
            <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{m.bpm} BPM</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{m.style}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{m.why}</div>
          {selected && (
            <div style={{ marginTop: 6 }}>
              <div style={{ height: 4, borderRadius: 2, background: "var(--bg)", overflow: "hidden" }}>
                <div style={{ width: `${musicTime.d ? (musicTime.t / musicTime.d) * 100 : 0}%`, height: "100%", background: "var(--accent)" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>
                {isPlaying ? "sonando" : "en pausa"} · {fmtTime(musicTime.t)} / {fmtTime(musicTime.d)} · loop
              </div>
            </div>
          )}
        </div>
      </div>
    );
  });

  const slideSrc = (item: PostStudioMediaItem) => postStudioMediaSrc(postId, item.file);
  const showReel = state.format === "reel";

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
        <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
          {definition.account.replace("@", "")}
          <span style={{ opacity: 0.7, fontWeight: 400 }}> · La Herradura</span>
        </div>
      </div>

      {/* music badge */}
      {music && showReel && (
        <div style={{ position: "absolute", top: 44, right: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.55)", borderRadius: 999, padding: "4px 9px", color: "#fff", fontSize: 10.5, fontWeight: 600 }}>
          <span>{playingMusic ? "♫" : "♪"}</span>{music.label}
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
    return (
      <div
        key={item.id}
        style={{
          position: "relative",
          borderRadius: 10,
          overflow: "hidden",
          border: `2px solid ${picked ? "var(--accent)" : "var(--border)"}`,
          cursor: locked ? "default" : "pointer",
          opacity: locked ? 0.75 : 1,
          background: "var(--bg-panel)",
        }}
        onClick={() => {
          if (!locked) void act({ action: "toggle-media", id: item.id });
        }}
        title={item.caption}
      >
        <MediaThumb item={item} postId={postId} size={isMobile ? 84 : 96} />
        {picked && (
          <span style={{ position: "absolute", top: 4, left: 4, minWidth: 18, height: 18, borderRadius: 9, background: "var(--accent)", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
            {order + 1}
          </span>
        )}
        {item.star && <span style={{ position: "absolute", top: 4, right: 5, fontSize: 11, color: "#e3b341" }}>★</span>}
        <span
          onClick={(e) => { e.stopPropagation(); setLightbox(item); }}
          style={{ position: "absolute", bottom: 4, right: 4, width: 22, height: 22, borderRadius: 7, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-in" }}
          title="Ver en grande"
        >
          🔍
        </span>
        {item.caption && (
          <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 9.5, color: "#fff", padding: "10px 5px 3px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.caption}
          </span>
        )}
      </div>
    );
  });

  const selectionRows = selection.map((item, index) => (
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
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        opacity: locked ? 0.75 : 1,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent)", minWidth: 20, textAlign: "right" }}>{index + 1}</span>
      <MediaThumb item={item} postId={postId} size={38} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.caption || item.file}{star(item.star)}
        {item.kind === "video" && <span style={{ color: "var(--text-dim)", marginLeft: 6, fontSize: 10 }}>vídeo</span>}
      </span>
      {!locked && (
        <span style={{ display: "flex", gap: 4 }}>
          <button type="button" aria-label="Subir" disabled={index === 0 || busy} onClick={() => void act({ action: "move-media", id: item.id, direction: -1 })}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: index === 0 ? "default" : "pointer", fontSize: 12, opacity: index === 0 ? 0.4 : 1 }}>↑</button>
          <button type="button" aria-label="Bajar" disabled={index === selection.length - 1 || busy} onClick={() => void act({ action: "move-media", id: item.id, direction: 1 })}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", cursor: index === selection.length - 1 ? "default" : "pointer", fontSize: 12, opacity: index === selection.length - 1 ? 0.4 : 1 }}>↓</button>
          <button type="button" aria-label="Quitar" disabled={busy} onClick={() => void act({ action: "toggle-media", id: item.id })}
            style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>✕</button>
        </span>
      )}
    </div>
  ));

  const canDecide = Boolean(state.musicId) && selection.length > 0 && (state.format !== "reel" || Boolean(state.reelVideoId));
  const decisionSummary = `${FORMAT_LABEL[state.format ?? "carousel"]} · ${selection.length} fotos${music ? " · música " + music.letter + " (" + music.label + ")" : " · sin música"}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg)", overflow: "hidden" }}>
      <audio
        ref={audioRef}
        loop
        preload="metadata"
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          const tick = Math.floor(el.currentTime * 2);
          if (tick === lastProgressTick.current) return;
          lastProgressTick.current = tick;
          setMusicTime({ t: el.currentTime, d: el.duration || 0 });
        }}
        onPlay={() => setPlayingMusic(true)}
        onPause={() => setPlayingMusic(false)}
      />

      {/* header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>🎬</span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Post Studio · {definition.title}</h1>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>{definition.subtitle}</div>
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
      <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 20px 120px", paddingBottom: isMobile ? "calc(140px + env(safe-area-inset-bottom))" : 120 }}>
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
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>✏️ selección personalizada (no coincide con A/B/C)</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>2 · MÚSICA — PULSA PARA ESCUCHAR</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{musicCards}</div>
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>
                3 · TUS FOTOS — EN EL CARRUSEL ({selection.length}/{definition.maxSlides})
              </div>
              {selection.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 340, overflowY: "auto", padding: 2 }}>{selectionRows}</div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>Sin fotos — elige un preset o añade desde la biblioteca.</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.02em", marginBottom: 6 }}>BIBLIOTECA DEL VIAJE ({definition.media.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 84 : 96}px, 1fr))`, gap: 8 }}>{library}</div>
            </div>

            <details style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-panel)", padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12.5, color: "var(--text)" }}>Ficha del post (caption, hashtags y pendientes)</summary>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
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
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--border)", background: "var(--bg-panel)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap", zIndex: 5,
          boxShadow: "0 -6px 20px rgba(0,0,0,0.18)",
        }}
      >
        {locked && state.decidedAt ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 600 }}>
              ✅ Decisión registrada · {decidedInfo?.slides ?? selection.length} fotos{music ? " · " + music.letter + " " + music.label : ""} · alimenta OpenPost
            </span>
            <button type="button" className="config-button config-button-small config-button-secondary" disabled={busy} onClick={() => void act({ action: "reopen" })} style={{ cursor: "pointer" }}>
              Reabrir edición
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{decisionSummary}</span>
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
            {!canDecide && !busy && (
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {!state.musicId ? "elige música" : state.format === "reel" && !state.reelVideoId ? "elige vídeo del reel" : ""}
              </span>
            )}
          </>
        )}
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
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, cursor: "zoom-out", padding: 16 }}
        >
          {lightbox.kind === "video" ? (
            <video src={postStudioMediaSrc(postId, lightbox.file)} controls autoPlay playsInline style={{ maxWidth: "96%", maxHeight: "96%", borderRadius: 10 }} onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local studio asset
            <img src={postStudioMediaSrc(postId, lightbox.file)} alt={lightbox.caption} style={{ maxWidth: "96%", maxHeight: "96%", borderRadius: 10, objectFit: "contain" }} onClick={(e) => e.stopPropagation()} />
          )}
          <div style={{ position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom))", left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>
            {lightbox.caption}{star(lightbox.star)} · <span style={{ opacity: 0.6 }}>Esc para cerrar</span>
          </div>
        </div>
      )}
    </div>
  );
}
