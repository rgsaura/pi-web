"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExoProposal } from "@/lib/exo-types";
import { formatCountdownEs } from "@/lib/activity-data";
import { isFamilyArchived, projectNameOf } from "@/lib/session-tree";
import { listSessionFamilies, type SessionFamily } from "@/lib/session-family";
import { storedProjectName, type SessionUiState } from "@/lib/session-ui-state-shared";
import {
  loadSystemSectionsCollapsed,
  loadSystemSectionsSegment,
  loadSystemSectionsVariant,
  saveSystemSectionsCollapsed,
  saveSystemSectionsSegment,
  saveSystemSectionsVariant,
  type SystemSectionSegment,
  type SystemSectionVariant,
} from "@/lib/sidebar-prefs";
import type { SessionInfo } from "@/lib/types";
import { useIsMobile } from "@/hooks/useIsMobile";
import { workspaceKeyOf } from "@/lib/workspace-memory";

/** Age of a workspace family's latest activity, in Rodrigo's short style.
 *  Inlined from the retired lib/workspaces-data (fork/c778f4b2 removed the panel). */
function formatWorkspaceAge(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/**
 * "Secciones del Sistema" — the collapsible strip between the voice button
 * and the session tree: a compact live view of Projects (sessions grouped by
 * project, expandable with their sessions), pending Decisions, system
 * Routines and Recents, all from real data the sidebar already holds plus
 * /api/live/rutinas. Three layout variants (full / compact / quick access)
 * are switchable in place and remembered per browser. Nothing here blocks
 * the sidebar: sessions arrive as props, routines load on their own with a
 * subtle placeholder, and every fetch failure degrades to an empty state.
 * The open strip yields its height back on short windows (flex shrink with
 * a floor), so it never pushes the sessions, the files section or Settings
 * off-screen.
 */

/** Families grouped by the sidebar's own project key. */
interface ProjectGroup {
  key: string;
  name: string;
  families: SessionFamily[];
  runningCount: number;
  activeCount: number;
  lastModifiedMs: number;
}

interface Rutina {
  name: string;
  nextIso: string | null;
}

interface SystemSectionsProps {
  sessions: readonly SessionInfo[];
  runningIds: ReadonlySet<string>;
  uiState: SessionUiState;
  selectedSessionId: string | null;
  pendingProposals: readonly ExoProposal[];
  onSelectSession: (session: SessionInfo) => void;
  /** Deep-links to one decision (the Exo panel at that proposal). */
  onOpenProposal?: (id: string) => void;
  onOpenProposalsView?: () => void;
  onOpenActivityView?: () => void;
}

/** A session counts as active when it moved in the last hour (mockup v3's rule). */
const ACTIVE_WINDOW_MS = 3_600_000;
const RECENT_LIMIT = 8;
const PROJECT_LIMIT = 12;
const DECISIONS_LIMIT = 6;
const RUTINAS_LIMIT = 12;
const RUTINAS_CACHE_MS = 45_000;
const RUTINAS_POLL_MS = 60_000;

const SEGMENTS: { id: SystemSectionSegment; label: string; icon: string }[] = [
  { id: "proyectos", label: "Proyectos", icon: "📁" },
  { id: "rutinas", label: "Rutinas", icon: "⚡" },
  { id: "decisiones", label: "Decisiones", icon: "🎯" },
  { id: "recientes", label: "Recientes", icon: "⏱️" },
];

const VARIANTS: { id: SystemSectionVariant; label: string; hint: string }[] = [
  { id: "full", label: "Completa", hint: "Proyectos, Rutinas, Decisiones y Recientes" },
  { id: "compact", label: "Compacta", hint: "Proyectos y Decisiones" },
  { id: "access", label: "Solo accesos", hint: "Chips de acceso rápido" },
];

/** module-level cache so every sidebar mount shares one read of the timers. */
let rutinasCache: { data: Rutina[]; readAt: number } = { data: [], readAt: 0 };
let rutinasInFlight: Promise<Rutina[]> | null = null;
let rutinasFailed = false;

async function fetchRutinas(): Promise<Rutina[]> {
  if (!rutinasInFlight) {
    rutinasInFlight = fetch("/api/live/rutinas", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`rutinas unavailable (${response.status})`);
        return response.json() as Promise<{ rutinas?: Rutina[] }>;
      })
      .then((payload) => {
        rutinasFailed = false;
        return Array.isArray(payload.rutinas) ? payload.rutinas : [];
      })
      .catch(() => {
        rutinasFailed = true;
        return [] as Rutina[];
      })
      .finally(() => {
        rutinasInFlight = null;
      });
  }
  return rutinasInFlight;
}

