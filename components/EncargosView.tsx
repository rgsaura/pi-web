"use client";

import { useMemo, useState } from "react";
import { useExoData } from "@/hooks/useExoData";
import type { ExoEncargo } from "@/lib/exo-types";

export interface EncargosViewProps {
  onSelectSession?: (sessionId: string) => void;
}

type Filter = "all" | "pending" | "done";

function formatDuration(isoDate?: string): string {
  if (!isoDate) return "";
  try {
    const start = new Date(isoDate).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - start);
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins % 60}m`;
    return `${Math.max(1, mins)}m`;
  } catch {
    return "";
  }
}

function getDifficultyBadge(diff?: string) {
  switch (diff?.toLowerCase()) {
    case "baja":
      return { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e", label: "Baja" };
    case "alta":
      return { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", label: "Alta" };
    case "compleja":
      return { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", label: "Compleja" };
    case "media":
    default:
      return { bg: "rgba(56, 189, 248, 0.15)", text: "#38bdf8", label: "Media" };
  }
}

export function EncargosView({ onSelectSession }: EncargosViewProps) {
  const { data, loading, refresh } = useExoData();
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allEncargos = useMemo(() => data?.encargos?.encargos ?? [], [data]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEncargos) {
      if (e.categoria) set.add(e.categoria);
    }
    return Array.from(set).sort();
  }, [allEncargos]);

  const filtered = useMemo(() => {
    return allEncargos.filter((e) => {
      if (filter === "pending" && e.status !== "pending") return false;
      if (filter === "done" && e.status !== "done") return false;
      if (selectedCategory !== "all" && e.categoria !== selectedCategory) return false;
      return true;
    });
  }, [allEncargos, filter, selectedCategory]);

  const pendingCount = data?.encargos?.pendingCount ?? 0;
  const totalCount = data?.encargos?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg)", overflow: "hidden" }}>
      {/* Top Header Toolbar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          rowGap: 8,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>Encargos y Objetivos</h1>
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", fontWeight: 700 }}>
            {pendingCount} activos
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {totalCount} total
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={refresh}
            className="config-button config-button-small config-button-secondary"
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            Actualizar
          </button>
        </div>
      </header>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {(["pending", "all", "done"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "5px 14px",
                fontSize: 12.5,
                fontWeight: filter === f ? 600 : 400,
                borderRadius: 6,
                border: "1px solid",
                borderColor: filter === f ? "var(--accent)" : "var(--border)",
                background: filter === f ? "var(--bg-selected, rgba(56, 189, 248, 0.1))" : "transparent",
                color: filter === f ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {f === "pending" ? "En curso / Activos" : f === "all" ? "Todos" : "Completados"}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Área:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                background: "var(--bg-panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="all">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading && !data && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
            Cargando encargos...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 13, border: "1px dashed var(--border)", borderRadius: 12 }}>
            No hay tareas en este filtro.
          </div>
        )}

        {filtered.map((item) => {
          const isPending = item.status === "pending";
          const diffBadge = getDifficultyBadge(item.dificultad);
          const timeElapsed = formatDuration(item.creado);
          const isExpanded = expandedId === item.id;
          const sessionId = item.sessionId;

          return (
            <article
              key={item.id}
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              style={{
                background: "var(--bg-card, var(--bg-panel))",
                border: "1px solid",
                borderColor: isPending ? "var(--card-border, #1f2b48)" : "var(--border)",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                cursor: "pointer",
                transition: "border-color 0.15s, transform 0.1s",
              }}
            >
              {/* Top metadata row: Tags + Time */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: 10.5,
                    background: isPending ? "rgba(245, 158, 11, 0.15)" : "rgba(34, 197, 94, 0.15)",
                    color: isPending ? "#f59e0b" : "#22c55e",
                  }}
                >
                  {isPending ? "EN CURSO" : "COMPLETADO"}
                </span>

                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: diffBadge.bg,
                    color: diffBadge.text,
                    fontWeight: 600,
                    fontSize: 10.5,
                  }}
                >
                  Dificultad: {diffBadge.label}
                </span>

                <span
                  style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.05)",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {item.categoria}
                </span>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)" }}>
                  {timeElapsed && <span>⏱️ Llevan {timeElapsed}</span>}
                  <span style={{ fontFamily: "monospace" }}>{item.id}</span>
                </div>
              </div>

              {/* BIG CLEAR TITLE (Objetivo principal) */}
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", lineHeight: 1.35 }}>
                {item.titulo || (item.descripcion ? item.descripcion.slice(0, 59) + (item.descripcion.length > 59 ? "…" : "") : "")}
              </div>

              {/* Status and Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 500 }}>
                  {item.estado_detalle || (isPending ? "Investigando / Trabajando en la tarea..." : "Objetivo completado")}
                </span>

                {/* Direct Link to Session if assigned or matched */}
                {sessionId && onSelectSession && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSession(sessionId);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      minHeight: 36,
                      borderRadius: 6,
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                      color: "#38bdf8",
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.22)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(56, 189, 248, 0.12)")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h6v6" />
                      <path d="M10 14L21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                    <span>Ir a sesión de trabajo</span>
                  </button>
                )}
              </div>

              {/* Expandable details (only shown if clicked) */}
              {isExpanded && (
                <div style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                    <strong style={{ color: "var(--text)" }}>Instrucción original:</strong>
                    <div style={{ marginTop: 4, background: "rgba(0, 0, 0, 0.2)", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)" }}>
                      {item.descripcion}
                    </div>
                  </div>

                  {item.nota && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                      <strong style={{ color: "#22c55e" }}>Resolución:</strong>
                      <div style={{ marginTop: 4, background: "rgba(34, 197, 94, 0.05)", padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                        {item.nota}
                      </div>
                    </div>
                  )}

                  {sessionId && (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                      Sesión vinculada: <span style={{ fontFamily: "monospace" }}>{sessionId}</span>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
