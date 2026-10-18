"use client";

import { useCallback, useEffect, useState } from "react";

export interface SandboxItem {
  name: string;
  title: string;
  port: number;
  worktree: string;
  branch: string;
  url: string;
  status: "running" | "stopped" | "created";
  created_at: string;
  feedback?: string | null;
}

export interface SandboxesSectionProps {
  onStartInCwd?: (cwd: string) => void;
}

export function SandboxesSection({ onStartInCwd }: SandboxesSectionProps) {
  const [sandboxes, setSandboxes] = useState<SandboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchSandboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sandboxes");
      if (res.ok) {
        const data = await res.json();
        setSandboxes(data.sandboxes || []);
      }
    } catch (e) {
      console.error("Error al cargar sandboxes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSandboxes();
  }, [fetchSandboxes]);

  const handleSaveFeedback = async (name: string) => {
    const text = feedbackInput[name];
    if (!text || !text.trim()) return;
    setSubmitting(name);
    try {
      const res = await fetch("/api/sandboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, feedback: text.trim() }),
      });
      if (res.ok) {
        await fetchSandboxes();
        setFeedbackInput((prev) => ({ ...prev, [name]: "" }));
      }
    } catch (e) {
      console.error("Error al guardar feedback:", e);
    } finally {
      setSubmitting(null);
    }
  };

  if (sandboxes.length === 0 && !loading) {
    return null;
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-panel)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
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
    fontSize: 12,
    fontWeight: 500,
    textDecoration: "none",
  };

  return (
    <section aria-label="Forks y Sandboxes UI" style={{ marginTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          🧪 Sandboxes & Previews UI ({sandboxes.length})
        </span>
        <button
          type="button"
          onClick={fetchSandboxes}
          disabled={loading}
          style={{ ...buttonBase, padding: "2px 6px", fontSize: 11 }}
        >
          {loading ? "..." : "↻"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sandboxes.map((sb) => (
          <div key={sb.name} style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sb.status === "running" ? "#16a34a" : "var(--text-dim)",
                    boxShadow: sb.status === "running" ? "0 0 6px #16a34a" : "none",
                  }}
                  title={sb.status}
                />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{sb.title}</span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  background: "var(--bg)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                }}
              >
                Puerto {sb.port}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Rama: <code style={{ fontSize: 11 }}>{sb.branch}</code>
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <a
                  href={sb.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...buttonBase,
                    background: "var(--accent, #2563eb)",
                    color: "#fff",
                    borderColor: "transparent",
                  }}
                >
                  Abrir Preview ↗
                </a>
                {onStartInCwd && sb.worktree && (
                  <button
                    type="button"
                    onClick={() => onStartInCwd(sb.worktree)}
                    style={buttonBase}
                    title="Abrir sesión en este worktree"
                  >
                    Sesión Pi
                  </button>
                )}
              </div>
            </div>

            {/* Feedback / Comentarios de Rodrigo */}
            <div
              style={{
                marginTop: 4,
                paddingTop: 8,
                borderTop: "1px dashed var(--border)",
                fontSize: 12,
              }}
            >
              {sb.feedback ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>
                    Feedback registrado:
                  </span>
                  <div
                    style={{
                      background: "var(--bg)",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  >
                    💬 {sb.feedback}
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Escribe feedback o decisión..."
                    value={feedbackInput[sb.name] || ""}
                    onChange={(e) =>
                      setFeedbackInput((prev) => ({ ...prev, [sb.name]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveFeedback(sb.name);
                    }}
                    style={{
                      flex: 1,
                      padding: "4px 8px",
                      fontSize: 12,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveFeedback(sb.name)}
                    disabled={submitting === sb.name}
                    style={{ ...buttonBase, padding: "4px 8px" }}
                  >
                    {submitting === sb.name ? "..." : "Guardar"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
