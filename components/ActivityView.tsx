"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatCountdownEs,
  type ActivitySnapshot,
} from "@/lib/activity-data";

export interface ActivityViewProps {
  onClose?: () => void;
  onSelectSession?: (sessionId: string) => void;
}

const REFRESH_MS = 10_000;

const CHANNEL_DOT: Record<string, { color: string; label: string }> = {
  active: { color: "#16a34a", label: "activo" },
  inactive: { color: "#dc2626", label: "parado" },
  failed: { color: "#dc2626", label: "fallido" },
  unknown: { color: "var(--text-dim)", label: "?" },
};

/** A CPU bar like the TUI's blocks: ~10 cells, one per 10% (at least one). */
function cpuCells(cpuText: string): { filled: number; total: number } {
  const cpu = Number.parseFloat(cpuText.replace(",", "."));
  const total = 10;
  const filled = Number.isFinite(cpu) ? Math.min(total, Math.max(1, Math.round(cpu / 10) + 1)) : 1;
  return { filled, total };
}

export function ActivityView({ onClose, onSelectSession }: ActivityViewProps) {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [governorMode, setGovernorMode] = useState<string>("turbo");
  const [togglingUnit, setTogglingUnit] = useState<string | null>(null);

  const handleToggleTimer = async (unit: string, currentEnabled: boolean) => {
    setTogglingUnit(unit);
    try {
      await fetch("/api/system-map/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle-timer", unit, enable: !currentEnabled }),
      });
      load();
    } catch {}
    finally {
      setTogglingUnit(null);
    }
  };

  const handleSetGovernorMode = async (mode: "turbo" | "normal" | "eco", temporary = false) => {
    setGovernorMode(mode);
    try {
      await fetch("/api/system-map/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-governor-mode", mode, temporary }),
      });
      load();
    } catch {}
  };

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/system-map", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Activity ${response.status}`);
        return response.json() as Promise<ActivitySnapshot>;
      })
      .then((data) => {
        setSnapshot(data);
        if (data.governorMode) setGovernorMode(data.governorMode);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  // Live: read on mount and every 10s while visible.
  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // The countdowns ("en 3 min") keep moving between reads: `now` is state,
  // refreshed on the same slow tick, never read during render.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onClose) {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const capturedAgo = snapshot ? formatCountdownEs(snapshot.capturedAt, now) : null;

  const workingAgents = useMemo(
    () => (snapshot?.herdrAgents ?? []).filter((agent) => agent.status === "working"),
    [snapshot],
  );

  const sectionTitle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "0 0 10px",
  };
  const card: React.CSSProperties = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
  };
  const buttonBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 500,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: "all 0.15s ease",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "max(10px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left))", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0 }}>
        <button type="button" onClick={onClose} title="Volver al chat (Esc)" aria-label="Volver al chat" style={buttonBase}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#16a34a", background: "rgba(22, 163, 74, 0.12)", padding: "3px 8px", borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", animation: "pulse 1.6s ease-in-out infinite" }} />
            EN VIVO
          </span>
          <button type="button" onClick={load} disabled={loading} title="Actualizar (se actualiza solo cada 10 s)" aria-label="Actualizar actividad" style={{ ...buttonBase, padding: "6px 10px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: loading ? "spin 1s linear infinite" : undefined }}>
              <path d="M21 12a9 9 0 1 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "22px clamp(14px, 4vw, 40px) max(48px, env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>
          {error && (
            <div style={{ ...card, color: "#dc2626", borderColor: "#dc2626", textAlign: "center", fontSize: 13 }}>
              No se pudo leer la actividad ({error}). Reintenta con ↻.
            </div>
          )}

          {/* Canales */}
          <section aria-label="Canales">
            <h2 style={sectionTitle}>Canales Principales</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {(snapshot?.channels ?? []).map((channel) => {
                const dot = CHANNEL_DOT[channel.state] ?? CHANNEL_DOT.unknown;
                const hasSession = Boolean(channel.activeSessionId);
                return (
                  <div
                    key={channel.id}
                    onClick={() => {
                      if (hasSession && onSelectSession && channel.activeSessionId) {
                        onSelectSession(channel.activeSessionId);
                        onClose?.();
                      }
                    }}
                    style={{
                      ...card,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      cursor: hasSession && onSelectSession ? "pointer" : "default",
                      transition: "background 0.15s ease, border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (hasSession && onSelectSession) {
                        e.currentTarget.style.background = "var(--bg-hover)";
                        e.currentTarget.style.borderColor = "var(--accent)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (hasSession && onSelectSession) {
                        e.currentTarget.style.background = card.background as string;
                        e.currentTarget.style.borderColor = "var(--border)";
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: "none", width: 11, height: 11, borderRadius: "50%", background: dot.color, boxShadow: `0 0 6px ${dot.color}` }} aria-hidden="true" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{channel.label}</span>
                        <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{channel.unit}</span>
                      </span>
                      <span style={{ flex: "none", fontSize: 11.5, fontWeight: 600, color: dot.color }}>{dot.label}</span>
                    </div>

                    {channel.activeSessionId && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, paddingTop: 6, borderTop: "1px solid var(--border)", fontSize: 11.5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span style={{ color: "var(--text-dim)" }}>Sesión activa:</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {channel.activeSessionId}
                          </span>
                        </div>
                        {onSelectSession && (
                          <span style={{ flex: "none", color: "var(--accent)", fontWeight: 600, fontSize: 11 }}>
                            Abrir sesión →
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!snapshot && !error && <div style={{ ...card, color: "var(--text-dim)", fontSize: 13 }}>Leyendo canales…</div>}
            </div>
          </section>

          {/* Palanca de Consumo de Tokens (Governor) */}
          <section aria-label="Control de Gasto">
            <h2 style={sectionTitle}>Palanca de Gasto (Token Governor)</h2>
            <div style={{ ...card, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>Modo de Inversión y Gasto</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
                  Ajusta la intensidad de las investigaciones y tareas en segundo plano.
                </span>
              </div>
              <div style={{ display: "inline-flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: 3, gap: 4 }}>
                {(["turbo", "normal", "eco"] as const).map((m) => {
                  const isSel = governorMode === m;
                  const colors = { turbo: "#8b5cf6", normal: "#3b82f6", eco: "#10b981" };
                  const labels = { turbo: "🚀 Turbo", normal: "⚖️ Normal", eco: "🌱 Ahorro" };
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSetGovernorMode(m)}
                      style={{
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: isSel ? 650 : 500,
                        borderRadius: 6,
                        border: "none",
                        background: isSel ? colors[m] : "transparent",
                        color: isSel ? "#ffffff" : "var(--text-muted)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {labels[m]}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Sesiones Pi */}
          <section aria-label="Sesiones Pi activas">
            <h2 style={sectionTitle}>Sesiones Pi · {snapshot ? `${snapshot.piSessions.length} activas` : "…"}</h2>
            {snapshot && snapshot.piSessions.length === 0 && (
              <div style={{ ...card, color: "var(--text-dim)", fontSize: 13 }}>Sin sesiones Pi corriendo ahora.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(snapshot?.piSessions ?? []).map((session) => {
                const { filled, total } = cpuCells(session.cpu);
                const hasSessionId = Boolean(session.sessionId && session.sessionId.startsWith("01a1"));
                return (
                  <div
                    key={session.pid}
                    onClick={() => {
                      if (onSelectSession && session.sessionId) {
                        onSelectSession(session.sessionId);
                        onClose?.();
                      }
                    }}
                    style={{
                      ...card,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      cursor: onSelectSession ? "pointer" : "default",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (onSelectSession) e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.06))";
                    }}
                    onMouseLeave={(e) => {
                      if (onSelectSession) e.currentTarget.style.background = card.background as string;
                    }}
                  >
                    <span aria-hidden="true" style={{ flex: "none", display: "inline-flex", gap: 2 }}>
                      {Array.from({ length: total }, (_, index) => (
                        <span key={index} style={{ width: 7, height: 14, borderRadius: 2, background: index < filled ? "var(--accent)" : "var(--bg-selected)" }} />
                      ))}
                    </span>
                    <span style={{ flex: "none", padding: "2px 8px", borderRadius: 5, background: "var(--bg-selected)", color: "var(--accent)", fontSize: 11.5, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
                      {session.profile}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {session.sessionId || `pid ${session.pid}`}
                    </span>
                    {onSelectSession && (
                      <span style={{ flex: "none", fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>
                        Abrir →
                      </span>
                    )}
                    <span style={{ flex: "none", fontSize: 11.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>cpu {session.cpu}%</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Delegaciones y Subsesiones de Canales (ROT -> subagentes) */}
          {snapshot?.delegations && snapshot.delegations.length > 0 && (
            <section aria-label="Delegaciones de canales">
              <h2 style={sectionTitle}>Delegaciones de Canales (ROT → Subagentes)</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {snapshot.delegations.map((del) => {
                  const statusColors: Record<string, string> = {
                    completado: "#10b981",
                    fallido: "#ef4444",
                    "en curso": "#3b82f6",
                  };
                  const color = statusColors[del.status] || "var(--text-muted)";
                  return (
                    <div key={del.id} style={{ ...card, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ padding: "2px 6px", borderRadius: 4, background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 700 }}>
                            {del.channel}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                            → {del.agent}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                            ({del.id.slice(0, 8)})
                          </span>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color }}>
                          {del.status}
                        </span>
                      </div>
                      {del.error && (
                        <div style={{ fontSize: 11, color: "#ef4444", background: "rgba(239,68,68,0.08)", padding: "4px 8px", borderRadius: 4 }}>
                          {del.error}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Herdr */}
          <section aria-label="Agentes Herdr">
            <h2 style={sectionTitle}>
              Herdr · {snapshot ? `${workingAgents.length}/${snapshot.herdrAgents.length} trabajando` : "…"}
            </h2>
            {snapshot && workingAgents.length === 0 && (
              <div style={{ ...card, color: "var(--text-dim)", fontSize: 13 }}>
                {snapshot.herdrAgents.length > 0 ? `${snapshot.herdrAgents.length} agentes en reposo.` : "Sin agentes."}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {workingAgents.map((agent, index) => (
                <div key={`${agent.name}-${index}`} style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                  <span style={{ flex: "none", fontSize: 13 }} aria-hidden="true">🔄</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{agent.name}</span>
                  <span style={{ flex: "none", fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "50%" }}>
                    {agent.cwd.split("/").filter(Boolean).slice(-1)[0] || agent.cwd}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Rutinas */}
          <section aria-label="Rutinas y timers">
            <h2 style={sectionTitle}>Rutinas · {snapshot ? `${snapshot.timers.length} timers` : "…"}</h2>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              {(snapshot?.timers ?? []).map((timer) => {
                const unit = timer.unit.replace(/\.timer$/, "");
                const next = formatCountdownEs(timer.next, now);
                const last = formatCountdownEs(timer.last, now);
                return (
                  <div key={timer.unit} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderTop: "1px solid var(--border)" }}>
                    <span style={{ flex: "none", color: "var(--text-dim)", fontSize: 12 }} aria-hidden="true">⏱</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{unit}</span>
                    <span style={{ flex: "none", fontSize: 11.5, color: "var(--text-dim)", minWidth: 80, textAlign: "right" }}>
                      {last ? `últ. ${last}` : "sin pasada"}
                    </span>
                    <span style={{ flex: "none", fontSize: 11.5, fontWeight: 600, color: "var(--accent)", minWidth: 70, textAlign: "right" }}>
                      {next ?? "—"}
                    </span>
                  </div>
                );
              })}
              {snapshot && snapshot.timers.length === 0 && (
                <div style={{ padding: "12px 14px", color: "var(--text-dim)", fontSize: 13 }}>Sin timers rg-/rot-.</div>
              )}
              {!snapshot && !error && <div style={{ padding: "12px 14px", color: "var(--text-dim)", fontSize: 13 }}>Leyendo timers…</div>}
            </div>
          </section>

          {snapshot && (
            <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-dim)" }}>
              leído {capturedAgo ?? "ahora"} · se actualiza solo
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
