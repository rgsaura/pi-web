"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { SessionInfo } from "@/lib/types";

/**
 * SessionsExplorer — una sola vista de todas las sesiones.
 *
 * Sustituye al árbol por proyectos y al explorador multimodo: una lista
 * cronológica plana (Hoy / Ayer / últimos días) con títulos limpios, un
 * buscador siempre visible y chips de filtro rápido (Encargos, Rutinas,
 * Trabajo, Personal). Cada fila lleva menú ⋮ con las acciones reales:
 * abrir en pestaña nueva, copiar enlace, renombrar, fijar, archivar y
 * borrar. Todo contra las APIs existentes de pi-web.
 */

export interface SessionFamilyRef {
  rootId: string;
  ids: string[];
}

export interface SessionsExplorerHandle {
  focusSearch: () => void;
  /** Opens the archived section (the sidebar menus' "view archived"). */
  showArchived: () => void;
}

interface SessionsExplorerProps {
  /** Todas las sesiones (incluidas archivadas; se separan con archivedIds). */
  sessions: SessionInfo[];
  selectedSessionId: string | null;
  runningSessionIds?: ReadonlySet<string>;
  awaitingInputSessionIds?: ReadonlySet<string>;
  unreadSessionIds?: ReadonlySet<string>;
  archivedIds?: ReadonlySet<string>;
  pinnedIds?: ReadonlySet<string>;
  /** Familia (raíz + miembros) a la que pertenece cada sesión, para fijar/archivar/borrar. */
  familyOf?: (id: string) => SessionFamilyRef | undefined;
  onSelectSession: (session: SessionInfo) => void;
  onReload?: () => void;
  onSearchFocusChange?: (focused: boolean) => void;
}

type Kind = "encargo" | "rutina" | "trabajo" | "personal";
type ChipId = "todo" | "activas" | Kind;
type ViewMode = "tiempo" | "proyectos";

interface ProjectGroup {
  key: string;
  label: string;
  emoji: string;
  description?: string;
}

/** Modos de vista principales del explorador de sesiones. */
const VIEW_MODES: { id: ViewMode; label: string; emoji: string; hint: string }[] = [
  { id: "tiempo", label: "Cronológico", emoji: "🕒", hint: "Agrupadas por fecha (Hoy, Ayer, semana pasada)" },
  { id: "proyectos", label: "Proyectos", emoji: "📁", hint: "Agrupadas por proyecto y dashboards (FaceSearch, UI, Rutinas...)" },
];
const VIEW_STORAGE_KEY = "sessionsExplorer.view";
const COLLAPSED_PROJECTS_KEY = "sessionsExplorer.collapsedProjects";

const PERSONAL_GROUP: ProjectGroup = { key: "personal", label: "Personal & General", emoji: "🏠", description: "Charlas directas, preguntas y operativa cotidiana" };
const RUTINAS_GROUP: ProjectGroup = { key: "rutinas", label: "Rutinas del Sistema", emoji: "⚡", description: "Morning brief, watchdog, triaje y reflexiones automáticas" };

/** Etiquetas amigables por proyecto (clave = basename del projectRoot). */
const PROJECT_META: Record<string, ProjectGroup> = {
  facesearch: { key: "facesearch", label: "FaceSearch", emoji: "🔍", description: "Buscador facial, Stripe checkout y monitorización" },
  "exohuman-ui": { key: "exohuman-ui", label: "ExoHuman UI", emoji: "🖥️", description: "Interfaz web centralizada del sistema personal" },
  piweb: { key: "piweb", label: "ExoHuman UI", emoji: "🖥️", description: "Interfaz web centralizada del sistema personal" },
  exohuman: { key: "exohuman", label: "ExoHuman Core", emoji: "🧠", description: "Harness de ejecución y motor de contexto" },
  viralmerch: { key: "viralmerch", label: "ViralMerch", emoji: "👕", description: "Generador de productos y merch viral" },
  storylater: { key: "storylater", label: "StoryLater", emoji: "📖", description: "Generador narrativo multiformato" },
  rgsaura: { key: "rgsaura", label: "rgsaura.com", emoji: "🌐", description: "Sitio web personal y presencia digital" },
  herradura: { key: "herradura", label: "La Herradura", emoji: "🌊", description: "Aventura, buceo y producción audiovisual" },
  wallapop: { key: "wallapop", label: "Wallapop", emoji: "📦", description: "Automatización de ventas y chat" },
  infra: { key: "infra", label: "Infraestructura & Homelab", emoji: "🖥️", description: "Proxmox, CT126, backups R2 y servicios" },
  decisiones: { key: "decisiones", label: "Decisiones & Propuestas", emoji: "⚖️", description: "Ledger de propuestas y resoluciones" },
};