function useRutinas(enabled: boolean): { rutinas: Rutina[]; loading: boolean; failed: boolean } {
  const [rutinas, setRutinas] = useState<Rutina[]>(() => (Date.now() - rutinasCache.readAt < RUTINAS_CACHE_MS ? rutinasCache.data : []));
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(rutinasFailed);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (Date.now() - rutinasCache.readAt < RUTINAS_CACHE_MS) {
      setRutinas(rutinasCache.data);
      setFailed(rutinasFailed);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchRutinas().then((result) => {
      if (cancelled) return;
      rutinasCache = { data: result, readAt: Date.now() };
      setRutinas(result);
      setFailed(rutinasFailed);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [enabled, version]);

  // A slow tick keeps the cache fresh while the strip is open; a hidden
  // tab does nothing until it is visible again.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - rutinasCache.readAt >= RUTINAS_CACHE_MS) refresh();
    }, RUTINAS_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { rutinas, loading, failed };
}

function familyActivityMs(family: SessionFamily): number {
  const time = Date.parse(family.latestModified);
  return Number.isFinite(time) ? time : 0;
}

function familyIsRunning(family: SessionFamily, runningIds: ReadonlySet<string>): boolean {
  return runningIds.has(family.root.id) || family.subagents.some((session) => runningIds.has(session.id));
}

function prettyProjectName(key: string, root: string, uiState: SessionUiState): string {
  const stored = storedProjectName(uiState, key);
  if (stored) return stored;
  if (key.startsWith("rutina:")) {
    const sub = key.slice("rutina:".length);
    return sub ? `Rutinas · ${sub}` : "Rutinas";
  }
  return projectNameOf(root) || key;
}

function prettyRutinaName(name: string): string {
  return name.replace(/^rg-/, "").replace(/[-_]/g, " ");
}

function familyTitle(family: SessionFamily): string {
  const root = family.root;
  return root.name || root.firstMessage || "Sesión";
}

function decisionExpiryLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const time = Date.parse(expiresAt);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleDateString("es", { day: "numeric", month: "short" });
}

