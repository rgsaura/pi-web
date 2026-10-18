"use client";

import { useMemo, useState, useEffect } from "react";
import { useExoData } from "@/hooks/useExoData";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { formatCountdownEs, type ActivitySnapshot } from "@/lib/activity-data";

export interface DashboardViewProps {
  onOpenEncargos: () => void;
  onOpenDecisiones: () => void;
  onOpenActividad: () => void;
  onOpenWorkspaces: () => void;
  onOpenVoice: () => void;
  onSelectSession?: (sessionId: string) => void;
  onOpenNewChat?: () => void;
}

export function DashboardView({
  onOpenEncargos,
  onOpenDecisiones,
  onOpenActividad,
  onOpenWorkspaces,
  onOpenVoice,
  onSelectSession,
  onOpenNewChat,
}: DashboardViewProps) {
  const { data: exoData } = useExoData();
  const { workspaces } = useWorkspaces();

  const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    const fetchActivity = async () => {
      try {
        const res = await fetch("/api/system-map", { cache: "no-store" });
        if (res.ok && mounted) {
          const data = await res.json();
          setActivity(data);
        }
      } catch {}
    };
    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
      clearInterval(tick);
    };
  }, []);

  const pendingEncargos = useMemo(() => {
    const list = exoData?.encargos?.encargos ?? [];
    return list.filter((e) => e.status === "pending");
  }, [exoData]);

  const activeProposals = useMemo(() => {
    const list = exoData?.proposals?.proposals ?? [];
    return list.filter((p) => !p.selectedOption && !p.discard);
  }, [exoData]);

  const activePiSessions = activity?.piSessions ?? [];
  const herdrWorking = (activity?.herdrAgents ?? []).filter((a) => a.status === "working");
  const channels = activity?.channels ?? [];
  const rotChannel = channels.find((c) => c.id === "rot");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        color: "var(--text)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          width: "100%",
          margin: "0 auto",
          padding: "24px clamp(14px, 4vw, 32px) 60px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {/* Encabezado Principal / Hero */}
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingBottom: 20,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                ExoHuman OS
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 6px #10b981",
                  }}
                />
                ROT Conectado
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
              Centro de mando operativo · Gestión por Telegram y ejecución en homelab
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={onOpenVoice}
              title="Dictar orden por voz"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--accent)",
                color: "#ffffff",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
              <span>Voz ROT</span>
            </button>

            {onOpenNewChat && (
              <button
                type="button"
                onClick={onOpenNewChat}
                title="Abrir sesión de chat manual"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "var(--bg-panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <span>+ Nueva Sesión</span>
              </button>
            )}
          </div>
        </header>

        {/* Tarjetas de Acceso Rápido / Métricas Vitales */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
          }}
        >
          {/* Card Encargos */}
          <div
            onClick={onOpenEncargos}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "transform 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#f59e0b";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Encargos
              </span>
              <span style={{ fontSize: 16 }}>⏳</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: pendingEncargos.length > 0 ? "#f59e0b" : "var(--text)" }}>
                {pendingEncargos.length}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>pendientes</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
              Ver ledger completo →
            </span>
          </div>

          {/* Card Decisiones */}
          <div
            onClick={onOpenDecisiones}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "transform 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Decisiones
              </span>
              <span style={{ fontSize: 16 }}>🎯</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: activeProposals.length > 0 ? "var(--accent)" : "var(--text)" }}>
                {activeProposals.length}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>requieren voto</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
              Resolver propuestas →
            </span>
          </div>

          {/* Card Sesiones Vivas */}
          <div
            onClick={onOpenActividad}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "transform 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#10b981";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sesiones Activas
              </span>
              <span style={{ fontSize: 16 }}>⚡</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: activePiSessions.length > 0 ? "#10b981" : "var(--text)" }}>
                {activePiSessions.length}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {herdrWorking.length > 0 ? `(+${herdrWorking.length} herdr)` : "ejecutándose"}
              </span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
              Mapa del sistema →
            </span>
          </div>

          {/* Card Workspaces */}
          <div
            onClick={onOpenWorkspaces}
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "16px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              transition: "transform 0.12s ease, border-color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#a855f7";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Workspaces
              </span>
              <span style={{ fontSize: 16 }}>🚀</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 700 }}>
                {workspaces.length}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>proyectos</span>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 500 }}>
              Explorar repos y servicios →
            </span>
          </div>
        </section>

        {/* Sección: Encargos en curso o urgentes */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⏳</span>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Encargos Activos y en Cola</h2>
            </div>
            <button
              type="button"
              onClick={onOpenEncargos}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ver todos ({pendingEncargos.length}) →
            </button>
          </div>

          {pendingEncargos.length === 0 ? (
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              ✨ Todos los encargos completados. Cero tareas pendientes en cola.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              {pendingEncargos.slice(0, 4).map((enc) => (
                <div
                  key={enc.id}
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "rgba(245, 158, 11, 0.12)",
                          color: "#f59e0b",
                        }}
                      >
                        {enc.id}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {enc.titulo || enc.descripcion}
                      </span>
                    </div>
                    {enc.descripcion && enc.titulo && (
                      <span style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {enc.descripcion}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    {enc.sessionId && onSelectSession && (
                      <button
                        type="button"
                        onClick={() => onSelectSession(enc.sessionId!)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "5px 10px",
                          borderRadius: 6,
                          background: "var(--bg-hover)",
                          border: "1px solid var(--border)",
                          color: "var(--accent)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <span>Sesión Pi →</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sección: Decisiones que requieren atención inmediata */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Decisiones Pendientes de Criterio</h2>
            </div>
            <button
              type="button"
              onClick={onOpenDecisiones}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ver todas ({activeProposals.length}) →
            </button>
          </div>

          {activeProposals.length === 0 ? (
            <div
              style={{
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "20px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              🎉 Cero decisiones pendientes. Todo al día.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10 }}>
              {activeProposals.slice(0, 3).map((prop) => (
                <div
                  key={prop.id}
                  onClick={onOpenDecisiones}
                  style={{
                    background: "var(--bg-panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
                      {prop.category ? `[${prop.category.toUpperCase()}]` : "[DECISIÓN]"}
                    </span>
                    {prop.expiresAt && (
                      <span style={{ fontSize: 10.5, color: "#f59e0b", fontWeight: 600 }}>
                        {formatCountdownEs(prop.expiresAt, now)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                    {prop.title}
                  </span>
                  {prop.summary && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {prop.summary}
                    </span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 600 }}>
                      Votar opciones ({prop.options?.length ?? 0}) →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sección: Estado de Canales y Actividad en Vivo */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚡</span>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Infraestructura & Canales</h2>
            </div>
            <button
              type="button"
              onClick={onOpenActividad}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Mapa completo de actividad →
            </button>
          </div>

          <div
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "14px 16px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Telegram Bot (ROT)</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {rotChannel?.activeSessionId ? `Sesión: ${rotChannel.activeSessionId.slice(0, 8)}` : "En espera"}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: activePiSessions.length > 0 ? "#10b981" : "var(--text-dim)" }} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Pi Runner</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {activePiSessions.length} procesos activos
                </span>
              </div>

              {activity?.governorMode && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Governor:</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: activity.governorMode === "turbo" ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                      color: activity.governorMode === "turbo" ? "#8b5cf6" : "#3b82f6",
                    }}
                  >
                    {activity.governorMode.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenActividad}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "5px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              Inspeccionar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
