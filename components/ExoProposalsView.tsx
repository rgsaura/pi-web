"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExoData } from "@/hooks/useExoData";
import { useIsMobile } from "@/hooks/useIsMobile";
import { decisionStateColor, formatRelativeEs, formatDateTimeEs } from "@/lib/exo-format";
import type { ExoProposal } from "@/lib/exo-types";
import { relevantProposals } from "@/lib/exo-visibility";

export interface ExoProposalsViewProps {
  onOpenSession?: (sessionId: string) => void;
  /** Opens at this proposal (a decision row's deep link); consumed once found. */
  initialProposalId?: string | null;
  /** Fired once the deep link is consumed (or is not findable), to clear it. */
  onInitialProposalConsumed?: () => void;
}

type StatusFilter = "pending" | "all";
type CategoryFilter = "all" | string;
type SortOrder = "urgency" | "newest" | "oldest";

interface ResolveFailure {
  kind: "changed" | "unavailable" | "invalid" | "error";
  code: string;
}

interface SentReceipt {
  optionId: string;
  choice?: string;
  at: number;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

const CATEGORY_META: Record<string, { emoji: string; label: string }> = {
  sistema: { emoji: "⚡", label: "Sistema" },
  ocio: { emoji: "🎭", label: "Ocio" },
  trabajo: { emoji: "💼", label: "Trabajo" },
  salud: { emoji: "❤️", label: "Salud" },
  general: { emoji: "📌", label: "General" },
};

function categoryBadge(category?: string) {
  const key = (category || "general").toLowerCase();
  const meta = CATEGORY_META[key] || { emoji: "📌", label: category || "General" };
  return meta;
}

function statusChip(proposal: ExoProposal): { label: string; color: string } {
  if (proposal.discard) return { label: "Descartada", color: "#ef4444" };
  if (proposal.selectedOption) return { label: "Decidida", color: "#16a34a" };
  const label = proposal.decisionState === "open" ? "Por decidir"
    : proposal.decisionState === "accepted" ? "Aceptada"
    : proposal.decisionState === "rejected" ? "Descartada"
    : proposal.decisionState === "expired" ? "Caducada"
    : proposal.decisionState === "responded" ? "Respondida"
    : "Decisión";
  return { label, color: decisionStateColor(proposal.decisionState) };
}

function summaryText(proposal: ExoProposal): string {
  return (proposal.question?.trim() || proposal.summary?.trim() || "").slice(0, 500);
}

type SpeechRecognitionResultItem = { transcript?: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultItem>> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;


export function ExoProposalsView({ onOpenSession, initialProposalId, onInitialProposalConsumed }: ExoProposalsViewProps) {
  const { data, loading, error, refresh } = useExoData();
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("urgency");
  const [currentIndex, setCurrentIndex] = useState(0);

  const [sending, setSending] = useState<string | null>(null);
  const [sentReceipts, setSentReceipts] = useState<Map<string, SentReceipt>>(() => new Map());
  const [failure, setFailure] = useState<ResolveFailure | null>(null);
  const [pulse, setPulse] = useState(0);
  const [zoom, setZoom] = useState<{ src: string; caption: string } | null>(null);

  const [customText, setCustomText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const [discarding, setDiscarding] = useState<boolean>(false);
  const [discardMenuOpen, setDiscardMenuOpen] = useState<boolean>(false);
  const [undoToast, setUndoToast] = useState<{ proposalId: string; title: string; timerId: NodeJS.Timeout } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(5);
  const [undoing, setUndoing] = useState<boolean>(false);

  const resolveSeqRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const proposals = useMemo(() => data?.proposals.proposals ?? [], [data]);
  const referenceMs = useMemo(() => {
    const capturedAt = data?.proposals.capturedAt;
    if (!capturedAt) return undefined;
    const parsed = Date.parse(capturedAt);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [data]);

  // Dynamic available categories with counts. The count follows the active
  // status filter: on "pending" it counts only relevant (pending) proposals,
  // so a category badge never promises items the list then filters out.
  const availableCategories = useMemo(() => {
    const base = statusFilter === "pending" ? relevantProposals(proposals, referenceMs) : proposals;
    const counts = new Map<string, number>();
    for (const p of base) {
      const cat = (p.category || "general").toLowerCase();
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([cat, count]) => ({
      key: cat,
      label: CATEGORY_META[cat]?.label || cat,
      emoji: CATEGORY_META[cat]?.emoji || "📌",
      count,
    }));
  }, [proposals, statusFilter, referenceMs]);

  // The shared store polls while the tab is visible; opening the view still
  // forces one fresh read so the inbox is current the moment it is acted on.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtering & Sorting
  const filteredList = useMemo(() => {
    let list = statusFilter === "pending" ? relevantProposals(proposals, referenceMs) : [...proposals];
    
    if (categoryFilter !== "all") {
      list = list.filter((p) => (p.category || "general").toLowerCase() === categoryFilter.toLowerCase());
    }

    const now = Date.now();
    return list.sort((a, b) => {
      if (sortOrder === "urgency") {
        const aExp = a.expiresAt ? Date.parse(a.expiresAt) : Infinity;
        const bExp = b.expiresAt ? Date.parse(b.expiresAt) : Infinity;
        const aHasExp = Number.isFinite(aExp);
        const bHasExp = Number.isFinite(bExp);

        // Expiring items first, ordered by earliest expiration
        if (aHasExp && bHasExp) return aExp - bExp;
        if (aHasExp) return -1;
        if (bHasExp) return 1;

        // Fallback to newest creation
        const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bCreated - aCreated;
      }
      if (sortOrder === "newest") {
        const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bCreated - aCreated;
      }
      if (sortOrder === "oldest") {
        const aCreated = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bCreated = b.createdAt ? Date.parse(b.createdAt) : 0;
        return aCreated - bCreated;
      }
      return 0;
    });
  }, [proposals, statusFilter, categoryFilter, sortOrder, referenceMs]);

  const total = filteredList.length;

  // A decision row's deep link: land on that proposal once the data is in.
  // Under the current filter first; if the proposal hides elsewhere (a
  // resolved one under "pending"), widen to all statuses and let the same
  // effect run again on the recomputed list. Consumed exactly once, also
  // when nothing matches (the caller drops the link either way).
  useEffect(() => {
    if (!initialProposalId || loading) return;
    const index = filteredList.findIndex((p) => p.id === initialProposalId);
    if (index >= 0) {
      setCurrentIndex(index);
      onInitialProposalConsumed?.();
      return;
    }
    if (statusFilter !== "all" && proposals.some((p) => p.id === initialProposalId)) {
      setStatusFilter("all");
      return;
    }
    onInitialProposalConsumed?.();
  }, [initialProposalId, loading, filteredList, proposals, statusFilter, onInitialProposalConsumed]);

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, total - 1)));
  }, [total]);

  const currentProposal = filteredList[currentIndex];

  useEffect(() => {
    setFailure(null);
    setSending(null);
    setDiscarding(false);
    setDiscardMenuOpen(false);
    setCustomText("");
    setMicError(null);
    if (isRecording) {
      stopRecording();
    }
  }, [currentProposal?.id]);

  const goPrev = useCallback(() => setCurrentIndex((index) => Math.max(0, index - 1)), []);
  const goNext = useCallback(() => setCurrentIndex((index) => Math.min(total - 1, index + 1)), [total]);

  useEffect(() => {
    if (!undoToast) return;
    const interval = setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [undoToast]);

  const triggerUndoToast = useCallback((proposalId: string, title: string) => {
    setUndoToast((prev) => {
      if (prev?.timerId) clearTimeout(prev.timerId);
      return null;
    });
    setUndoSecondsLeft(5);
    const timerId = setTimeout(() => {
      setUndoToast(null);
    }, 5000);
    setUndoToast({ proposalId, title, timerId });
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoToast || undoing) return;
    setUndoing(true);
    if (undoToast.timerId) clearTimeout(undoToast.timerId);
    try {
      const response = await fetch("/api/exo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: undoToast.proposalId, action: "undo" }),
      });
      if (response.ok) {
        setSentReceipts((prev) => {
          const next = new Map(prev);
          next.delete(undoToast.proposalId);
          return next;
        });
        setUndoToast(null);
        refresh();
      }
    } catch {
    } finally {
      setUndoing(false);
    }
  }, [undoToast, undoing, refresh]);

  const discard = useCallback(async (proposal: ExoProposal, reason: "irrelevant" | "disliked" | "other", details?: string) => {
    if (sending || discarding) return;
    setDiscarding(true);
    setFailure(null);
    try {
      const response = await fetch("/api/exo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, action: "discard", reason, details }),
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
        const reported = body && typeof body === "object" ? (body as { error?: ResolveFailure }).error : undefined;
        setFailure(reported ?? { kind: "error", code: `HTTP_${response.status}` });
        setDiscarding(false);
        return;
      }
      setSentReceipts((previous) => new Map(previous).set(proposal.id, { optionId: "discarded", at: Date.now() }));
      setPulse((value) => value + 1);
      setDiscarding(false);
      setDiscardMenuOpen(false);
      triggerUndoToast(proposal.id, proposal.title);
      if (statusFilter === "all") {
        setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
      }
      refresh();
    } catch {
      setFailure({ kind: "unavailable", code: "EXO_DISCARD_NETWORK" });
      setDiscarding(false);
    }
  }, [refresh, sending, discarding, triggerUndoToast, statusFilter, total]);

  const resolve = useCallback(async (proposal: ExoProposal, optionId: string, textOverride?: string) => {
    if (sending || discarding) return;
    const seq = ++resolveSeqRef.current;
    setSending(optionId);
    setFailure(null);
    try {
      const payload: Record<string, unknown> = {
        proposalId: proposal.id,
        optionId,
      };
      if (textOverride && textOverride.trim()) {
        payload.text = textOverride.trim();
      }
      const response = await fetch("/api/exo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (seq !== resolveSeqRef.current) return;
      if (!response.ok || !body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
        const reported = body && typeof body === "object" ? (body as { error?: ResolveFailure }).error : undefined;
        setFailure(reported ?? { kind: "error", code: `HTTP_${response.status}` });
        setSending(null);
        if (reported?.kind === "changed" || response.status === 409) refresh();
        return;
      }
      setSentReceipts((previous) => new Map(previous).set(proposal.id, { optionId, choice: textOverride, at: Date.now() }));
      setPulse((value) => value + 1);
      setSending(null);
      setCustomText("");
      triggerUndoToast(proposal.id, proposal.title);
      if (statusFilter === "all") {
        setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
      }
      refresh();
    } catch {
      if (seq !== resolveSeqRef.current) return;
      setFailure({ kind: "unavailable", code: "EXO_RESOLVE_NETWORK" });
      setSending(null);
    }
  }, [refresh, sending, discarding, triggerUndoToast, statusFilter, total]);

  // Voice recording & transcription
  const startRecording = useCallback(async () => {
    setMicError(null);
    audioChunksRef.current = [];

    // Fallback: Web Speech API if supported for live dictation
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SpeechRecognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = "es-ES";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript ?? "";
          }
          if (transcript.trim()) {
            setCustomText(transcript);
          }
        };
        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      } catch {}
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        if (audioBlob.size > 2000) {
          setIsTranscribing(true);
          try {
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");
            const res = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            });
            const json = await res.json();
            if (json.ok && json.text && json.text.trim()) {
              setCustomText((prev) => (prev ? `${prev} ${json.text.trim()}` : json.text.trim()));
            }
          } catch (err: unknown) {
            setMicError("Fallo al transcribir el audio.");
          } finally {
            setIsTranscribing(false);
          }
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err: unknown) {
      setMicError("No se pudo acceder al micrófono.");
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecording(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"
          || target.isContentEditable)
      ) return;
      if (event.key === "Escape" && zoom) {
        event.preventDefault();
        setZoom(null);
        return;
      }
      if (!currentProposal) return;
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight" && currentIndex < total - 1) {
        event.preventDefault();
        goNext();
      } else if (/^[a-e1-5]$/i.test(event.key) && !sending && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const index = /[a-e]/i.test(event.key) ? event.key.toLowerCase().charCodeAt(0) - 97 : Number(event.key) - 1;
        const option = currentProposal.options[index];
        if (option) {
          event.preventDefault();
          void resolve(currentProposal, option.id);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentProposal, currentIndex, total, goPrev, goNext, resolve, sending, zoom]);

  const pendingCount = useMemo(() => relevantProposals(proposals, referenceMs).length, [proposals, referenceMs]);
  const receipt = currentProposal ? sentReceipts.get(currentProposal.id) : undefined;
  const chip = currentProposal ? statusChip(currentProposal) : null;
  const decidedOptionId = currentProposal?.selectedOption?.optionId ?? (receipt && !currentProposal?.selectedOption ? receipt.optionId : null);
  const catMeta = currentProposal ? categoryBadge(currentProposal.category) : null;

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    minHeight: 36,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
    transition: "background 0.12s, border-color 0.12s, color 0.12s",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        {/* On phones the row wraps (filters / order) instead of overflowing
            the viewport: each control keeps its size and the bar simply
            grows taller. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", rowGap: 8 }}>
          {/* Pending vs All switch */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", padding: 2 }}>
              {([["pending", `🎯 Pendientes${pendingCount ? ` (${pendingCount})` : ""}`], ["all", `📋 Todas (${proposals.length})`]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(value);
                    setCurrentIndex(0);
                  }}
                  aria-pressed={statusFilter === value}
                  style={{
                    padding: isMobile ? "9px 12px" : "5px 12px",
                    minHeight: isMobile ? 40 : undefined,
                    borderRadius: 6,
                    border: "none",
                    background: statusFilter === value ? "var(--bg-selected)" : "transparent",
                    color: statusFilter === value ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 12.5,
                    fontWeight: statusFilter === value ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sort order selector */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as SortOrder);
                  setCurrentIndex(0);
                }}
                style={{
                  ...buttonBase,
                  padding: isMobile ? "9px 10px" : "5px 10px",
                  minHeight: isMobile ? 40 : undefined,
                  fontSize: 12,
                  outline: "none",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
                title="Criterio de ordenación"
              >
                <option value="urgency">⏰ Por urgencia / caducidad</option>
                <option value="newest">⚡ Más recientes</option>
                <option value="oldest">⌛ Más antiguas</option>
              </select>
            </div>

            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              title="Actualizar decisiones"
              aria-label="Actualizar decisiones"
              style={{ ...buttonBase, padding: "6px 8px" }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ animation: loading ? "spin 1s linear infinite" : undefined }}
              >
                <path d="M21 12a9 9 0 1 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Category Pills Strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 500, marginRight: 2, flexShrink: 0 }}>
            Categoría:
          </span>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("all");
              setCurrentIndex(0);
            }}
            title={statusFilter === "pending" ? "Decisiones pendientes de todas las categorías" : "Todas las decisiones históricas"}
            style={{
              padding: "3px 10px",
              minHeight: isMobile ? 36 : undefined,
              borderRadius: 20,
              fontSize: 11.5,
              fontWeight: categoryFilter === "all" ? 600 : 400,
              border: `1px solid ${categoryFilter === "all" ? "var(--accent)" : "var(--border)"}`,
              background: categoryFilter === "all" ? "var(--bg-selected)" : "var(--bg)",
              color: categoryFilter === "all" ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Todas ({statusFilter === "pending" ? pendingCount : proposals.length})
          </button>
          {availableCategories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setCategoryFilter(c.key);
                setCurrentIndex(0);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 10px",
                minHeight: isMobile ? 36 : undefined,
                borderRadius: 20,
                fontSize: 11.5,
                fontWeight: categoryFilter === c.key ? 600 : 400,
                border: `1px solid ${categoryFilter === c.key ? "var(--accent)" : "var(--border)"}`,
                background: categoryFilter === c.key ? "var(--bg-selected)" : "var(--bg)",
                color: categoryFilter === c.key ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <span>{c.emoji}</span>
              <span>{c.label} ({c.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "24px clamp(14px, 4vw, 40px) 48px" }}>
        <div style={{ maxWidth: 660, margin: "0 auto" }}>
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid #dc2626", color: "#dc2626", fontSize: 13, textAlign: "center" }}>
              No se pudo leer EXO ({error}). Reintenta con ↻.
            </div>
          )}

          {!error && total === 0 && !loading && (
            <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                {statusFilter === "pending" ? "Bandeja al día" : "Sin decisiones"}
              </div>
              <div style={{ fontSize: 13 }}>
                {statusFilter === "pending"
                  ? (categoryFilter !== "all" ? `No hay decisiones pendientes en ${categoryBadge(categoryFilter).label}.` : "No hay ninguna decisión pendiente en este momento.")
                  : "No hay registros de decisiones en esta categoría."}
              </div>
            </div>
          )}

          {currentProposal && chip && (
            <article key={currentProposal.id}>
              {/* Header tags: Status, Category, Origin session link, Expiration */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "3px 10px",
                      borderRadius: 999,
                      border: `1px solid ${chip.color}`,
                      color: chip.color,
                      fontSize: 11.5,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: chip.color }} />
                    {chip.label}
                  </span>

                  {catMeta && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 9px",
                        borderRadius: 6,
                        background: "var(--bg-selected)",
                        color: "var(--accent)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}
                    >
                      <span>{catMeta.emoji}</span>
                      <span>{catMeta.label}</span>
                    </span>
                  )}

                  {currentProposal.updatedAt && (
                    <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {formatRelativeEs(currentProposal.updatedAt)}
                    </span>
                  )}
                </div>

                {/* Expiry Pill */}
                {currentProposal.expiresAt && (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 10px",
                      borderRadius: 6,
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      color: "#f59e0b",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Caduca: {formatDateTimeEs(currentProposal.expiresAt)}</span>
                  </div>
                )}
              </div>

              {/* Title */}
              <h2 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35, margin: "0 0 10px", letterSpacing: "-0.01em" }}>
                {currentProposal.title}
              </h2>

              {/* Trazabilidad: Origen / Sesión vinculada */}
              {currentProposal.source && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>Origen:</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: "var(--bg-panel)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                    }}
                  >
                    {currentProposal.source}
                  </span>
                  {currentProposal.sourceSessionId ? (
                    <a
                      href={`/?session=${currentProposal.sourceSessionId}`}
                      onClick={(e) => {
                        if (onOpenSession && currentProposal.sourceSessionId) {
                          e.preventDefault();
                          onOpenSession(currentProposal.sourceSessionId);
                        }
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontWeight: 600,
                      }}
                      title="Ver sesión donde se originó esta propuesta"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                      Ver sesión en vivo
                    </a>
                  ) : null}
                  {(currentProposal.links ?? []).length > 0 && (() => {
                    const chips = (currentProposal.links ?? [])
                      .map((raw): { url: string; label: string } | null => {
                        if (typeof raw === "string") {
                          if (!raw) return null;
                          try {
                            return { url: raw, label: new URL(raw).hostname.replace(/^www\./, "") };
                          } catch {
                            return { url: raw, label: raw.slice(0, 30) };
                          }
                        }
                        if (raw && typeof raw === "object") {
                          const obj = raw as { url?: unknown; label?: unknown };
                          const url = typeof obj.url === "string" ? obj.url : "";
                          if (!url) return null;
                          let label = typeof obj.label === "string" && obj.label.trim() ? obj.label.slice(0, 40) : "";
                          if (!label) {
                            try { label = new URL(url).hostname.replace(/^www\./, ""); } catch { label = url.slice(0, 30); }
                          }
                          return { url, label };
                        }
                        return null;
                      })
                      .filter((chip): chip is { url: string; label: string } => chip !== null);
                    if (chips.length === 0) return null;
                    return (
                    <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {chips.map((chip) => (
                        <a
                          key={chip.url}
                          href={chip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            color: "var(--accent)",
                            textDecoration: "none",
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "2px 8px",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            background: "var(--bg-panel)",
                            maxWidth: "100%",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={chip.url}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          {chip.label}
                        </a>
                      ))}
                    </div>
                    );
                  })()}
                </div>
              )}

              {/* Summary */}
              {summaryText(currentProposal) && (
                <div
                  style={{
                    margin: "0 0 22px",
                    padding: "14px 16px",
                    borderRadius: 10,
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: "var(--text-muted)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {currentProposal.summary || currentProposal.question}
                </div>
              )}

              {/* Predefined Options List */}
              {currentProposal.options.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                    Opciones propuestas:
                  </div>
                  {currentProposal.options.map((option, index) => {
                    const letter = optionLetter(index);
                    const isDecided = decidedOptionId === option.id;
                    const isSending = sending === option.id;
                    const anySending = sending !== null;
                    const stateSpans = (
                      <>
                        {isSending && (
                          <span style={{ flex: "none", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Enviando…</span>
                        )}
                        {isDecided && (
                          <span style={{ flex: "none", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                            {receipt?.optionId === option.id && !currentProposal.selectedOption ? "Enviada" : "Elegida"}
                          </span>
                        )}
                      </>
                    );
                    const sharedCard: React.CSSProperties = {
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: `1.5px solid ${isDecided ? "#16a34a" : isSending ? "var(--accent)" : "var(--border)"}`,
                      background: isDecided ? "rgba(22,163,74,0.07)" : isSending ? "var(--bg-selected)" : "var(--bg-panel)",
                      textAlign: "left",
                      cursor: isDecided || anySending ? "default" : "pointer",
                      opacity: decidedOptionId && !isDecided ? 0.55 : 1,
                      transition: "border-color 0.12s, background 0.12s, opacity 0.12s",
                    };
                    const choose = () => void resolve(currentProposal, option.id);

                    // Visual option: image banner + text row, with a zoom peek.
                    if (option.image) {
                      return (
                        <div
                          key={option.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isDecided}
                          aria-label={`${isDecided ? "Opción elegida" : `Elegir ${letter}`}: ${option.label}`}
                          onClick={() => {
                            if (!anySending && !isDecided) choose();
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === "Enter" || event.key === " ") && !anySending && !isDecided) {
                              event.preventDefault();
                              choose();
                            }
                          }}
                          title={isDecided ? "Opción elegida" : `Elegir ${letter} (tecla ${letter.toLowerCase()})`}
                          style={{ ...sharedCard, display: "flex", flexDirection: "column", gap: 10, padding: 10 }}
                        >
                          <span style={{ position: "relative", display: "block", width: "100%" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={option.image}
                              alt={`Vista previa: ${option.label}`}
                              loading="lazy"
                              onClick={(event) => {
                                event.stopPropagation();
                                setZoom({ src: option.image!, caption: option.label });
                              }}
                              style={{
                                display: "block",
                                width: "100%",
                                aspectRatio: "16 / 9",
                                maxHeight: 240,
                                objectFit: "cover",
                                borderRadius: 8,
                                background: "var(--bg)",
                                cursor: "zoom-in",
                              }}
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setZoom({ src: option.image!, caption: option.label });
                              }}
                              title="Ampliar imagen"
                              aria-label={`Ampliar imagen de ${option.label}`}
                              style={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                border: "1px solid rgba(255,255,255,0.25)",
                                background: "rgba(15,23,42,0.72)",
                                color: "#f8fafc",
                                cursor: "zoom-in",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                <line x1="11" y1="8" x2="11" y2="14" />
                                <line x1="8" y1="11" x2="14" y2="11" />
                              </svg>
                            </button>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                            <span
                              style={{
                                flex: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: isDecided ? "#16a34a" : "var(--bg-selected)",
                                color: isDecided ? "#fff" : "var(--accent)",
                                fontSize: 14,
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {isDecided ? "✓" : letter}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, lineHeight: 1.4 }}>
                                {option.label || letter}
                              </span>
                              {option.description && (
                                <span
                                  style={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    fontSize: 12.5,
                                    lineHeight: 1.45,
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  {option.description}
                                </span>
                              )}
                            </span>
                            {stateSpans}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void resolve(currentProposal, option.id)}
                        disabled={anySending || isDecided}
                        title={isDecided ? "Opción elegida" : `Elegir ${letter} (tecla ${letter.toLowerCase()})`}
                        aria-pressed={isDecided}
                        style={{
                          ...sharedCard,
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                        }}
                      >
                        <span
                          style={{
                            flex: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: isDecided ? "#16a34a" : "var(--bg-selected)",
                            color: isDecided ? "#fff" : "var(--accent)",
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {isDecided ? "✓" : letter}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, lineHeight: 1.4 }}>
                            {option.label || letter}
                          </span>
                          {option.description && (
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                fontSize: 12.5,
                                lineHeight: 1.45,
                                color: "var(--text-muted)",
                              }}
                            >
                              {option.description}
                            </span>
                          )}
                        </span>
                        {stateSpans}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Free Text / Voice Note Response Box */}
              {!currentProposal.discard && !decidedOptionId && (
                <div
                  style={{
                    marginTop: 20,
                    padding: "16px",
                    borderRadius: 12,
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 15 }}>💬</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                        Respuesta personalizada (texto libre o nota de voz):
                      </span>
                    </div>

                    {/* Microphone record button */}
                    <button
                      type="button"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isTranscribing || sending !== null}
                      style={{
                        ...buttonBase,
                        padding: "5px 12px",
                        borderRadius: 20,
                        background: isRecording ? "#ef4444" : "var(--bg)",
                        color: isRecording ? "#ffffff" : "var(--text)",
                        borderColor: isRecording ? "#dc2626" : "var(--border)",
                        boxShadow: isRecording ? "0 0 10px rgba(239, 68, 68, 0.4)" : "none",
                      }}
                      title={isRecording ? "Detener grabación y transcribir" : "Dictar respuesta por voz"}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: isRecording ? "#ffffff" : "#ef4444",
                          animation: isRecording ? "pulse 1.2s infinite" : undefined,
                        }}
                      />
                      <span>{isRecording ? `Grabando (${recordingSeconds}s)…` : "Dictar audio"}</span>
                    </button>
                  </div>

                  {micError && (
                    <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>
                      ⚠️ {micError}
                    </div>
                  )}

                  {isTranscribing && (
                    <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M21 12a9 9 0 1 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      </svg>
                      Transcribiendo nota de voz con Whisper…
                    </div>
                  )}

                  <div style={{ position: "relative" }}>
                    <textarea
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder="Escribe tu criterio, matiz o respuesta alternativa, o usa el micrófono para dictar…"
                      rows={3}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "var(--bg)",
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        resize: "vertical",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => void resolve(currentProposal, "custom", customText)}
                      disabled={!customText.trim() || sending !== null || isTranscribing}
                      style={{
                        ...buttonBase,
                        background: "var(--accent)",
                        color: "#ffffff",
                        borderColor: "var(--accent)",
                        fontWeight: 600,
                        opacity: !customText.trim() || sending !== null ? 0.5 : 1,
                        cursor: !customText.trim() || sending !== null ? "default" : "pointer",
                      }}
                    >
                      {sending === "custom" ? "Enviando respuesta…" : "Enviar respuesta"}
                    </button>
                  </div>
                </div>
              )}

              {/* Resolve feedback */}
              {receipt && !failure && !currentProposal.selectedOption && sending === null && !discarding && (
                <div key={pulse} style={{ marginTop: 14, fontSize: 13, color: receipt.optionId === "discarded" ? "#ef4444" : "#16a34a", fontWeight: 600 }}>
                  {receipt.optionId === "discarded" ? "✓ Decisión descartada y criterio guardado para aprendizaje" : "✓ Decisión registrada en EXO"}
                </div>
              )}
              {currentProposal.discard && (
                <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", fontSize: 12.5, color: "var(--text-muted)" }}>
                  <span style={{ fontWeight: 600, color: "#ef4444" }}>Descartada:</span> motivo {currentProposal.discard.reason === "irrelevant" ? "irrelevante" : currentProposal.discard.reason === "disliked" ? "no me ha gustado" : currentProposal.discard.reason}
                  {currentProposal.discard.details ? ` (${currentProposal.discard.details})` : ""}
                </div>
              )}
              {failure && (
                <div style={{ marginTop: 14, fontSize: 13, color: failure.kind === "changed" ? "var(--accent)" : "#dc2626" }}>
                  {failure.kind === "changed"
                    ? "La decisión cambió en origen: opciones recargadas, revisa y elige de nuevo."
                    : `No se pudo registrar (${failure.code}). Reintenta.`}
                </div>
              )}

              {/* Botón de Descartar con Aprendizaje */}
              {!currentProposal.discard && !decidedOptionId && (
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                  {!discardMenuOpen ? (
                    <button
                      type="button"
                      onClick={() => setDiscardMenuOpen(true)}
                      disabled={sending !== null || discarding}
                      title="Descartar esta decisión y registrar feedback de aprendizaje"
                      style={{
                        ...buttonBase,
                        alignSelf: "flex-start",
                        color: "#ef4444",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                        background: "rgba(239, 68, 68, 0.04)",
                        fontSize: 12,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      Descartar decisión…
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 8, background: "var(--bg-panel)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>¿Por qué descartas esta decisión? (Aprendizaje del sistema):</span>
                        <button
                          type="button"
                          onClick={() => setDiscardMenuOpen(false)}
                          style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, padding: "2px 4px" }}
                        >
                          ✕
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => void discard(currentProposal, "irrelevant")}
                          disabled={discarding}
                          style={{
                            ...buttonBase,
                            background: "rgba(239, 68, 68, 0.08)",
                            borderColor: "rgba(239, 68, 68, 0.4)",
                            color: "#ef4444",
                            fontSize: 12,
                          }}
                        >
                          Irrelevante / No aplica
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(currentProposal, "disliked")}
                          disabled={discarding}
                          style={{
                            ...buttonBase,
                            background: "rgba(239, 68, 68, 0.08)",
                            borderColor: "rgba(239, 68, 68, 0.4)",
                            color: "#ef4444",
                            fontSize: 12,
                          }}
                        >
                          No me gusta el enfoque
                        </button>
                        <button
                          type="button"
                          onClick={() => void discard(currentProposal, "other", "Descartada por el usuario")}
                          disabled={discarding}
                          style={{
                            ...buttonBase,
                            fontSize: 12,
                          }}
                        >
                          Otro motivo
                        </button>
                      </div>
                      {discarding && (
                        <div style={{ fontSize: 11.5, color: "var(--accent)", marginTop: 2 }}>
                          Registrando descarte y aprendiendo criterio…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </article>
          )}

          {/* Minimal pager */}
          {total > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex <= 0}
                aria-label="Anterior (flecha izquierda)"
                style={{ ...buttonBase, opacity: currentIndex <= 0 ? 0.4 : 1, cursor: currentIndex <= 0 ? "default" : "pointer" }}
              >
                ← Anterior
              </button>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                Decisión {currentIndex + 1} de {total}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex >= total - 1}
                aria-label="Siguiente (flecha derecha)"
                style={{ ...buttonBase, opacity: currentIndex >= total - 1 ? 0.4 : 1, cursor: currentIndex >= total - 1 ? "default" : "pointer" }}
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Undo Toast Notification */}
      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e293b",
            color: "#f8fafc",
            padding: "10px 18px",
            borderRadius: 10,
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            zIndex: 9999,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            maxWidth: "calc(100vw - 32px)",
            animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#22c55e", fontSize: 15 }}>✓</span>
            Respuesta enviada ({undoSecondsLeft}s)
          </span>
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoing}
            style={{
              background: "#3b82f6",
              color: "#ffffff",
              border: "none",
              padding: "5px 12px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            {undoing ? "Deshaciendo…" : "Deshacer"}
          </button>
        </div>
      )}
      {/* Image lightbox: one tap on an option image shows it full-screen */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Ampliación: ${zoom.caption}`}
          onClick={() => setZoom(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            background: "rgba(2, 6, 23, 0.9)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: "clamp(12px, 4vw, 40px)",
            cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoom.src}
            alt={zoom.caption}
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "82vh",
              objectFit: "contain",
              borderRadius: 10,
              boxShadow: "0 24px 60px -12px rgba(0,0,0,0.6)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "default" }}>
            <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, textAlign: "center", maxWidth: "78vw" }}>
              {zoom.caption}
            </span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setZoom(null);
              }}
              title="Cerrar (Esc)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(15,23,42,0.8)",
                color: "#f8fafc",
                cursor: "pointer",
                fontSize: 15,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