/**
 * Sección del proyecto al que pertenece una sesión.
 * Detección robusta multi-criterio: ruta de bot (rg-facesearch-bot), cwd en /workspaces/,
 * nombre asignado o contenido semántico del encargo/tarea.
 */
export function projectGroupOf(session: SessionInfo, routine: { type: string } | null): ProjectGroup {
  if (routine) return RUTINAS_GROUP;

  const path = (session.path || "").toLowerCase();
  const cwd = (session.cwd || "").toLowerCase();
  const name = (session.name || "").trim();
  const first = session.firstMessage || "";
  const firstLower = first.toLowerCase();

  // 1. Detección directa por bot o workspace específico de FaceSearch
  if (
    path.includes("rg-facesearch-bot") ||
    cwd.includes("/facesearch") ||
    path.includes("/facesearch") ||
    cwd.includes("facesearch.app")
  ) {
    return PROJECT_META.facesearch;
  }
  if (cwd.includes("/workspaces/viralmerch") || path.includes("/viralmerch")) return PROJECT_META.viralmerch;
  if (cwd.includes("/workspaces/storylater") || path.includes("/storylater")) return PROJECT_META.storylater;
  if (cwd.includes("/workspaces/rgsaura")) return PROJECT_META.rgsaura;

  // 2. Detección por workspaces y worktrees
  if (cwd.includes("/workspaces/")) {
    const parts = cwd.split("/workspaces/")[1].split("/").filter(Boolean);
    const sub = parts[0] || "";
    if (sub.startsWith("facesearch")) return PROJECT_META.facesearch;
    if (sub.startsWith("exohuman-ui") || sub === "piweb" || sub.startsWith("wt-")) return PROJECT_META["exohuman-ui"];
    if (sub.startsWith("exohuman")) return PROJECT_META.exohuman;
    if (sub.startsWith("viralmerch")) return PROJECT_META.viralmerch;
    if (sub.startsWith("storylater")) return PROJECT_META.storylater;
    if (sub.startsWith("rgsaura")) return PROJECT_META.rgsaura;
  }

  // 3. Si el nombre explícito es FaceSearch (y no es desarrollo de la UI en sí)
  if (name === "FaceSearch" || name.toLowerCase().startsWith("facesearch")) {
    if (!cwd.includes("/workspaces/exohuman-ui") && !cwd.includes("/wt-")) {
      return PROJECT_META.facesearch;
    }
  }

  // 4. Contenido semántico del primer mensaje (encargos o temas focalizados)
  if (/\b(facesearch|face search)\b/i.test(firstLower) && !cwd.includes("/workspaces/exohuman-ui") && !cwd.includes("/wt-")) {
    return PROJECT_META.facesearch;
  }
  if (/\b(viralmerch)\b/i.test(firstLower)) return PROJECT_META.viralmerch;
  if (/\b(storylater)\b/i.test(firstLower)) return PROJECT_META.storylater;
  if (/\b(herradura|buceo)\b/i.test(firstLower)) return PROJECT_META.herradura;
  if (/\b(wallapop)\b/i.test(firstLower) && !path.includes("/routines/")) return PROJECT_META.wallapop;
  if (/\b(proxmox|ct126|backup r2|fstrim)\b/i.test(firstLower)) return PROJECT_META.infra;
  if (/\b(rg-proposal|propuestas|decisiones)\b/i.test(firstLower)) return PROJECT_META.decisiones;

  if (session.cwd === "/home/rgsaura/memory") {
    return { key: "memory", label: "Memoria EXO", emoji: "🧠", description: "Ontología personal y baúles de memoria" };
  }

  return PERSONAL_GROUP;
}


interface Row {
  session: SessionInfo;
  id: string;
  title: string;
  kind: Kind;
  encargoCode?: string;
  routineName?: string;
  /** Proyecto crudo (basename del cwd) — usado por el buscador. */
  project: string;
  /** Sección de proyecto con etiqueta amigable — usada al agrupar. */
  group: ProjectGroup;
  timestamp: number;
  timeLabel: string;
  bucket: "hoy" | "ayer" | "semana" | "mes" | "antes";
}

const ROUTINE_LABELS: Record<string, string> = {
  "morning-brief": "Morning Brief",
  "health-eval": "Health Eval",
  "rot-archive": "ROT Archive",
  "rot-recovery": "ROT Recovery",
  proactive: "Proactiva",
  "social-planner": "Planificador Social",
  "mail-triage": "Triaje de Mail",
  "system-reflection": "Reflexión de Sistema",
  "infra-watchdog": "Watchdog Infra",
  research: "Research",
};

