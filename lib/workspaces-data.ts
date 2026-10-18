/**
 * The Workspaces view's model: what the per-workspace workspace.json files
 * under ~/.local/state/workspaces-active hold, normalized for the sidebar.
 * The files are written by EXO agents (Spanish category and status words
 * included), so the normalization is tolerant: unknown values fall back, and
 * a missing status is inferred (a title that says it is closed means done).
 */

/** A workspace's life-cycle state, as the sidebar shows it. */
export type WorkspaceStatus = "active" | "done" | "pending";

/** The sidebar's grouping of workspaces. */
export type WorkspaceCategory = "proyecto" | "temporal" | "rutina" | "otro";

export interface WorkspacePhase {
  name: string;
  status: WorkspaceStatus;
}

/** One workspace.json, as /api/workspaces serves it. */
export interface WorkspaceSummary {
  id: string;
  title: string;
  category: WorkspaceCategory;
  status: WorkspaceStatus;
  /** ISO date, when the file has one. */
  createdAt: string | null;
  /** ISO date of the file's last write. */
  updatedAt: string | null;
  phases: WorkspacePhase[];
  nextSteps: string[];
  /** A directory to open a session in, when one is known (a cwd field, or ~/workspaces/<id>). */
  cwd: string | null;
}

/** The raw JSON of a workspace.json (any field may be missing or of any type). */
export type WorkspaceRecordInput = Record<string, unknown>;

const CATEGORY_SYNONYMS: Record<string, WorkspaceCategory> = {
  proyecto: "proyecto",
  proyectos: "proyecto",
  project: "proyecto",
  temporal: "temporal",
  temporales: "temporal",
  temp: "temporal",
  rutina: "rutina",
  rutinas: "rutina",
  routine: "rutina",
};

const STATUS_SYNONYMS: Record<string, WorkspaceStatus> = {
  active: "active",
  activo: "active",
  activa: "active",
  running: "active",
  en_curso: "active",
  done: "done",
  terminado: "done",
  terminada: "done",
  finished: "done",
  completed: "done",
  closed: "done",
  cerrado: "done",
  pending: "pending",
  pendiente: "pending",
  blocked: "pending",
  waiting: "pending",
  paused: "pending",
};

/** The display order of the sidebar's groups. */
export const WORKSPACE_CATEGORY_ORDER: readonly WorkspaceCategory[] = ["proyecto", "temporal", "rutina", "otro"];

/** A group's label, in the sidebar's Spanish. */
export const WORKSPACE_CATEGORY_LABELS: Record<WorkspaceCategory, string> = {
  proyecto: "Proyectos",
  temporal: "Temporales",
  rutina: "Rutinas",
  otro: "Otros",
};

/** A status's label, in the sidebar's Spanish. */
export const WORKSPACE_STATUS_LABELS: Record<WorkspaceStatus, string> = {
  active: "Activo",
  done: "Terminado",
  pending: "Pendiente",
};

function asRecord(value: unknown): WorkspaceRecordInput | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as WorkspaceRecordInput;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeWorkspaceCategory(raw: unknown): WorkspaceCategory {
  const key = asString(raw)?.toLowerCase().replace(/\s+/g, "_");
  if (!key) return "otro";
  return CATEGORY_SYNONYMS[key] ?? "otro";
}

/** A missing status defaults to active (the folder is workspaces-active); a title that says it is closed means done. */
export function normalizeWorkspaceStatus(raw: unknown, title: string | null): WorkspaceStatus {
  const key = asString(raw)?.toLowerCase().replace(/\s+/g, "_");
  if (key) {
    const known = STATUS_SYNONYMS[key];
    if (known) return known;
  }
  const lowered = (title ?? "").toLowerCase();
  if (/\(cerrad[oa]\)|\(finalizad[oa]\)|\(completad[oa]\)|\[cerrad[oa]\]/.test(lowered)) return "done";
  return "active";
}

