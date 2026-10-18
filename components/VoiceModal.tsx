"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";

interface Turn {
  id: string;
  kind: "user" | "rot" | "tool" | "error";
  text: string;
}

export function VoiceModal({ isOpen, onClose }: VoiceModalProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [statusText, setStatusText] = useState("Toca el círculo para conectar");
  const [connState, setConnState] = useState<"idle" | "live" | "error">("idle");
  const [connLabel, setConnLabel] = useState("sin conexión");
  const [isPttMode, setIsPttMode] = useState(true);
  const [isTalking, setIsTalking] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [rotPending, setRotPending] = useState("");
  const [latency, setLatency] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const speechStoppedAtRef = useRef<number>(0);
  const latencyShownRef = useRef<boolean>(false);
  const rotBufferRef = useRef<string>("");
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const cleanup = useCallback(() => {
    try {
      dcRef.current?.close();
    } catch {}
    try {
      pcRef.current?.close();
    } catch {}
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}

    dcRef.current = null;
    pcRef.current = null;
    micStreamRef.current = null;
    micTrackRef.current = null;

    try {
      wakeLockRef.current?.release();
    } catch {}
    wakeLockRef.current = null;
  }, []);

  const addTurn = useCallback((kind: Turn["kind"], text: string) => {
    if (!text.trim()) return;
    setTurns((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, text }]);
  }, []);

  // Send event through WebRTC DataChannel
  const sendEvent = useCallback((obj: unknown) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(obj));
    }
  }, []);

  // Handle function calling from Realtime
  const handleToolCall = useCallback(async (ev: { name: string; arguments: string; call_id: string }) => {
    const { name, arguments: rawArgs, call_id } = ev;
    addTurn("tool", `⚙ ${name}`);
    let output: string;
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(rawArgs || "{}");
      } catch {}

      const res = await fetch("/api/voice/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, arguments: parsedArgs }),
      });
      output = await res.text();
    } catch (err: unknown) {
      output = JSON.stringify({ ok: false, error: String(err instanceof Error ? err.message : err) });
    }

    sendEvent({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id, output },
    });
    sendEvent({ type: "response.create" });
  }, [addTurn, sendEvent]);

  // Handle incoming realtime events
  const handleEvent = useCallback((ev: { type: string; [key: string]: unknown }) => {
    switch (ev.type) {
      case "session.created":
        break;

      case "input_audio_buffer.speech_started":
        speechStoppedAtRef.current = 0;
        latencyShownRef.current = false;
        setVoiceState("listening");
        setStatusText("Te escucho…");
        break;

      case "input_audio_buffer.speech_stopped":
        speechStoppedAtRef.current = performance.now();
        setVoiceState("connecting");
        setStatusText("Pensando…");
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (typeof ev.transcript === "string" && ev.transcript.trim()) {
          addTurn("user", ev.transcript.trim());
        }
        break;

      case "response.created":
        if (!speechStoppedAtRef.current) speechStoppedAtRef.current = performance.now();
        setVoiceState("connecting");
        setStatusText("Pensando…");
        break;

      case "output_audio_buffer.started":
      case "response.output_audio.delta":
        if (speechStoppedAtRef.current && !latencyShownRef.current) {
          const ms = Math.round(performance.now() - speechStoppedAtRef.current);
          setLatency(ms);
          latencyShownRef.current = true;
        }
        setVoiceState("speaking");
        setStatusText("ROT habla…");
        break;

      case "response.output_audio_transcription.delta":
      case "response.audio_transcription.delta":
        if (typeof ev.delta === "string" && ev.delta) {
          rotBufferRef.current += ev.delta;
          setRotPending(rotBufferRef.current);
        }
        break;

      case "response.output_audio_transcription.done":
      case "response.audio_transcription.done": {
        const transcript = typeof ev.transcript === "string" ? ev.transcript : "";
        if (rotBufferRef.current.trim() || transcript.trim()) {
          const finalTxt = transcript.trim() || rotBufferRef.current.trim();
          addTurn("rot", finalTxt);
          rotBufferRef.current = "";
          setRotPending("");
        }
        break;
      }

      case "response.function_call_arguments.done":
        handleToolCall(ev as unknown as { name: string; arguments: string; call_id: string });
        break;

      case "response.done":
        setVoiceState((prev) => (prev === "speaking" ? prev : "listening"));
        if (!isPttMode) setStatusText("Te escucho…");
        break;

      case "error":
        setVoiceState("error");
        setStatusText("Error en la conexión");
        addTurn("error", typeof ev.error === "object" && ev.error && "message" in ev.error ? String((ev.error as { message?: unknown }).message) : "Error de audio en tiempo real");
        break;

      default:
        break;
    }
  }, [addTurn, handleToolCall, isPttMode]);

  // Connect WebRTC session
  const startSession = useCallback(async () => {
    cleanup();
    setVoiceState("connecting");
    setStatusText("Conectando con ROT…");
    setConnState("idle");
    setConnLabel("conectando…");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const track = stream.getTracks()[0];
      micTrackRef.current = track;

      if (isPttMode && track) {
        track.enabled = false;
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      if (!audioElRef.current) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        // @ts-expect-error playsInline attribute
        audio.playsInline = true;
        audioElRef.current = audio;
      }

      pc.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
          audioElRef.current.play().catch(() => {
            setStatusText("Toca para escuchar a ROT");
          });
        }
      };

      pc.addTrack(track, stream);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {}
      };
      dc.onclose = () => {
        setConnState("idle");
        setConnLabel("canal cerrado");
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          setConnState("live");
          setConnLabel("en vivo");
          if (isPttMode) {
            setVoiceState("idle");
            setStatusText("Mantén pulsado para hablar");
          } else {
            setVoiceState("listening");
            setStatusText("Te escucho…");
          }
        } else if (s === "failed" || s === "disconnected" || s === "closed") {
          setConnState("idle");
          setConnLabel("sin conexión");
          setVoiceState("idle");
          setStatusText("Desconectado");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const r = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });

      if (!r.ok) {
        const detail = await r.text();
        throw new Error(`Servidor de voz: ${r.status} ${detail.slice(0, 100)}`);
      }

      const answer = await r.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });

      if ("wakeLock" in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch {}
      }
    } catch (err: unknown) {
      cleanup();
      setVoiceState("error");
      const msg = err instanceof Error ? err.message : String(err);
      setStatusText("Error al iniciar micrófono");
      addTurn("error", msg);
    }
  }, [cleanup, handleEvent, isPttMode, addTurn]);

  const stopSession = useCallback(() => {
    cleanup();
    setVoiceState("idle");
    setStatusText("Toca el círculo para conectar");
    setConnState("idle");
    setConnLabel("sin conexión");
    setLatency(null);
  }, [cleanup]);

  // Push to talk listeners
  const handlePttDown = useCallback((e: React.SyntheticEvent) => {
    if (!pcRef.current || !micTrackRef.current || !isPttMode) return;
    if (e.cancelable) e.preventDefault();
    micTrackRef.current.enabled = true;
    setIsTalking(true);
    setVoiceState("listening");
    setStatusText("Escuchando... Suelta para enviar");
  }, [isPttMode]);

  const handlePttUp = useCallback((e: React.SyntheticEvent) => {
    if (!pcRef.current || !micTrackRef.current || !isPttMode || !isTalking) return;
    if (e.cancelable) e.preventDefault();
    micTrackRef.current.enabled = false;
    setIsTalking(false);
    setVoiceState("connecting");
    setStatusText("Pensando respuesta…");
    sendEvent({ type: "input_audio_buffer.commit" });
  }, [isPttMode, isTalking, sendEvent]);

  // Auto-scroll chat log
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [turns, rotPending]);

  // Clean on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopSession();
    }
  }, [isOpen, stopSession]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hablar por voz con ROT"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(11, 15, 20, 0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom))",
        color: "#e6edf3",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connState === "live" ? "#10b981" : "#6b7280",
              boxShadow: connState === "live" ? "0 0 8px #10b981" : "none",
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.2px" }}>
            ROT <span style={{ opacity: 0.5 }}>· Voz en vivo</span>
          </span>
          {latency !== null && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.08)",
                color: "#9ca3af",
              }}
            >
              {latency} ms
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal de voz"
          style={{
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#e6edf3",
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Main Voice Orb Stage */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          margin: "auto 0",
        }}
      >
        {/* Animated Orb Button */}
        <div style={{ position: "relative", width: 140, height: 140, display: "grid", placeItems: "center" }}>
          {/* Pulsing rings */}
          {voiceState === "speaking" && (
            <div
              style={{
                position: "absolute",
                inset: -12,
                borderRadius: "50%",
                border: "2px solid rgba(52, 211, 153, 0.4)",
                animation: "pulse 1.4s ease-out infinite",
              }}
            />
          )}
          {voiceState === "listening" && (
            <div
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                border: "2px solid rgba(56, 189, 248, 0.4)",
                animation: "pulse 1.2s ease-out infinite",
              }}
            />
          )}

          <button
            type="button"
            onClick={connState === "live" ? stopSession : startSession}
            aria-label={connState === "live" ? "Colgar" : "Conectar llamada de voz"}
            style={{
              width: 104,
              height: 104,
              borderRadius: "50%",
              border: "none",
              cursor: "pointer",
              background:
                voiceState === "speaking"
                  ? "#34d399"
                  : voiceState === "listening"
                  ? "#38bdf8"
                  : voiceState === "error"
                  ? "#ef4444"
                  : connState === "live"
                  ? "#10b981"
                  : "#1f2937",
              color: connState === "live" ? "#0b0f14" : "#e6edf3",
              display: "grid",
              placeItems: "center",
              boxShadow:
                connState === "live"
                  ? "0 0 24px rgba(52, 211, 153, 0.35)"
                  : "0 4px 16px rgba(0, 0, 0, 0.4)",
              transition: "transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {connState === "live" ? (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" />
              </svg>
            ) : (
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            )}
          </button>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#f3f4f6" }}>{statusText}</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{connLabel}</div>
        </div>

        {/* PTT Controls */}
        {connState === "live" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%", maxWidth: 300 }}>
            {isPttMode && (
              <button
                type="button"
                onMouseDown={handlePttDown}
                onMouseUp={handlePttUp}
                onTouchStart={handlePttDown}
                onTouchEnd={handlePttUp}
                onTouchCancel={handlePttUp}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: 12,
                  border: isTalking ? "2px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.15)",
                  background: isTalking ? "rgba(56, 189, 248, 0.2)" : "rgba(255, 255, 255, 0.06)",
                  color: "#f3f4f6",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  userSelect: "none",
                  touchAction: "none",
                  transition: "all 0.12s ease",
                }}
              >
                <span>🎙️</span>
                <span>{isTalking ? "¡Te escucho! Suelta al terminar" : "Mantén pulsado para hablar"}</span>
              </button>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isPttMode}
                onChange={(e) => {
                  const val = e.target.checked;
                  setIsPttMode(val);
                  if (micTrackRef.current) {
                    micTrackRef.current.enabled = !val;
                  }
                  if (!val) {
                    setVoiceState("listening");
                    setStatusText("Te escucho continuo…");
                  } else {
                    setVoiceState("idle");
                    setStatusText("Mantén pulsado para hablar");
                  }
                }}
              />
              <span>Modo Pulsar para Hablar (PTT)</span>
            </label>
          </div>
        )}
      </div>

      {/* Transcript Log Container */}
      <div
        ref={logContainerRef}
        style={{
          width: "100%",
          maxWidth: 480,
          height: 160,
          background: "rgba(0, 0, 0, 0.35)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 12,
          padding: "10px 14px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        {turns.length === 0 && !rotPending && (
          <div style={{ margin: "auto", color: "#6b7280", fontSize: 12 }}>
            La conversación en vivo aparecerá aquí.
          </div>
        )}

        {turns.map((t) => (
          <div
            key={t.id}
            style={{
              alignSelf: t.kind === "user" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              padding: t.kind === "tool" ? "2px 6px" : "6px 10px",
              borderRadius: 8,
              background:
                t.kind === "user"
                  ? "rgba(56, 189, 248, 0.18)"
                  : t.kind === "tool"
                  ? "rgba(255, 255, 255, 0.05)"
                  : t.kind === "error"
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(255, 255, 255, 0.08)",
              color:
                t.kind === "user"
                  ? "#bae6fd"
                  : t.kind === "tool"
                  ? "#9ca3af"
                  : t.kind === "error"
                  ? "#fca5a5"
                  : "#e6edf3",
              fontSize: t.kind === "tool" ? 11 : 13,
              fontFamily: t.kind === "tool" ? "var(--font-mono, monospace)" : "inherit",
            }}
          >
            {t.text}
          </div>
        ))}

        {rotPending && (
          <div
            style={{
              alignSelf: "flex-start",
              maxWidth: "88%",
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(255, 255, 255, 0.08)",
              color: "#e6edf3",
              fontSize: 13,
            }}
          >
            {rotPending}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginTop: 6 }}>
        WebRTC OpenAI Realtime · Conexión directa y fluida con ROT
      </div>
    </div>
  );
}
