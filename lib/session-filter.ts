import type { SessionInfo } from "./types";
import { isSessionActiveNow } from "./session-activity";

export type SessionSortMode = "recent" | "name" | "messages" | "project";
export type SessionFilterCategory = "all" | "working" | "ui" | "facesearch" | "comms" | "infra" | "rutinas" | "planes" | "otros";

export interface SessionFilterCriteria {
  activeNowOnly: boolean;
  category: SessionFilterCategory;
  searchQuery: string;
  sortMode: SessionSortMode;
}

/**
 * Infers category and metadata from a SessionInfo
 */
export function inferSessionCategory(session: SessionInfo): {
  category: SessionFilterCategory;
  label: string;
  icon: string;
  color: string;
} {
  // Routing metadata (spawn registry) is exact; keyword matching below is the
  // fallback for sessions spawned before it existed or outside EXO routing.
  const routedProject = session.routing?.project;
  if (routedProject === "facesearch") {
    return { category: "facesearch", label: "FaceSearch", icon: "🔍", color: "#38bdf8" };
  }
  if (routedProject === "exohuman-ui") {
    return { category: "ui", label: "UI / Frontend", icon: "🎨", color: "#a855f7" };
  }
  const text = `${session.cwd || ""} ${session.name || ""} ${session.firstMessage || ""}`.toLowerCase();

  if (text.includes("facesearch")) {
    return { category: "facesearch", label: "FaceSearch", icon: "🔍", color: "#38bdf8" };
  }
  if (text.includes("exohuman-ui") || text.includes("piweb") || text.includes("ui") || text.includes("frontend")) {
    return { category: "ui", label: "UI / Frontend", icon: "🎨", color: "#a855f7" };
  }
  if (text.includes("beeper") || text.includes("telegram") || text.includes("rot") || text.includes("correo") || text.includes("comms")) {
    return { category: "comms", label: "Comunicaciones", icon: "💬", color: "#10b981" };
  }
  if (text.includes("infra") || text.includes("proxmox") || text.includes("pve") || text.includes("governor") || text.includes("token")) {
    return { category: "infra", label: "Infra & Sistema", icon: "⚙️", color: "#eab308" };
  }
  if (text.includes("planes") || text.includes("ocio") || text.includes("concierto") || text.includes("agenda")) {
    return { category: "planes", label: "Planes & Agenda", icon: "🗓️", color: "#f97316" };
  }
  if (text.includes("rutina") || text.includes("brief") || session.cwd?.includes("/routines/")) {
    return { category: "rutinas", label: "Rutinas", icon: "⏱️", color: "#14b8a6" };
  }

  return { category: "otros", label: "General", icon: "⚡", color: "var(--accent)" };
}

/**
 * Filter sessions according to criteria
 */
export function filterAndSortSessions(
  sessions: readonly SessionInfo[],
  criteria: SessionFilterCriteria,
  nowMs: number,
  runningIds: ReadonlySet<string>,
  awaitingIds: ReadonlySet<string>,
): SessionInfo[] {
  let list = [...sessions];

  // 1. Activas ahora
  if (criteria.activeNowOnly) {
    list = list.filter((session) => isSessionActiveNow(session, nowMs, runningIds, awaitingIds));
  }

  // 2. Filtro de Categoría / Estado
  if (criteria.category === "working") {
    list = list.filter((s) => runningIds.has(s.id) || awaitingIds.has(s.id));
  } else if (criteria.category !== "all") {
    list = list.filter((s) => inferSessionCategory(s).category === criteria.category);
  }

  // 3. Búsqueda de texto
  if (criteria.searchQuery.trim()) {
    const q = criteria.searchQuery.trim().toLowerCase();
    list = list.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const first = (s.firstMessage || "").toLowerCase();
      const cwd = (s.cwd || "").toLowerCase();
      const id = s.id.toLowerCase();
      return name.includes(q) || first.includes(q) || cwd.includes(q) || id.includes(q);
    });
  }

  // 4. Ordenación
  list.sort((a, b) => {
    switch (criteria.sortMode) {
      case "recent": {
        const timeA = Date.parse(a.modified) || 0;
        const timeB = Date.parse(b.modified) || 0;
        return timeB - timeA;
      }
      case "name": {
        const nameA = (a.name || a.firstMessage || a.id).toLowerCase();
        const nameB = (b.name || b.firstMessage || b.id).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      case "messages": {
        return (b.messageCount || 0) - (a.messageCount || 0);
      }
      case "project": {
        const projA = (a.projectRoot || a.cwd || "").toLowerCase();
        const projB = (b.projectRoot || b.cwd || "").toLowerCase();
        return projA.localeCompare(projB) || (Date.parse(b.modified) || 0) - (Date.parse(a.modified) || 0);
      }
      default:
        return 0;
    }
  });

  return list;
}
