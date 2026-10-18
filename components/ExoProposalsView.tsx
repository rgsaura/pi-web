"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExoData } from "@/hooks/useExoData";
import { decisionStateColor, formatRelativeEs, formatDateTimeEs } from "@/lib/exo-format";
import type { ExoProposal } from "@/lib/exo-types";
import { relevantProposals } from "@/lib/exo-visibility";

export interface ExoProposalsViewProps {
  onClose?: () => void;
}

type StatusFilter = "pending" | "all";

/** Why a resolve failed, as /api/exo/resolve reports it. */
interface ResolveFailure {
  kind: "changed" | "unavailable" | "invalid" | "error";
  code: string;
}

/** One recorded choice this session: enough to mark the option sent. */
interface SentReceipt {
  optionId: string;
  at: number;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

/** The single status chip's label: a picked option wins over the raw state. */
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

/** The 2-line summary under the title: the question, else the summary. */
function summaryText(proposal: ExoProposal): string {
  return (proposal.question?.trim() || proposal.summary?.trim() || "").slice(0, 400);
}

export function ExoProposalsView({ onClose }: ExoProposalsViewProps) {
  const { data, loading, error, refresh } = useExoData();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [sentReceipts, setSentReceipts] = useState<Map<string, SentReceipt>>(() => new Map());
  const [failure, setFailure] = useState<ResolveFailure | null>(null);
  const [pulse, setPulse] = useState(0);
  const [discarding, setDiscarding] = useState<boolean>(false);
  const [discardMenuOpen, setDiscardMenuOpen] = useState<boolean>(false);
  const [undoToast, setUndoToast] = useState<{ proposalId: string; title: string; timerId: NodeJS.Timeout } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState<number>(5);
  const [undoing, setUndoing] = useState<boolean>(false);
  const resolveSeqRef = useRef(0);

  const proposals = useMemo(() => data?.proposals.proposals ?? [], [data]);
  const referenceMs = useMemo(() => {
    const capturedAt = data?.proposals.capturedAt;
    if (!capturedAt) return undefined;
    const parsed = Date.parse(capturedAt);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [data]);

  // Fresh data on mount, and periodically while the view is open: the inbox
  // must show what EXO holds now, not a cache from the sidebar's button.
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
    // refresh is stable (useCallback with no deps in useExoData).
  }, [refresh]);

  const filteredList = useMemo(
    () => (statusFilter === "pending" ? relevantProposals(proposals, referenceMs) : proposals),
    [proposals, statusFilter, referenceMs],
  );
  const total = filteredList.length;