const KIND_CHIP: { id: ChipId; label: string; emoji: string }[] = [
  { id: "todo", label: "Todo", emoji: "🗂️" },
  { id: "activas", label: "En Vivo", emoji: "⚡" },
  { id: "encargo", label: "Encargos", emoji: "🎯" },
  { id: "rutina", label: "Rutinas", emoji: "⏱️" },
  { id: "trabajo", label: "Trabajo", emoji: "🛠️" },
  { id: "personal", label: "Personal", emoji: "🏠" },
];

const BUCKET_LABELS: Record<Row["bucket"], string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Últimos 7 días",
  mes: "Últimos 30 días",
  antes: "Anteriores",
};
const BUCKET_ORDER: Row["bucket"][] = ["hoy", "ayer", "semana", "mes", "antes"];

function routineInfo(session: SessionInfo): { type: string; label: string } | null {
  const match = session.path.match(/\/routines\/sessions\/([^/]+)/);
  if (!match) return null;
  const type = match[1];
  return { type, label: ROUTINE_LABELS[type] ?? type };
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^\[Nota de voz(?:\s+de\s+Rodrigo)?\]\s*/i, "")
    .replace(/^#\s*[^\n]+\n+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEncargo(first: string): { code?: string; title: string } | null {
  const enc = first.match(/ENCARGO\s+OFICIAL\s*\(([^)]+)\)\s*:\s*([^\n\r]+)/i);
  if (enc) {
    return { code: enc[1], title: cleanTitle(enc[2]).slice(0, 110) };
  }
  if (/\brg-encargo\b/i.test(first)) {
    return { title: cleanTitle(first).slice(0, 110) };
  }
  return null;
}

function projectOf(session: SessionInfo, routine: { type: string } | null): string {
  if (routine) return routine.type;
  const cwd = session.cwd || "";
  if (cwd.includes("/workspaces/")) {
    const rest = cwd.split("/workspaces/")[1];
    return rest ? rest.split("/")[0] : "workspaces";
  }
  if (cwd === "/home/rgsaura" || cwd === "") return "personal";
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function timeLabel(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return "ahora";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  const d = new Date(ts);
  const now2 = new Date(now);
  if (d.toDateString() === now2.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * 86_400_000) {
    return d.toLocaleDateString([], { weekday: "short" }).replace(".", "");
  }
  return d.toLocaleDateString([], { day: "numeric", month: "short" }).replace(".", "");
}

function bucketOf(ts: number, now: number): Row["bucket"] {
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= startOfToday) return "hoy";
  if (ts >= startOfToday - 86_400_000) return "ayer";
  if (ts >= startOfToday - 7 * 86_400_000) return "semana";
  if (ts >= startOfToday - 30 * 86_400_000) return "mes";
  return "antes";
}

export function buildRow(session: SessionInfo, now: number): Row {
  const first = session.firstMessage || "";
  const routine = routineInfo(session);
  const encargo = routine ? null : parseEncargo(first);

  let kind: Kind = "personal";
  if (routine) kind = "rutina";
  else if (encargo) kind = "encargo";
  else if ((session.cwd || "").includes("/workspaces/")) kind = "trabajo";

  const name = session.name && session.name !== "Asistente" ? session.name.trim() : "";
  let title: string;
  if (encargo) {
    title = encargo.title;
  } else if (routine) {
    title = `Rutina · ${routine.label}`;
  } else if (name && (name !== "FaceSearch" || !first || first.trim() === "/start")) {
    title = name;
  } else {
    // Si la sesión se llama genéricamente "FaceSearch" pero tiene un prompt de tarea real,
    // mostrar el contenido de la tarea en vez del mero nombre repetido
    title = cleanTitle(first).slice(0, 110) || name || session.id.slice(0, 8);
  }

  const timestamp = Date.parse(session.modified || session.created || "0") || 0;
  return {
    session,
    id: session.id,
    title,
    kind,
    encargoCode: encargo?.code,
    routineName: routine?.label,
    project: projectOf(session, routine),
    group: projectGroupOf(session, routine),
    timestamp,
    timeLabel: timeLabel(timestamp, now),
    bucket: bucketOf(timestamp, now),
  };
}

