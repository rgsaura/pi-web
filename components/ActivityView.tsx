"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatCountdownEs,
  type ActivitySnapshot,
} from "@/lib/activity-data";

export interface ActivityViewProps {
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

export function ActivityView({ onSelectSession }: ActivityViewProps) {
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"recent" | "cpu" | "name">("recent");
  const [searchQuery, setSearchQuery] = useState<string>("");
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

  const capturedAgo = snapshot ? formatCountdownEs(snapshot.capturedAt, now) : null;

  const workingAgents = useMemo(
    () => (snapshot?.herdrAgents ?? []).filter((agent) => agent.status === "working"),
    [snapshot],
  );

  const filteredPiSessions = useMemo(() => {
    let list = snapshot?.piSessions ?? [];

    if (categoryFilter !== "all") {
      list = list.filter((s) => {
        const cat = (s.category || "").toLowerCase();
        if (categoryFilter === "working") {
          return s.pid !== "-" || s.currentAction?.startsWith("Ejecutando");
        }
        if (categoryFilter === "ui") return cat.includes("ui") || cat.includes("frontend");
        if (categoryFilter === "facesearch") return cat.includes("facesearch");
        if (categoryFilter === "comms") return cat.includes("comunicac") || cat.includes("comms");
        if (categoryFilter === "infra") return cat.includes("infra") || cat.includes("sistema");
        if (categoryFilter === "rutinas") return cat.includes("rutina");
        if (categoryFilter === "planes") return cat.includes("planes") || cat.includes("agenda");
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => {
        const t = (s.title || "").toLowerCase();
        const c = (s.cwd || "").toLowerCase();
        const a = (s.currentAction || "").toLowerCase();
        const id = (s.sessionId || "").toLowerCase();
        const enc = (s.encargoId || "").toLowerCase();
        return t.includes(q) || c.includes(q) || a.includes(q) || id.includes(q) || enc.includes(q);
      });
    }

    return [...list].sort((a, b) => {
      if (sortMode === "cpu") {
        const cpuA = parseFloat(a.cpu || "0") || 0;
        const cpuB = parseFloat(b.cpu || "0") || 0;
        return cpuB - cpuA;
      }
      if (sortMode === "name") {
        return (a.title || "").localeCompare(b.title || "");
      }
      // default: recent
      return (b.lastActiveMs || 0) - (a.lastActiveMs || 0);
    });
  }, [snapshot?.piSessions, categoryFilter, searchQuery, sortMode]);

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
    borderRadius: 10,
    padding: "14px 16px",
  };
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
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "var(--bg)", color: "var(--text)", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg-panel)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: "var(--accent)" }} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-0.01em" }}>Actividad</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#16a34a" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", animation: "pulse 1.6s ease-in-out infinite" }} />
            EN VIVO
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button type="button" onClick={load} disabled={loading} title="Actualizar (se actualiza solo cada 10 s)" aria-label="Actualizar actividad" style={{ ...buttonBase, padding: "5px 8px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: loading ? "spin 1s linear infinite" : undefined }}>
              <path d="M21 12a9 9 0 1 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "22px clamp(14px, 4vw, 40px) 48px" }}>
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

          {/* Palanca de Consumo de Tokens (Governor) y Presupuesto */}
          <section aria-label="Control de Gasto">
            <h2 style={sectionTitle}>Palanca de Gasto & Presupuesto de Tokens</h2>
            <div style={{ ...card, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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

              {snapshot?.tokenBudget && (
                <div
                  style={{
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        📊 Cuota de Tokens ({snapshot.tokenBudget.periodLabel})
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 12,
                          background: snapshot.tokenBudget.surplusPp >= 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: snapshot.tokenBudget.surplusPp >= 0 ? "#10b981" : "#ef4444",
                        }}
                      >
                        {snapshot.tokenBudget.surplusLabel}
                      </span>
                      {snapshot.tokenBudget.isOffPeak && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: "rgba(139, 92, 246, 0.15)",
                            color: "#8b5cf6",
                          }}
                        >
                          🌙 Valle (50% off)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                      <strong style={{ color: "var(--text)" }}>{(snapshot.tokenBudget.remaining / 1000).toFixed(1)}k</strong> / {(snapshot.tokenBudget.limit / 1000).toFixed(0)}k restantes ({snapshot.tokenBudget.usedPct}% usado)
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 8,
                      borderRadius: 4,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${Math.min(100, Math.max(0, snapshot.tokenBudget.usedPct))}%`,
                        background: snapshot.tokenBudget.usedPct > 85 ? "#ef4444" : snapshot.tokenBudget.usedPct > 65 ? "#f59e0b" : "#8b5cf6",
                        borderRadius: 3,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-dim)" }}>
                    <span>
                      ⏳ Renovación de ciclo: <strong>{snapshot.tokenBudget.resetLabel}</strong> ({snapshot.tokenBudget.daysRemaining} {snapshot.tokenBudget.daysRemaining === 1 ? "día" : "días"} restantes)
                    </span>
                    <span>
                      Proveedor principal: <strong style={{ textTransform: "uppercase" }}>{snapshot.tokenBudget.preferredProvider}</strong>
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Sesiones Pi Activas */}
          <section aria-label="Sesiones Pi activas">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ ...sectionTitle, margin: 0 }}>
                  Sesiones Pi en Vivo · {snapshot ? `${filteredPiSessions.length} activas` : "…"}
                </h2>
                {snapshot && filteredPiSessions.length !== snapshot.piSessions.length && (
                  <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>
                    ({snapshot.piSessions.length} total)
                  </span>
                )}
              </div>
              {snapshot && snapshot.piSessions.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Detalle del encargo y contexto en curso
                </span>
              )}
            </div>

            {/* Filtros granulares y ordenación para Sesiones Activas */}
            {snapshot && snapshot.piSessions.length > 0 && (
              <div style={{ ...card, padding: "10px 14px", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Search & Reset */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type="search"
                      placeholder="Buscar por encargo, título o ruta..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 10px 6px 28px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                        fontSize: 12,
                        outline: "none",
                      }}
                    />
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "var(--text-dim)" }}>
                      🔍
                    </span>
                  </div>

                  {(categoryFilter !== "all" || sortMode !== "recent" || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter("all");
                        setSortMode("recent");
                        setSearchQuery("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Restablecer filtros
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {[
                    { key: "all", label: "Todas" },
                    { key: "working", label: "⚡ Trabajando" },
                    { key: "ui", label: "🎨 UI" },
                    { key: "facesearch", label: "🔍 FaceSearch" },
                    { key: "comms", label: "💬 Comms" },
                    { key: "infra", label: "⚙️ Infra" },
                    { key: "rutinas", label: "⏱️ Rutinas" },
                    { key: "planes", label: "🗓️ Planes" },
                  ].map((c) => {
                    const isSelected = categoryFilter === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategoryFilter(c.key)}
                        style={{
                          padding: "3px 9px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: isSelected ? 650 : 500,
                          border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                          background: isSelected ? "var(--bg-selected)" : "var(--bg)",
                          color: isSelected ? "var(--accent)" : "var(--text-muted)",
                          cursor: "pointer",
                          transition: "all 0.12s ease",
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sort Mode Row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 6, borderTop: "1px dashed var(--border)" }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    Ordenar sesiones:
                  </span>
                  <div style={{ display: "inline-flex", gap: 4 }}>
                    {[
                      { key: "recent", label: "Más reciente" },
                      { key: "cpu", label: "Mayor CPU" },
                      { key: "name", label: "Nombre" },
                    ].map((s) => {
                      const isSelected = sortMode === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setSortMode(s.key as "recent" | "cpu" | "name")}
                          style={{
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 10.5,
                            fontWeight: isSelected ? 650 : 500,
                            border: "none",
                            background: isSelected ? "var(--accent)" : "transparent",
                            color: isSelected ? "#ffffff" : "var(--text-muted)",
                            cursor: "pointer",
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {snapshot && filteredPiSessions.length === 0 && (
              <div style={{ ...card, color: "var(--text-dim)", fontSize: 13, textAlign: "center", padding: "24px 16px" }}>
                {snapshot.piSessions.length === 0
                  ? "Sin sesiones Pi trabajando activamente en este instante."
                  : "Ninguna sesión activa coincide con los filtros seleccionados."}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredPiSessions.map((session, idx) => {
                const { filled, total } = cpuCells(session.cpu);
                const hasSessionId = Boolean(session.sessionId && session.sessionId.startsWith("01a1"));
                const categoryColor = session.color || "var(--accent)";
                const isWorking = session.pid !== "-" || session.currentAction?.startsWith("Ejecutando");

                return (
                  <div
                    key={`${session.sessionId || session.pid}-${idx}`}
                    onClick={() => {
                      if (onSelectSession && session.sessionId) {
                        onSelectSession(session.sessionId);
                      }
                    }}
                    style={{
                      ...card,
                      display: "flex",
                      flexDirection: "column",
                      gap: 9,
                      padding: "12px 16px",
                      cursor: onSelectSession ? "pointer" : "default",
                      transition: "all 0.15s ease",
                      borderLeft: `4px solid ${categoryColor}`,
                    }}
                    onMouseEnter={(e) => {
                      if (onSelectSession) {
                        e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.06))";
                        e.currentTarget.style.borderColor = categoryColor;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (onSelectSession) {
                        e.currentTarget.style.background = card.background as string;
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.borderLeft = `4px solid ${categoryColor}`;
                      }
                    }}
                  >
                    {/* Header Row: Category Badge + Encargo ID + Live Status + CPU/Open */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                        {session.category && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 7px",
                              borderRadius: 5,
                              background: "rgba(255, 255, 255, 0.07)",
                              color: categoryColor,
                              fontSize: 11,
                              fontWeight: 700,
                              border: `1px solid ${categoryColor}40`,
                            }}
                          >
                            <span>{session.icon || "⚡"}</span>
                            <span>{session.category}</span>
                          </span>
                        )}

                        {session.encargoId && (
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#f59e0b",
                              fontSize: 10.5,
                              fontWeight: 700,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {session.encargoId}
                          </span>
                        )}

                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--bg-selected)",
                            color: "var(--text-muted)",
                            fontSize: 10.5,
                            fontWeight: 600,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {session.profile || "asistente"}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                        {isWorking && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "#10b981", fontWeight: 600 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 1.6s ease-in-out infinite" }} />
                            trabajando
                          </span>
                        )}

                        {session.cpu && session.cpu !== "0.0" && (
                          <span style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                            cpu {session.cpu}%
                          </span>
                        )}

                        {onSelectSession && (
                          <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>
                            Abrir sesión →
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Main Title / Concrete Task */}
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>
                      {session.title || "Procesando encargo..."}
                    </div>

                    {/* Footer Row: Current Action & Workspace CWD */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-dim)", paddingTop: 4, borderTop: "1px dashed var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--accent)" }}>⚡</span>
                        <span style={{ color: "var(--text-muted)" }}>{session.currentAction || "En ejecución"}</span>
                      </div>

                      {session.cwd && (
                        <div style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)" }}>
                          📁 {session.cwd.replace(process.env.HOME || "/home/rgsaura", "~")}
                        </div>
                      )}
                    </div>
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