function normalizePhases(raw: unknown): WorkspacePhase[] {
  // EXO's files hold a record keyed by phase name; an array of named
  // phases is accepted too.
  if (Array.isArray(raw)) {
    const phases: WorkspacePhase[] = [];
    for (const entry of raw) {
      const record = asRecord(entry);
      const name = record ? asString(record.name ?? record.title ?? record.id) : null;
      if (!name) continue;
      phases.push({ name, status: normalizeWorkspaceStatus(record?.status, null) });
    }
    return phases;
  }
  const record = asRecord(raw);
  if (!record) return [];
  const phases: WorkspacePhase[] = [];
  for (const [name, value] of Object.entries(record)) {
    const detail = asRecord(value);
    phases.push({ name, status: normalizeWorkspaceStatus(detail?.status, null) });
  }
  return phases;
}

function normalizeNextSteps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((step) => asString(step)).filter((step): step is string => step !== null);
}

function normalizeDate(raw: unknown): string | null {
  const value = asString(raw);
  if (!value) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/**
 * One workspace.json into a WorkspaceSummary. `id` falls back to the folder
 * name; the title falls back to the id. `cwd` is the record's cwd/path/dir
 * field when present, else the given `fallbackCwd` (~/workspaces/<id> when
 * that directory exists; the route decides).
 */
export function normalizeWorkspace(
  id: string,
  record: WorkspaceRecordInput | null,
  updatedAt: string | null,
  fallbackCwd: string | null,
): WorkspaceSummary {
  const recordId = record ? asString(record.id) : null;
  const finalId = recordId ?? id;
  const title = (record ? asString(record.title) ?? asString(record.name) : null) ?? finalId;
  return {
    id: finalId,
    title,
    category: normalizeWorkspaceCategory(record?.category),
    status: normalizeWorkspaceStatus(record?.status, title),
    createdAt: normalizeDate(record?.created_at ?? record?.createdAt),
    updatedAt,
    phases: normalizePhases(record?.phases),
    nextSteps: normalizeNextSteps(record?.next_steps ?? record?.nextSteps),
    cwd: (record ? asString(record.cwd) ?? asString(record.path) ?? asString(record.dir) : null) ?? fallbackCwd,
  };
}

export interface WorkspaceGroup {
  category: WorkspaceCategory;
  label: string;
  workspaces: WorkspaceSummary[];
}

/**
 * Workspaces grouped by category in the sidebar's order (proyectos,
 * temporales, rutinas, otros), each group's workspaces newest first by
 * updatedAt (a missing date last).
 */
export function groupWorkspaces(workspaces: readonly WorkspaceSummary[]): WorkspaceGroup[] {
  const byCategory = new Map<WorkspaceCategory, WorkspaceSummary[]>();
  for (const workspace of workspaces) {
    const list = byCategory.get(workspace.category);
    if (list) list.push(workspace);
    else byCategory.set(workspace.category, [workspace]);
  }
  return WORKSPACE_CATEGORY_ORDER
    .filter((category) => byCategory.has(category))
    .map((category) => ({
      category,
      label: WORKSPACE_CATEGORY_LABELS[category],
      workspaces: (byCategory.get(category) ?? []).sort((a, b) => {
        const aTime = a.updatedAt ? Date.parse(a.updatedAt) : Number.NaN;
        const bTime = b.updatedAt ? Date.parse(b.updatedAt) : Number.NaN;
        if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
        if (Number.isFinite(aTime)) return -1;
        if (Number.isFinite(bTime)) return 1;
        return a.id.localeCompare(b.id);
      }),
    }));
}

/**
 * A Spanish "hace 5 min" style age for an ISO date: "ahora" under a minute,
 * "hace N min" under an hour, "hace N h" under a day, else "hace N d".
 * A missing or future date gives null (the caller shows nothing).
 */
export function formatWorkspaceAge(iso: string | null, now: number): string | null {
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