export const SessionsExplorer = forwardRef<SessionsExplorerHandle, SessionsExplorerProps>(
  function SessionsExplorer(
    {
      sessions,
      selectedSessionId,
      runningSessionIds,
      awaitingInputSessionIds,
      unreadSessionIds,
      archivedIds,
      pinnedIds,
      familyOf,
      onSelectSession,
      onReload,
      onSearchFocusChange,
    },
    ref,
  ) {
    const [query, setQuery] = useState("");
    const isMobile = useIsMobile();
    const [chip, setChip] = useState<ChipId>("todo");
    const [view, setView] = useState<ViewMode>("tiempo");
    const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
    const [visibleCount, setVisibleCount] = useState(80);
    const [showArchived, setShowArchived] = useState(false);
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
      showArchived: () => {
        setShowArchived(true);
        // The archived toggle sits at the end of the list: bring it in view
        // on the next paint, once the section has mounted.
        window.requestAnimationFrame(() => {
          listRef.current?.querySelector<HTMLButtonElement>("[data-toggle-archived]")?.scrollIntoView({ block: "end", behavior: "smooth" });
        });
      },
    }));

    // Reloj suave para tiempos relativos (cada minuto).
    useEffect(() => {
      const timer = window.setInterval(() => setNow(Date.now()), 60_000);
      return () => window.clearInterval(timer);
    }, []);

    // Modo de vista y proyectos plegados: se restauran y persisten localmente.
    useEffect(() => {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "tiempo" || stored === "proyectos") setView(stored);
      try {
        const raw = window.localStorage.getItem(COLLAPSED_PROJECTS_KEY);
        if (raw) {
          const list = JSON.parse(raw) as unknown;
          if (Array.isArray(list)) setCollapsedProjects(new Set(list.filter((v): v is string => typeof v === "string")));
        }
      } catch {
        // Preferencias corruptas: se ignoran y se empieza sin plegados.
      }
    }, []);

    useEffect(() => {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }, [view]);

    const toggleProject = useCallback((key: string) => {
      setCollapsedProjects((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        window.localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...next]));
        return next;
      });
    }, []);

    const archived = useMemo(() => archivedIds ?? new Set<string>(), [archivedIds]);
    const pinned = useMemo(() => pinnedIds ?? new Set<string>(), [pinnedIds]);

    const rows = useMemo(() => sessions.map((s) => buildRow(s, now)), [sessions, now]);

    const { active, archivedRows, kindCounts } = useMemo(() => {
      const activeRows: Row[] = [];
      const archRows: Row[] = [];
      const counts: Record<ChipId, number> = { todo: 0, activas: 0, encargo: 0, rutina: 0, trabajo: 0, personal: 0 };
      for (const row of rows) {
        counts.todo += 1;
        counts[row.kind] += 1;
        if (runningSessionIds?.has(row.id)) counts.activas += 1;
        (archived.has(row.id) ? archRows : activeRows).push(row);
      }
      activeRows.sort((a, b) => b.timestamp - a.timestamp);
      archRows.sort((a, b) => b.timestamp - a.timestamp);
      return { active: activeRows, archivedRows: archRows, kindCounts: counts };
    }, [rows, archived, runningSessionIds]);

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return active.filter((row) => {
        if (chip === "activas") {
          const isRunning = runningSessionIds?.has(row.id) ?? false;
          if (!isRunning) return false;
        } else if (chip !== "todo" && row.kind !== chip) {
          return false;
        }
        if (!q) return true;
        return (
          row.title.toLowerCase().includes(q)
          || row.project.toLowerCase().includes(q)
          || (row.encargoCode ?? "").toLowerCase().includes(q)
          || (row.session.firstMessage || "").toLowerCase().includes(q)
          || row.session.id.toLowerCase().includes(q)
        );
      });
    }, [active, chip, query, runningSessionIds]);

    // Reinicia la paginación al cambiar el filtro.
    useEffect(() => {
      setVisibleCount(80);
    }, [query, chip]);

    const shown = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

    const sections = useMemo(() => {
      const byBucket = new Map<Row["bucket"], Row[]>();
      for (const row of shown) {
        const list = byBucket.get(row.bucket);
        if (list) list.push(row);
        else byBucket.set(row.bucket, [row]);
      }
      const pinnedFirst: Row[] = [];
      const rest = new Map<Row["bucket"], Row[]>();
      for (const bucket of BUCKET_ORDER) {
        const list = byBucket.get(bucket);
        if (!list) continue;
        const pins = list.filter((row) => pinned.has(row.id));
        const others = list.filter((row) => !pinned.has(row.id));
        if (pins.length) pinnedFirst.push(...pins);
        if (others.length) rest.set(bucket, others);
      }
      return { pinnedFirst, rest };
    }, [shown, pinned]);

    // Secciones por proyecto: ordenadas por actividad reciente; dentro,
    // fijadas primero y luego cronología. Con buscando activo se despliegan todas.
    const projectSections = useMemo(() => {
      const map = new Map<string, { group: ProjectGroup; rows: Row[]; last: number; running: boolean }>();
      for (const row of shown) {
        let entry = map.get(row.group.key);
        if (!entry) {
          entry = { group: row.group, rows: [], last: 0, running: false };
          map.set(row.group.key, entry);
        }
        entry.rows.push(row);
        entry.last = Math.max(entry.last, row.timestamp);
        if (runningSessionIds?.has(row.id)) entry.running = true;
      }
      const list = [...map.values()];
      list.sort((a, b) => b.last - a.last);
      for (const entry of list) {
        entry.rows.sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || b.timestamp - a.timestamp);
      }
      return list;
    }, [shown, pinned, runningSessionIds]);


    const searching = query.trim().length > 0;
    const effectiveCollapsed = searching ? new Set<string>() : collapsedProjects;

    // Carga automática al acercarse al final.
    useEffect(() => {
      const node = sentinelRef.current;
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setVisibleCount((count) => (count < filtered.length ? count + 80 : count));
          }
        },
        { rootMargin: "300px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [filtered.length]);

    // Cerrar menú con Escape o clic fuera.
    useEffect(() => {
      if (!menuFor) return;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setMenuFor(null);
          setMenuPos(null);
          setConfirmDelete(false);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [menuFor]);

    useEffect(() => {
      if (renamingId) {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }
    }, [renamingId]);

    const closeMenu = useCallback(() => {
      setMenuFor(null);
      setMenuPos(null);
      setConfirmDelete(false);
    }, []);

    const openMenu = useCallback((row: Row, anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect();
      setMenuFor(row.id);
      setConfirmDelete(false);
      setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 190) });
    }, []);

    const sessionLink = useCallback((id: string) => {
      const { origin, pathname } = window.location;
      return `${origin}${pathname}?session=${id}`;
    }, []);

    const runAction = useCallback(
      async (action: () => Promise<void>) => {
        setBusyId(menuFor);
        closeMenu();
        try {
          await action();
          onReload?.();
        } catch (error) {
          console.error("SessionsExplorer action failed:", error);
        } finally {
          setBusyId(null);
        }
      },
      [menuFor, closeMenu, onReload],
    );

    const menuRow = menuFor ? filtered.find((row) => row.id === menuFor) ?? archivedRows.find((row) => row.id === menuFor) : undefined;
    const menuFamily = menuRow && familyOf ? familyOf(menuRow.id) : undefined;
    const isArchived = menuRow ? archived.has(menuRow.id) : false;
    const isPinned = menuRow ? pinned.has(menuRow.id) : false;
    const isRunning = menuRow ? runningSessionIds?.has(menuRow.id) ?? false : false;

    const commitRename = useCallback(
      async (row: Row) => {
        const name = renameValue.trim();
        setRenamingId(null);
        if (!name || name === row.session.name) return;
        setBusyId(row.id);
        try {
          const res = await fetch(`/api/sessions/${encodeURIComponent(row.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          if (!res.ok) throw new Error(`PATCH ${res.status}`);
          onReload?.();
        } catch (error) {
          console.error("rename failed:", error);
        } finally {
          setBusyId(null);
        }
      },
      [renameValue, onReload],
    );

    const renderRow = (row: Row) => {
      const selected = row.id === selectedSessionId;
      const running = runningSessionIds?.has(row.id) ?? false;
      const awaiting = awaitingInputSessionIds?.has(row.id) ?? false;
      const unread = unreadSessionIds?.has(row.id) ?? false;
      const isPinnedRow = pinned.has(row.id);
      const renaming = renamingId === row.id;
      const busy = busyId === row.id;

      return (
        <div key={row.id} data-session-id={row.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectSession(row.session)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectSession(row.session);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 8px 7px 10px",
              borderRadius: 8,
              cursor: "pointer",
              minHeight: 44,
              background: selected ? "var(--bg-selected)" : "transparent",
              color: selected ? "var(--accent)" : "var(--text)",
              opacity: busy ? 0.5 : 1,
              transition: "background 0.1s ease",
            }}
            onMouseEnter={(event) => {
              if (!selected) event.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(event) => {
              if (!selected) event.currentTarget.style.background = "transparent";
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                {running && (
                  <span
                    data-running-dot=""
                    title="En ejecución"
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", flexShrink: 0, animation: "pulse 1.6s ease-in-out infinite" }}
                  />
                )}
                {awaiting && !running && (
                  <span
                    title="Esperando tu respuesta"
                    style={{ width: 7, height: 7, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }}
                  />
                )}
                {unread && !running && !awaiting && (
                  <span title="Novedades sin leer" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                )}
                {isPinnedRow && <span title="Fijada" style={{ fontSize: 9, lineHeight: 1, flexShrink: 0 }}>📌</span>}
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: selected ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                  title={row.title}
                >
                  {row.title}
                </span>
                {row.encargoCode && (
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: "var(--text-dim)",
                      background: "var(--bg-selected)",
                      borderRadius: 999,
                      padding: "1px 6px",
                      flexShrink: 0,
                      maxWidth: 110,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={`Encargo ${row.encargoCode}`}
                  >
                    {row.encargoCode}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                  <span aria-hidden="true" style={{ fontSize: 9.5 }}>{row.group.emoji}</span> {row.group.label}
                  {row.session.isWorktree && row.session.branch ? <span style={{ opacity: 0.7 }}> · {row.session.branch.replace(/^fork\//, "")}</span> : null}
                </span>
                <span>·</span>
                <span style={{ flexShrink: 0 }} data-time={row.timeLabel}>{row.timeLabel}</span>
              </div>
            </div>
            <button
              type="button"
              aria-label={`Acciones de ${row.title}`}
              aria-haspopup="menu"
              aria-expanded={menuFor === row.id}
              onClick={(event) => {
                event.stopPropagation();
                if (menuFor === row.id) closeMenu();
                else openMenu(row, event.currentTarget);
              }}
              style={{
                flexShrink: 0,
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                borderRadius: 6,
                background: menuFor === row.id ? "var(--bg-selected)" : "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              ⋮
            </button>
          </div>

          {renaming && (
            <div style={{ display: "flex", gap: 6, padding: "4px 8px 8px 10px", alignItems: "center" }}>
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                maxLength={120}
                aria-label="Nuevo nombre de la sesión"
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) void commitRename(row);
                  if (event.key === "Escape") setRenamingId(null);
                }}
                style={{
                  flex: 1,
                  padding: "6px 9px",
                  borderRadius: 6,
                  border: "1px solid var(--accent)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => void commitRename(row)}
                style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      );
    };

    const renderSection = (label: string, items: Row[], extra?: ReactNode) =>
      items.length === 0 && !extra ? null : (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px 3px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-dim)" }}>
            <span>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: "var(--bg-selected)", color: "var(--text-muted)", padding: "1px 7px", borderRadius: 999 }}>{items.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {items.map((row) => renderRow(row))}
            {extra}
          </div>
        </div>
      );

    const renderProjectSection = (entry: { group: ProjectGroup; rows: Row[]; last: number; running: boolean }) => {
      const collapsed = effectiveCollapsed.has(entry.group.key);
      return (
        <div key={entry.group.key} data-project-group={entry.group.key} style={{ marginBottom: 10 }}>
          <button
            type="button"
            data-project-header={entry.group.key}
            aria-expanded={!collapsed}
            onClick={() => toggleProject(entry.group.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              width: "100%",
              padding: "6px 10px 4px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              color: "var(--text)",
              minHeight: 30,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 9, color: "var(--text-dim)", width: 10, flexShrink: 0 }}>{collapsed ? "▸" : "▾"}</span>
            <span aria-hidden="true" style={{ fontSize: 13, flexShrink: 0 }}>{entry.group.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.group.label}
                </span>
                {entry.running && (
                  <span title="Sesión en ejecución activa" style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", flexShrink: 0, animation: "pulse 1.6s ease-in-out infinite" }} />
                )}
              </div>
              {entry.group.description && (
                <div style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.group.description}
                </div>
              )}
            </div>
            <span style={{ fontSize: 9.5, color: "var(--text-dim)", flexShrink: 0 }}>{timeLabel(entry.last, now)}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: "var(--bg-selected)", color: "var(--text-muted)", padding: "1px 7px", borderRadius: 999, flexShrink: 0 }}>{entry.rows.length}</span>
          </button>
          {!collapsed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {entry.rows.map((row) => renderRow(row))}
            </div>
          )}
        </div>
      );
    };

    const q = query.trim();
    const archivedShown = showArchived
      ? archivedRows.filter((row) => !q || row.title.toLowerCase().includes(q.toLowerCase()) || row.project.toLowerCase().includes(q.toLowerCase()))
      : [];

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          background: "var(--bg-panel)",
          color: "var(--text)",
        }}
      >
        {/* Buscador + chips: fijos arriba de la lista */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 3,
            background: "var(--bg-panel)",
            borderBottom: "1px solid var(--border)",
            paddingBottom: 6,
          }}
        >
          <div style={{ padding: "7px 10px 5px", position: "relative" }}>
            <span
              aria-hidden="true"
              style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", fontSize: 12, pointerEvents: "none" }}
            >
              🔍
            </span>
            <input
              ref={searchInputRef}
              id="session-search-input"
              type="search"
              data-session-filter="true"
              value={query}
              maxLength={120}
              aria-label="Buscar sesiones, encargos y proyectos"
              placeholder="Buscar…"
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => onSearchFocusChange?.(true)}
              onBlur={() => onSearchFocusChange?.(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.stopPropagation();
                  if (query) setQuery("");
                  else searchInputRef.current?.blur();
                }
              }}
              style={{
                width: "100%",
                padding: "7px 26px 7px 30px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 12.5,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                style={{
                  position: "absolute",
                  right: 18,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: 4,
                }}
              >
                ×
              </button>
            )}
          </div>
          {/* Selector de modo de vista (variaciones de secciones) */}
          <div role="group" aria-label="Modo de vista de sesiones" style={{ display: "flex", gap: 4, padding: "5px 10px 4px" }}>
            {VIEW_MODES.map((mode) => {
              const active = view === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  data-view-mode={mode.id}
                  aria-pressed={active}
                  title={mode.hint}
                  onClick={() => setView(mode.id)}
                  style={{
                    flex: 1,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    padding: isMobile ? "9px 6px" : "5px 6px",
                    minHeight: isMobile ? 40 : 28,
                    borderRadius: 8,
                    border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                    background: active ? "var(--bg-selected)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.12s ease",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 10 }}>{mode.emoji}</span>
                  {mode.label}
                </button>
              );
            })}
          </div>
          <div
            role="group"
            aria-label="Filtro rápido de sesiones"
            style={{ display: "flex", gap: 5, padding: "0 10px", overflowX: "auto", scrollbarWidth: "none" }}
          >
            {KIND_CHIP.map((entry) => {
              const activeChip = chip === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-chip={entry.id}
                  aria-pressed={activeChip}
                  onClick={() => setChip(entry.id)}
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: isMobile ? "9px 12px" : "4px 10px",
                    minHeight: isMobile ? 40 : 28,
                    borderRadius: 999,
                    border: `1px solid ${activeChip ? "transparent" : "var(--border)"}`,
                    background: activeChip ? "var(--accent)" : "transparent",
                    color: activeChip ? "#ffffff" : "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: activeChip ? 700 : 500,
                    cursor: "pointer",
                    transition: "all 0.12s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 10 }}>{entry.emoji}</span>
                  {entry.label}
                  <span style={{ fontSize: 9.5, opacity: 0.75 }}>{kindCounts[entry.id]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lista cronológica */}
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 4px 10px" }} className="scrollbar-subtle">
          {q && (
            <div style={{ padding: "2px 10px 8px", fontSize: 11, color: "var(--text-dim)" }}>
              {filtered.length === 0 ? "Sin resultados" : `${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`} para «{q}»
            </div>
          )}

          {view === "tiempo" && sections.pinnedFirst.length > 0 && renderSection("📌 Fijadas", sections.pinnedFirst)}

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-dim)", fontSize: 12.5 }}>
              Sin sesiones todavía.
              <br />
              Crea una con el botón <strong style={{ color: "var(--text)" }}>+</strong> de arriba.
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--text-dim)", fontSize: 12.5 }}>
              {chip !== "todo" || q ? "Nada que coincida con el filtro." : "Sin sesiones."}
              {(q || chip !== "todo") && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setChip("todo");
                    }}
                    style={{
                      marginTop: 10,
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Limpiar filtro
                  </button>
                </div>
              )}
            </div>
          ) : view === "proyectos" ? (
            projectSections.map((entry) => renderProjectSection(entry))
          ) : (
            BUCKET_ORDER.map((bucket) => {
              const items = sections.rest.get(bucket) ?? [];
              return renderSection(BUCKET_LABELS[bucket], items);
            })
          )}

          {filtered.length > visibleCount && (
            <div ref={sentinelRef} style={{ padding: "10px 0 4px", textAlign: "center" }}>
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 80)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                Mostrar más ({filtered.length - visibleCount} restantes)
              </button>
            </div>
          )}

          {archivedRows.length > 0 && (
            <div style={{ marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8, textAlign: "center" }}>
              <button
                type="button"
                data-toggle-archived="true"
                onClick={() => setShowArchived((open) => !open)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-dim)",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {showArchived ? "▲ Ocultar archivadas" : `▼ Archivadas (${archivedRows.length})`}
              </button>
            </div>
          )}

          {showArchived && (
            <div style={{ paddingTop: 6 }}>
              {archivedShown.length === 0 ? (
                <div style={{ textAlign: "center", padding: "10px", color: "var(--text-dim)", fontSize: 11.5 }}>Sin archivadas que coincidan</div>
              ) : (
                renderSection("Archivadas", archivedShown)
              )}
            </div>
          )}
        </div>

        {/* Menú de acciones (popover fijo, por encima de todo) */}
        {menuFor && menuRow && menuPos && (
          <>
            <div
              onClick={closeMenu}
              style={{ position: "fixed", inset: 0, zIndex: 40, background: "transparent" }}
              aria-hidden="true"
            />
            <div
              role="menu"
              aria-label={`Acciones de ${menuRow.title}`}
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                zIndex: 41,
                minWidth: 190,
                padding: "4px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
              }}
            >
              {[
                {
                  id: "open-tab",
                  label: "Abrir en pestaña nueva",
                  icon: "↗",
                  run: () => {
                    window.open(sessionLink(menuRow.id), "_blank", "noopener");
                    closeMenu();
                  },
                },
                {
                  id: "copy-link",
                  label: "Copiar enlace",
                  icon: "🔗",
                  run: () => {
                    void navigator.clipboard?.writeText(sessionLink(menuRow.id)).catch(() => {});
                    closeMenu();
                  },
                },
                {
                  id: "rename",
                  label: "Renombrar…",
                  icon: "✏️",
                  run: () => {
                    setRenamingId(menuRow.id);
                    setRenameValue(menuRow.session.name && menuRow.session.name !== "Asistente" ? menuRow.session.name : menuRow.title);
                    closeMenu();
                  },
                },
                ...(familyOf && menuFamily
                  ? [
                      {
                        id: "pin",
                        label: isPinned ? "Quitar de fijadas" : "Fijar arriba",
                        icon: "📌",
                        disabled: isArchived,
                        run: () =>
                          void runAction(async () => {
                            const res = await fetch("/api/sessions/ui-state", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "set", ids: [menuFamily.rootId], pinned: !isPinned }),
                            });
                            if (!res.ok) throw new Error(`ui-state ${res.status}`);
                          }),
                      },
                      {
                        id: "archive",
                        label: isArchived ? "Desarchivar" : "Archivar",
                        icon: isArchived ? "📂" : "🗄️",
                        disabled: isArchived ? false : isRunning,
                        disabledReason: isRunning ? "En ejecución: espera a que termine" : undefined,
                        run: () =>
                          void runAction(async () => {
                            const res = await fetch("/api/sessions/ui-state", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ action: "set", ids: menuFamily.ids, archived: !isArchived }),
                            });
                            if (!res.ok) throw new Error(`ui-state ${res.status}`);
                          }),
                      },
                      { id: "sep", label: "", icon: "", run: () => {} },
                      {
                        id: "delete",
                        label: confirmDelete ? "¿Seguro? Sí, borrar" : "Borrar…",
                        icon: "🗑️",
                        danger: true,
                        disabled: false,
                        run: () => {
                          if (!confirmDelete) {
                            setConfirmDelete(true);
                            return;
                          }
                          void runAction(async () => {
                            const res = await fetch("/api/sessions/delete", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ ids: menuFamily.ids }),
                            });
                            if (!res.ok) throw new Error(`delete ${res.status}`);
                          });
                        },
                      },
                    ]
                  : []),
              ].map((item) => {
                if (item.id === "sep") {
                  return <div key="sep" style={{ height: 1, background: "var(--border)", margin: "4px 6px" }} />;
                }
                const entry = item as { id: string; label: string; icon: string; run: () => void; disabled?: boolean; disabledReason?: string; danger?: boolean };
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    data-menu-action={entry.id}
                    disabled={entry.disabled}
                    title={entry.disabledReason}
                    onClick={entry.run}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 7,
                      border: "none",
                      background: "transparent",
                      color: entry.disabled ? "var(--text-dim)" : entry.danger ? "#ef4444" : "var(--text)",
                      fontSize: 12,
                      fontWeight: entry.danger ? 600 : 400,
                      cursor: entry.disabled ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(event) => {
                      if (!entry.disabled) event.currentTarget.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 14, textAlign: "center", fontSize: 11 }}>{entry.icon.trim()}</span>
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  },
);
