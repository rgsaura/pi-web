"use client";

import { useEffect, useMemo, useState } from "react";
import type { InspectorSnapshot, SkillInfo } from "@/lib/agents-inspector";

/** Herramientas base del runtime que todo agente tiene disponibles. */
const BASE_TOOLS = ["Read", "Bash", "Edit", "Write", "Subagents", "Codemode"];

function skillSourceBadge(source: SkillInfo["source"]) {
  return source === "project"
    ? {
        bg: "rgba(56, 189, 248, 0.15)",
        color: "#38bdf8",
        label: "project",
      }
    : { bg: "rgba(168, 85, 247, 0.15)", color: "#a855f7", label: "user" };
}

export function AgentsInspectorView() {
  const [data, setData] = useState<InspectorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);
  const [openSkillKey, setOpenSkillKey] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents-inspector")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as InspectorSnapshot;
      })
      .then((snapshot) => {
        if (!cancelled) setData(snapshot);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la configuración de agentes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const skillsByName = useMemo(() => {
    const map = new Map<string, SkillInfo>();
    for (const skill of data?.skills ?? []) map.set(skill.name, skill);
    return map;
  }, [data]);

  const disabledToolsLower = useMemo(
    () => new Set((data?.disabledTools ?? []).map((t) => t.toLowerCase())),
    [data],
  );

  const copyPrompt = (agentName: string, prompt: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(prompt).catch(() => {});
    }
    setCopiedAgent(agentName);
    window.setTimeout(() => setCopiedAgent(null), 1500);
  };

  const agents = data?.agents ?? [];
  const skills = data?.skills ?? [];
  const mcpServers = data?.mcpServers ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            Agentes
          </h1>
          <span
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {agents.length} agentes
          </span>
          {data?.defaultModel && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 6,
                background: "rgba(255, 255, 255, 0.05)",
                color: "var(--text-muted)",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
              }}
              title="Modelo por defecto (settings.json)"
            >
              ⚙ {data.defaultModel}
            </span>
          )}
        </div>
      </header>

      {/* Contenido scrolleable */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px calc(32px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 13 }}>
            Cargando agentes...
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              padding: 24,
              color: "#ef4444",
              fontSize: 13,
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 12,
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 48,
              color: "var(--text-muted)",
              fontSize: 13,
              border: "1px dashed var(--border)",
              borderRadius: 12,
            }}
          >
            No hay agentes definidos en <code>~/.pi/agent/agents</code>.
          </div>
        )}

        {/* Tarjetas de agente (accordion: solo una abierta) */}
        {agents.map((agent) => {
          const isExpanded = expandedAgent === agent.name;
          return (
            <article
              key={agent.sourcePath || agent.name}
              onClick={() => {
                setExpandedAgent(isExpanded ? null : agent.name);
                setOpenSkillKey(null);
              }}
              style={{
                background: "var(--bg-card, var(--bg-panel))",
                border: "1px solid",
                borderColor: isExpanded ? "var(--accent)" : "var(--card-border, var(--border))",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                  {agent.name}
                </span>
                {agent.model && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: "rgba(34, 197, 94, 0.12)",
                      color: "#22c55e",
                      fontFamily: "monospace",
                      fontWeight: 600,
                    }}
                  >
                    {agent.model}
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)" }}>
                  {isExpanded ? "▲" : "▼"}
                </span>
              </div>

              {agent.description && (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {agent.description}
                </div>
              )}

              {isExpanded && (
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Prompt */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 12, color: "var(--text)" }}>System prompt</strong>
                      <button
                        type="button"
                        onClick={() => copyPrompt(agent.name, agent.prompt)}
                        style={{
                          fontSize: 11.5,
                          padding: "4px 12px",
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background:
                            copiedAgent === agent.name
                              ? "rgba(34, 197, 94, 0.15)"
                              : "var(--bg-panel)",
                          color: copiedAgent === agent.name ? "#22c55e" : "var(--text-muted)",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {copiedAgent === agent.name ? "✓ copiado" : "Copiar"}
                      </button>
                    </div>
                    <pre
                      style={{
                        margin: 0,
                        maxHeight: 320,
                        overflow: "auto",
                        padding: "12px 14px",
                        background: "rgba(0, 0, 0, 0.25)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--text)",
                        fontSize: 12,
                        lineHeight: 1.55,
                        fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        WebkitOverflowScrolling: "touch",
                      }}
                    >
                      {agent.prompt || "(sin prompt)"}
                    </pre>
                    <div style={{ fontSize: 10.5, color: "var(--text-dim)", fontFamily: "monospace" }}>
                      {agent.sourcePath}
                    </div>
                  </div>

                  {/* Skills del agente */}
                  {agent.skills.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <strong style={{ fontSize: 12, color: "var(--text)" }}>
                        Skills ({agent.skills.length})
                      </strong>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {agent.skills.map((skillName) => {
                          const isOpen = openSkillKey === `${agent.name}:${skillName}`;
                          return (
                            <button
                              key={skillName}
                              type="button"
                              onClick={() =>
                                setOpenSkillKey(isOpen ? null : `${agent.name}:${skillName}`)
                              }
                              style={{
                                fontSize: 11.5,
                                padding: "4px 10px",
                                borderRadius: 999,
                                border: "1px solid",
                                borderColor: isOpen ? "var(--accent)" : "var(--border)",
                                background: isOpen
                                  ? "var(--bg-selected, rgba(56, 189, 248, 0.1))"
                                  : "transparent",
                                color: isOpen ? "var(--accent)" : "var(--text-muted)",
                                cursor: "pointer",
                                fontFamily: "monospace",
                              }}
                            >
                              {skillName}
                            </button>
                          );
                        })}
                      </div>
                      {openSkillKey?.startsWith(`${agent.name}:`) &&
                        (() => {
                          const skillName = openSkillKey.slice(agent.name.length + 1);
                          const info = skillsByName.get(skillName);
                          const badge = info ? skillSourceBadge(info.source) : null;
                          return (
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                                background: "rgba(56, 189, 248, 0.05)",
                                fontSize: 12,
                                color: "var(--text-muted)",
                                lineHeight: 1.5,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <strong style={{ color: "var(--text)", fontFamily: "monospace" }}>
                                  {skillName}
                                </strong>
                                {badge && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      padding: "1px 7px",
                                      borderRadius: 4,
                                      background: badge.bg,
                                      color: badge.color,
                                    }}
                                  >
                                    {badge.label}
                                  </span>
                                )}
                              </div>
                              {info?.description ?? "Skill no encontrada en el catálogo."}
                            </div>
                          );
                        })()}
                    </div>
                  )}

                  {/* Herramientas */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <strong style={{ fontSize: 12, color: "var(--text)" }}>Herramientas</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {BASE_TOOLS.map((tool) => {
                        const disabled = disabledToolsLower.has(tool.toLowerCase());
                        return (
                          <span
                            key={tool}
                            style={{
                              fontSize: 11.5,
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: disabled ? "transparent" : "rgba(255, 255, 255, 0.04)",
                              color: disabled ? "var(--text-dim)" : "var(--text-muted)",
                              fontFamily: "monospace",
                              textDecoration: disabled ? "line-through" : "none",
                            }}
                            title={disabled ? `${tool} deshabilitada` : tool}
                          >
                            {tool}
                            {disabled && (
                              <span style={{ marginLeft: 6, fontSize: 10, textDecoration: "none" }}>
                                deshabilitada
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {mcpServers.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>MCP:</span>
                        {mcpServers.map((server) => (
                          <span
                            key={server.name}
                            style={{
                              fontSize: 11.5,
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: "rgba(168, 85, 247, 0.08)",
                              color: "var(--text-muted)",
                              fontFamily: "monospace",
                            }}
                          >
                            {server.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {/* Catálogo de skills */}
        {!loading && !error && skills.length > 0 && (
          <section
            style={{
              marginTop: 8,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "var(--bg-card, var(--bg-panel))",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setCatalogOpen((open) => !open)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "14px 20px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "left",
              }}
            >
              <span>Catálogo de skills ({skills.length})</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {catalogOpen ? "▲" : "▼"}
              </span>
            </button>
            {catalogOpen && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {skills.map((skill, index) => {
                  const badge = skillSourceBadge(skill.source);
                  return (
                    <div
                      key={`${skill.source}:${skill.path}`}
                      style={{
                        padding: "12px 20px",
                        borderBottom: index < skills.length - 1 ? "1px solid var(--border)" : "none",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", fontFamily: "monospace" }}>
                          {skill.name}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "1px 7px",
                            borderRadius: 4,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
                        {skill.description ?? "Sin descripción."}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default AgentsInspectorView;
