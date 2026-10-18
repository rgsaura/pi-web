"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { SandboxesSection } from "./SandboxesSection";
import {
  WORKSPACE_STATUS_LABELS,
  formatWorkspaceAge,
  groupWorkspaces,
  type WorkspaceStatus,
  type WorkspaceSummary,
} from "@/lib/workspaces-data";

export interface WorkspacesViewProps {
  onClose?: () => void;
  /** Starts a new Pi session in a workspace's directory (the sidebar's own route). */
  onStartInCwd?: (cwd: string) => void;
}

const REFRESH_MS = 30_000;

const STATUS_DOT: Record<WorkspaceStatus, string> = {
  active: "#16a34a",
  done: "var(--text-dim)",
  pending: "#d97706",
};

export function WorkspacesView({ onClose, onStartInCwd }: WorkspacesViewProps) {
  const { workspaces, loading, error, refresh } = useWorkspaces();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  // Fresh on mount, then a slow keep-alive while open.
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // The "hace 12 min" ages keep moving between reads.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
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

  const groups = useMemo(() => groupWorkspaces(workspaces), [workspaces]);
  const activeCount = useMemo(() => workspaces.filter((workspace) => workspace.status === "active").length, [workspaces]);

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const openInCwd = useCallback((workspace: WorkspaceSummary) => {
    if (workspace.cwd && onStartInCwd) {
      onStartInCwd(workspace.cwd);
      onClose?.();
    }
  }, [onStartInCwd, onClose]);

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
  const card: React.CSSProperties = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
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
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
            {workspaces.length} workspaces · <span style={{ color: "var(--accent)", fontWeight: 600 }}>{activeCount} activos</span>
          </span>
          <button type="button" onClick={refresh} disabled={loading} title="Actualizar" aria-label="Actualizar workspaces" style={{ ...buttonBase, padding: "6px 10px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: loading ? "spin 1s linear infinite" : undefined }}>
              <path d="M21 12a9 9 0 1 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "22px clamp(14px, 4vw, 40px) max(48px, env(safe-area-inset-bottom))" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <SandboxesSection onStartInCwd={onStartInCwd} />
          {error && (
            <div style={{ ...card, padding: "12px 16px", color: "#dc2626", borderColor: "#dc2626", textAlign: "center", fontSize: 13 }}>
              No se pudieron leer los workspaces ({error}). Reintenta con ↻.
            </div>
          )}

          {!error && workspaces.length === 0 && !loading && (
            <div style={{ ...card, padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Sin workspaces</div>
              <div style={{ fontSize: 13 }}>No hay nada en ~/.local/state/workspaces-active.</div>
            </div>
          )}

          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.label);
            return (
              <section key={group.category} aria-label={group.label}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={!collapsed}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <span style={{ display: "inline-block", transition: "transform 0.12s", transform: collapsed ? "rotate(-90deg)" : "none" }} aria-hidden="true">▾</span>
                  {group.label}
                  <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>· {group.workspaces.length}</span>
                </button>
                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {group.workspaces.map((workspace) => {
                      const expanded = expandedId === workspace.id;
                      const age = formatWorkspaceAge(workspace.updatedAt, now);
                      const dot = STATUS_DOT[workspace.status];
                      return (
                        <div key={workspace.id} style={{ ...card, overflow: "hidden" }}>
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : workspace.id)}
                            aria-expanded={expanded}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              padding: "11px 14px",
                              border: 0,
                              background: "transparent",
                              color: "var(--text)",
                              textAlign: "left",
                              cursor: "pointer",
                              fontSize: 13.5,
                              fontWeight: 600,
                            }}
                          >
                            <span style={{ flex: "none", width: 9, height: 9, borderRadius: "50%", background: dot, boxShadow: workspace.status === "active" ? `0 0 6px ${dot}` : "none" }} aria-hidden="true" />
                            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{workspace.title}</span>
                            {age && <span style={{ flex: "none", fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{age}</span>}
                            <span style={{ flex: "none", fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{WORKSPACE_STATUS_LABELS[workspace.status]}</span>
                          </button>
                          {expanded && (
                            <div style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                              {workspace.phases.length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {workspace.phases.map((phase) => (
                                    <span key={phase.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 5, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 11 }}>
                                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_DOT[phase.status] }} aria-hidden="true" />
                                      <span style={{ fontWeight: 500 }}>{phase.name}</span>
                                      <span style={{ color: "var(--text-dim)" }}>{WORKSPACE_STATUS_LABELS[phase.status].toLowerCase()}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                              {workspace.nextSteps.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 4px" }}>Siguientes pasos</div>
                                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: "var(--text-muted)" }}>
                                    {workspace.nextSteps.map((step, index) => (
                                      <li key={index}>{step}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {workspace.cwd && onStartInCwd && (
                                <button type="button" onClick={() => openInCwd(workspace)} style={{ ...buttonBase, alignSelf: "flex-start" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M12 5v14M5 12h14" />
                                  </svg>
                                  Nueva sesión aquí
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