function ChevronIcon({ size = 12, rotated = false }: { size?: number; rotated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transition: "transform 0.15s ease", transform: rotated ? "rotate(90deg)" : "none", flexShrink: 0 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function VariantIcon({ variant, size = 13 }: { variant: SystemSectionVariant; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (variant === "full") {
    return (
      <svg {...common}>
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
        <circle cx="5" cy="6" r="1" fill="currentColor" />
        <circle cx="5" cy="12" r="1" fill="currentColor" />
        <circle cx="5" cy="18" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (variant === "compact") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="6" rx="2" />
        <rect x="4" y="13" width="16" height="6" rx="2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="6" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Dot({ tone }: { tone: "live" | "recent" | "amber" }) {
  const color = tone === "live" ? "#34d399" : tone === "amber" ? "#f59e0b" : "var(--text-dim, #8b93a7)";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        ...(tone === "live" ? { animation: "pulse 1.6s ease-in-out infinite" } : {}),
      }}
    />
  );
}

export function SystemSections({
  sessions,
  runningIds,
  uiState,
  selectedSessionId,
  pendingProposals,
  onSelectSession,
  onOpenProposal,
  onOpenProposalsView,
  onOpenActivityView,
}: SystemSectionsProps) {
  const isMobile = useIsMobile();
  // Restored after mount (never in a state initializer): the server render
  // and hydration draw the defaults, then the saved choice lands.
  const [collapsed, setCollapsed] = useState(false);
  const [variant, setVariant] = useState<SystemSectionVariant>("full");
  const [segment, setSegment] = useState<SystemSectionSegment>("proyectos");
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    setCollapsed(loadSystemSectionsCollapsed());
    setVariant(loadSystemSectionsVariant());
    setSegment(loadSystemSectionsSegment());
    setRestored(true);
  }, []);

  const [openProjects, setOpenProjects] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { rutinas, loading: rutinasLoading, failed: rutinasFailed } = useRutinas(!collapsed);

  // Projects: the sidebar's own grouping (worktree-aware), archived families
  // excluded, newest activity first. Derived pure from props on every tick.
  const projects = useMemo<ProjectGroup[]>(() => {
    const families = listSessionFamilies(sessions as readonly SessionInfo[]);
    const groups = new Map<string, ProjectGroup>();
    for (const family of families) {
      if (isFamilyArchived(family, uiState, runningIds)) continue;
      if (family.root.transient) continue;
      const key = workspaceKeyOf(family.root);
      const activity = familyActivityMs(family);
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: prettyProjectName(key, family.root.projectRoot ?? family.root.cwd, uiState),
          families: [],
          runningCount: 0,
          activeCount: 0,
          lastModifiedMs: activity,
        };
        groups.set(key, group);
      }
      group.families.push(family);
      group.lastModifiedMs = Math.max(group.lastModifiedMs, activity);
      if (familyIsRunning(family, runningIds)) group.runningCount++;
      if (nowMs - activity < ACTIVE_WINDOW_MS) group.activeCount++;
    }
    const list = [...groups.values()];
    for (const group of list) {
      group.families.sort((a, b) => familyActivityMs(b) - familyActivityMs(a));
    }
    list.sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
    return list;
  }, [sessions, uiState, runningIds, nowMs]);

  const recentFamilies = useMemo<SessionFamily[]>(() => {
    const families = listSessionFamilies(sessions as readonly SessionInfo[]);
    return families
      .filter((family) => !isFamilyArchived(family, uiState, runningIds) && !family.root.transient)
      .sort((a, b) => familyActivityMs(b) - familyActivityMs(a))
      .slice(0, RECENT_LIMIT);
  }, [sessions, uiState, runningIds]);

  const pendingDecisions = useMemo(() => pendingProposals.slice(0, DECISIONS_LIMIT), [pendingProposals]);

  const openDecision = useCallback((proposal: ExoProposal) => {
    if (onOpenProposal) onOpenProposal(proposal.id);
    else onOpenProposalsView?.();
  }, [onOpenProposal, onOpenProposalsView]);
  const openActivity = onOpenActivityView ?? (() => {});

  const toggleProject = useCallback((key: string) => {
    setOpenProjects((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setVariantAndSave = useCallback((next: SystemSectionVariant) => {
    setVariant(next);
    saveSystemSectionsVariant(next);
  }, []);
  const setSegmentAndSave = useCallback((next: SystemSectionSegment) => {
    setSegment(next);
    saveSystemSectionsSegment(next);
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      saveSystemSectionsCollapsed(next);
      return next;
    });
  }, []);

  const rowMinHeight = isMobile ? 40 : 32;
  const controlSize = isMobile ? 32 : 24;

  const renderSessionRow = (family: SessionFamily, indent: boolean) => {
    const running = familyIsRunning(family, runningIds);
    const selected = family.root.id === selectedSessionId
      || family.subagents.some((session) => session.id === selectedSessionId);
    const label = indent ? `↳ ${familyTitle(family)}` : familyTitle(family);
    return (
      <button
        key={family.root.id}
        type="button"
        onClick={() => onSelectSession(family.root)}
        title={familyTitle(family)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          minHeight: rowMinHeight,
          padding: "4px 10px",
          border: "none",
          borderRadius: 7,
          background: selected ? "var(--bg-selected)" : "transparent",
          color: selected ? "var(--accent)" : "var(--text)",
          fontWeight: selected ? 600 : 400,
          cursor: "pointer",
          fontSize: 12,
          textAlign: "left",
          paddingLeft: indent ? 26 : 10,
        }}
        onMouseEnter={(event) => {
          if (!selected) event.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(event) => {
          if (!selected) event.currentTarget.style.background = "transparent";
        }}
      >
        <Dot tone={running ? "live" : "recent"} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 10, color: "var(--text-dim, #8b93a7)", flexShrink: 0 }}>
          {formatWorkspaceAge(family.latestModified, nowMs) ?? ""}
        </span>
      </button>
    );
  };

  const renderProjectRow = (group: ProjectGroup) => {
    const open = openProjects.has(group.key);
    const metaParts: string[] = [`${group.families.length} ${group.families.length === 1 ? "sesión" : "sesiones"}`];
    if (group.runningCount > 0) metaParts.push(`${group.runningCount} ${group.runningCount === 1 ? "activa" : "activas"}`);
    else if (group.activeCount > 0) metaParts.push(`${group.activeCount} reciente${group.activeCount === 1 ? "" : "s"}`);
    return (
      <div key={group.key}>
        <button
          type="button"
          onClick={() => toggleProject(group.key)}
          aria-expanded={open}
          title={`${group.name} — ${metaParts.join(" · ")}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            width: "100%",
            minHeight: rowMinHeight,
            padding: "5px 10px",
            border: `1px solid ${open ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border)"}`,
            borderRadius: 8,
            background: "var(--bg-panel)",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: 12,
            textAlign: "left",
            margin: "2px 0",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.borderColor = "var(--accent)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.borderColor = open ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border)";
          }}
        >
          <ChevronIcon rotated={open} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</span>
            <span style={{ fontSize: 9.5, color: "var(--text-dim, #8b93a7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {metaParts.join(" · ")}
            </span>
          </span>
          {group.runningCount > 0 ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,0.12)", padding: "1px 7px", borderRadius: 999, flexShrink: 0 }}>
              <Dot tone="live" />
              {group.runningCount}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: "var(--text-dim, #8b93a7)", flexShrink: 0 }}>{group.families.length}</span>
          )}
        </button>
        {open && group.families.slice(0, 8).map((family) => renderSessionRow(family, true))}
      </div>
    );
  };

  const renderDecisions = (limit: number, showHeader: boolean) => {
    if (showHeader) {
      return (
        <div key="decisiones" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim, #8b93a7)", padding: "8px 10px 2px", display: "flex", alignItems: "center", gap: 6 }}>
            🎯 Pendientes
            <span style={{ background: pendingProposals.length > 0 ? "rgba(220, 38, 38, 0.15)" : "var(--bg-selected)", color: pendingProposals.length > 0 ? "#ef4444" : "var(--text-muted)", padding: "0 6px", borderRadius: 999, fontSize: 9 }}>
              {pendingProposals.length}
            </span>
          </div>
          {pendingDecisions.length === 0 && (
            <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim, #8b93a7)" }}>Sin decisiones pendientes 🎉</div>
          )}
          {pendingDecisions.slice(0, limit).map((proposal) => {
            const expiry = decisionExpiryLabel(proposal.expiresAt);
            return (
              <button
                key={proposal.id}
                type="button"
                onClick={() => openDecision(proposal)}
                title={`${proposal.title} — abrir esta decisión`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  minHeight: rowMinHeight,
                  padding: "4px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 7,
                  background: "var(--bg-panel)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontSize: 11.5,
                  textAlign: "left",
                  margin: "1px 0",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 999, background: "var(--bg-selected)", color: "var(--text-muted)", flexShrink: 0, fontWeight: 700 }}>
                  {proposal.category || "general"}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proposal.title}</span>
                {expiry && <span style={{ fontSize: 9, color: "#f59e0b", flexShrink: 0 }}>⏳ {expiry}</span>}
              </button>
            );
          })}
        </div>
      );
    }
    return null;
  };

  const renderRutinas = () => (
    <div key="rutinas" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim, #8b93a7)", padding: "8px 10px 2px", display: "flex", alignItems: "center", gap: 6 }}>
        ⚡ Rutinas del sistema
        <span style={{ background: "var(--bg-selected)", color: "var(--text-muted)", padding: "0 6px", borderRadius: 999, fontSize: 9 }}>
          {rutinas.length}
        </span>
      </div>
      {rutinasLoading && rutinas.length === 0 && (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim, #8b93a7)" }}>Cargando timers…</div>
      )}
      {!rutinasLoading && rutinas.length === 0 && (
        <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim, #8b93a7)" }}>
          {rutinasFailed ? "Timers no disponibles ahora" : "Sin timers rg-* activos"}
        </div>
      )}
      {rutinas.slice(0, RUTINAS_LIMIT).map((rutina) => (
        <button
          key={rutina.name}
          type="button"
          onClick={openActivity}
          title={`${prettyRutinaName(rutina.name)} — ver en el mapa de actividad`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            minHeight: rowMinHeight,
            padding: "4px 10px",
            border: "none",
            borderRadius: 7,
            background: "transparent",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: 12,
            textAlign: "left",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = "transparent";
          }}
        >
          <Dot tone="amber" />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textTransform: "capitalize" }}>
            {prettyRutinaName(rutina.name)}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-dim, #8b93a7)", flexShrink: 0 }}>
            {formatCountdownEs(rutina.nextIso, nowMs) ?? "—"}
          </span>
        </button>
      ))}
    </div>
  );

  const renderSegmentBody = () => {
    if (segment === "proyectos") {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {projects.length === 0 && (
            <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--text-dim, #8b93a7)" }}>Sin sesiones todavía</div>
          )}
          {projects.slice(0, PROJECT_LIMIT).map(renderProjectRow)}
        </div>
      );
    }
    if (segment === "recientes") {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {recentFamilies.map((family) => renderSessionRow(family, false))}
        </div>
      );
    }
    if (segment === "decisiones") return renderDecisions(DECISIONS_LIMIT, true);
    return renderRutinas();
  };

  const accessChips = [
    {
      id: "proyectos" as const,
      icon: "📁",
      label: "Proyectos",
      count: String(projects.length),
      action: () => {
        setSegmentAndSave("proyectos");
        setVariantAndSave("full");
      },
    },
    {
      id: "rutinas" as const,
      icon: "⚡",
      label: "Rutinas",
      count: rutinas.length > 0 ? String(rutinas.length) : "·",
      action: onOpenActivityView,
    },
    {
      id: "decisiones" as const,
      icon: "🎯",
      label: "Decisiones",
      count: String(pendingProposals.length),
      action: onOpenProposalsView,
    },
    {
      id: "recientes" as const,
      icon: "⏱️",
      label: "Recientes",
      count: "·",
      action: () => {
        setSegmentAndSave("recientes");
        setVariantAndSave("full");
      },
    },
  ];

  // The open strip's footprint: a deterministic basis the sidebar's column
  // can take back on short windows (flex shrink, never past its floor), so
  // the sessions keep their minimum and the files section keeps its header
  // instead of either being pushed off-screen. Collapsed, the header row
  // alone (flex: none, its content).
  const openFlex = variant === "access" ? "0 0 auto" : `0 1 ${isMobile ? 204 : 252}px`;
  const openMinHeight = variant === "access" ? undefined : isMobile ? 144 : 150;

  return (
    <section
      data-system-sections=""
      aria-label="Secciones del Sistema"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: collapsed ? "0 0 auto" : openFlex,
        minHeight: collapsed ? undefined : openMinHeight,
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg-panel) 45%, var(--bg))",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: isMobile ? "6px 10px" : "4px 10px" }}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? "Desplegar Secciones del Sistema" : "Plegar Secciones del Sistema"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            border: "none",
            background: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "4px 2px",
            minHeight: 28,
            flex: 1,
            minWidth: 0,
          }}
        >
          <ChevronIcon rotated={!collapsed} />
          <span>Secciones del Sistema</span>
        </button>
        <div role="group" aria-label="Variante de Secciones del Sistema" style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {VARIANTS.map((entry) => {
            const active = restored && variant === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setVariantAndSave(entry.id)}
                aria-pressed={active}
                title={`Variante ${entry.label}: ${entry.hint}`}
                aria-label={`Variante ${entry.label}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: controlSize,
                  height: controlSize,
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: active ? "var(--bg-selected)" : "transparent",
                  color: active ? "var(--accent)" : "var(--text-dim, #8b93a7)",
                  cursor: "pointer",
                  padding: 0,
                }}
                onMouseEnter={(event) => {
                  if (!active) {
                    event.currentTarget.style.background = "var(--bg-hover)";
                    event.currentTarget.style.color = "var(--text-muted)";
                  }
                }}
                onMouseLeave={(event) => {
                  if (!active) {
                    event.currentTarget.style.background = "transparent";
                    event.currentTarget.style.color = "var(--text-dim, #8b93a7)";
                  }
                }}
              >
                <VariantIcon variant={entry.id} size={isMobile ? 15 : 13} />
              </button>
            );
          })}
        </div>
      </div>

      {!collapsed && variant === "access" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, padding: "2px 10px 10px", flex: "0 0 auto" }}>
          {accessChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.action}
              title={`${chip.label} — ${chip.id === "decisiones" ? "abrir vista de Decisiones" : chip.id === "rutinas" ? "abrir mapa de actividad" : `abrir ${chip.label.toLowerCase()}`}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                minHeight: isMobile ? 52 : 44,
                padding: "6px 2px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: 500,
                minWidth: 0,
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1 }} aria-hidden="true">{chip.icon}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{chip.label}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: chip.id === "decisiones" && pendingProposals.length > 0 ? "#ef4444" : "var(--text-dim, #8b93a7)" }}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {!collapsed && variant === "full" && (
        <>
          <div role="group" aria-label="Subsección del sistema" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 3, padding: "0 10px 6px", flex: "0 0 auto" }}>
            {SEGMENTS.map((entry) => {
              const active = segment === entry.id;
              const badge = entry.id === "decisiones"
                ? (pendingProposals.length > 0 ? String(pendingProposals.length) : null)
                : entry.id === "proyectos"
                  ? (projects.length > 0 ? String(projects.length) : null)
                  : entry.id === "rutinas"
                    ? (rutinas.length > 0 ? String(rutinas.length) : null)
                    : null;
              return (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSegmentAndSave(entry.id)}
                  title={entry.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    minHeight: isMobile ? 32 : 26,
                    padding: "3px 2px",
                    borderRadius: 6,
                    border: "none",
                    background: active ? "var(--bg-selected)" : "var(--bg-panel)",
                    color: active ? "var(--accent)" : "var(--text-dim, #8b93a7)",
                    fontWeight: 600,
                    fontSize: 10.5,
                    cursor: "pointer",
                    overflow: "hidden",
                    minWidth: 0,
                  }}
                >
                  <span aria-hidden="true">{entry.icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.label}</span>
                  {badge && (
                    <span
                      aria-hidden="true"
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "0 5px",
                        borderRadius: 999,
                        flexShrink: 0,
                        background: entry.id === "decisiones" && pendingProposals.length > 0 ? "rgba(220, 38, 38, 0.15)" : "var(--bg-hover)",
                        color: entry.id === "decisiones" && pendingProposals.length > 0 ? "#ef4444" : "var(--text-dim, #8b93a7)",
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div ref={listRef} className="scrollbar-subtle" style={{ flex: "1 1 auto", minHeight: 84, overflowY: "auto", padding: "0 6px 8px" }}>
            {renderSegmentBody()}
          </div>
        </>
      )}

      {!collapsed && variant === "compact" && (
        <div className="scrollbar-subtle" style={{ flex: "1 1 auto", minHeight: 84, overflowY: "auto", padding: "0 6px 8px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-dim, #8b93a7)", padding: "8px 10px 2px", display: "flex", alignItems: "center", gap: 6 }}>
            📁 Proyectos
            <span style={{ background: "var(--bg-selected)", color: "var(--text-muted)", padding: "0 6px", borderRadius: 999, fontSize: 9 }}>{projects.length}</span>
          </div>
          {projects.slice(0, 4).map(renderProjectRow)}
          {renderDecisions(3, true)}
        </div>
      )}
    </section>
  );
}