  // Keep the index inside the list as it shrinks (a resolve drops its
  // proposal from Pendientes on the next read) or grows.
  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, total - 1)));
  }, [total]);

  const currentProposal = filteredList[currentIndex];

  // A different proposal on screen resets its transient feedback.
  useEffect(() => {
    setFailure(null);
    setSending(null);
    setDiscarding(false);
    setDiscardMenuOpen(false);
  }, [currentProposal?.id]);

  const goPrev = useCallback(() => setCurrentIndex((index) => Math.max(0, index - 1)), []);
  const goNext = useCallback(() => setCurrentIndex((index) => Math.min(total - 1, index + 1)), [total]);

  // Undo timer countdown effect
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
      // Ignored
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
  }, [refresh, sending, discarding, triggerUndoToast]);
  const resolve = useCallback(async (proposal: ExoProposal, optionId: string) => {
    if (sending || discarding) return;
    const seq = ++resolveSeqRef.current;
    setSending(optionId);
    setFailure(null);
    try {
      const response = await fetch("/api/exo/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, optionId }),
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await response.json().catch(() => null);
      if (seq !== resolveSeqRef.current) return;
      if (!response.ok || !body || typeof body !== "object" || (body as { ok?: boolean }).ok !== true) {
        const reported = body && typeof body === "object" ? (body as { error?: ResolveFailure }).error : undefined;
        setFailure(reported ?? { kind: "error", code: `HTTP_${response.status}` });
        setSending(null);
        // The proposal changed under the pick: show what EXO holds now.
        if (reported?.kind === "changed" || response.status === 409) refresh();
        return;
      }
      setSentReceipts((previous) => new Map(previous).set(proposal.id, { optionId, at: Date.now() }));
      setPulse((value) => value + 1);
      setSending(null);
      triggerUndoToast(proposal.id, proposal.title);
      // Advance to next proposal if in "all" view, or if in "pending" view
      // it will automatically advance when the item drops from pending on refresh.
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

  // Keyboard: ←/→ move, A–E pick, Esc closes. Nothing while typing.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT"
          || target.isContentEditable)
      ) return;
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
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
  }, [currentProposal, currentIndex, total, goPrev, goNext, onClose, resolve, sending]);

  const pendingCount = useMemo(() => relevantProposals(proposals, referenceMs).length, [proposals, referenceMs]);
  const receipt = currentProposal ? sentReceipts.get(currentProposal.id) : undefined;
  const chip = currentProposal ? statusChip(currentProposal) : null;
  const decidedOptionId = currentProposal?.selectedOption?.optionId ?? (receipt && !currentProposal?.selectedOption ? receipt.optionId : null);

  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
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
      {/* Top bar: back, counter with arrows, filter, refresh. Nothing else. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "8px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          title="Volver al chat (Esc)"
          aria-label="Volver al chat"
          style={buttonBase}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg)", padding: 2 }}>
            {([["pending", `Pendientes${pendingCount ? ` (${pendingCount})` : ""}`], ["all", `Todas (${proposals.length})`]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setStatusFilter(value);
                  setCurrentIndex(0);
                }}
                aria-pressed={statusFilter === value}
                style={{
                  padding: "4px 10px",
                  borderRadius: 5,
                  border: "none",
                  background: statusFilter === value ? "var(--bg-selected)" : "transparent",
                  color: statusFilter === value ? "var(--accent)" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: statusFilter === value ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            title="Actualizar (se actualiza solo cada 30 s)"
            aria-label="Actualizar decisiones"
            style={{ ...buttonBase, padding: "5px 8px" }}
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

      {/* Body: one decision at a time. */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "28px clamp(14px, 4vw, 40px) 48px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid #dc2626", color: "#dc2626", fontSize: 13, textAlign: "center" }}>
              No se pudo leer EXO ({error}). Reintenta con ↻.
            </div>
          )}

          {!error && total === 0 && !loading && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                {statusFilter === "pending" ? "Bandeja vacía" : "Sin decisiones"}
              </div>
              <div style={{ fontSize: 13 }}>
                {statusFilter === "pending" ? "Nada pendiente de tu decisión." : "EXO no ha capturado decisiones."}
              </div>
            </div>
          )}

          {currentProposal && chip && (
            <article key={currentProposal.id}>
              {/* Status and Expiry */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "2px 10px",
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
                  {currentProposal.category && (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: "var(--bg-selected)",
                        color: "var(--accent)",
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {currentProposal.category}
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
                      padding: "3px 9px",
                      borderRadius: 6,
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      color: "#f59e0b",
                      fontSize: 11.5,
                      fontWeight: 500,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Caduca: {formatDateTimeEs(currentProposal.expiresAt)}</span>
                  </div>
                )}
              </div>

              {/* Title */}
              <h2 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.35, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
                {currentProposal.title}
              </h2>

              {/* Summary */}
              {summaryText(currentProposal) && (
                <p
                  style={{
                    margin: "0 0 22px",
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: "var(--text-muted)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {currentProposal.summary || currentProposal.question}
                </p>
              )}

              {/* Options: one click decides */}
              {currentProposal.options.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {currentProposal.options.map((option, index) => {
                    const letter = optionLetter(index);
                    const isDecided = decidedOptionId === option.id;
                    const isSending = sending === option.id;
                    const anySending = sending !== null;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void resolve(currentProposal, option.id)}
                        disabled={anySending || isDecided}
                        title={isDecided ? "Opción elegida" : `Elegir ${letter} (tecla ${letter.toLowerCase()})`}
                        aria-pressed={isDecided}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          width: "100%",
                          padding: "14px 16px",
                          borderRadius: 10,
                          border: `1.5px solid ${isDecided ? "#16a34a" : isSending ? "var(--accent)" : "var(--border)"}`,
                          background: isDecided ? "rgba(22,163,74,0.07)" : isSending ? "var(--bg-selected)" : "var(--bg-panel)",
                          textAlign: "left",
                          cursor: isDecided || anySending ? "default" : "pointer",
                          opacity: decidedOptionId && !isDecided ? 0.55 : 1,
                          transition: "border-color 0.12s, background 0.12s, opacity 0.12s",
                        }}
                      >
                        <span
                          style={{
                            flex: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
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
                                WebkitLineClamp: 1,
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
                        {isSending && (
                          <span style={{ flex: "none", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Enviando…</span>
                        )}
                        {isDecided && (
                          <span style={{ flex: "none", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                            {receipt?.optionId === option.id && !currentProposal.selectedOption ? "Enviada" : "Elegida"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                  Esta decisión no define opciones cerradas.
                </div>
              )}

              {/* Resolve feedback: one line, only while it matters */}
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
                <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 28 }}>
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex <= 0}
                aria-label="Anterior (flecha izquierda)"
                style={{ ...buttonBase, opacity: currentIndex <= 0 ? 0.4 : 1, cursor: currentIndex <= 0 ? "default" : "pointer" }}
              >
                ←
              </button>
              <span style={{ fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                {currentIndex + 1} / {total}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex >= total - 1}
                aria-label="Siguiente (flecha derecha)"
                style={{ ...buttonBase, opacity: currentIndex >= total - 1 ? 0.4 : 1, cursor: currentIndex >= total - 1 ? "default" : "pointer" }}
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Undo Toast Notification (5 seconds countdown) */}
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
    </div>
  );
}
