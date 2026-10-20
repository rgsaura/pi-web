/**
 * Per-browser sidebar preferences: the active tab (sessions or files), the
 * user's explicit project group expand/collapse choices, whether the pinned
 * section is collapsed, whether the files section below the sessions is
 * collapsed, whether the files tab or section lists ignored files, and the
 * folders the worktree listing last found outside git, and the "Secciones
 * del Sistema" section's variant and collapse.
 * Best-effort localStorage, like the other sidebar memories: privacy mode or
 * quota errors fall back to defaults.
 */

const SIDEBAR_TAB_STORAGE_KEY = "pi-web:sidebar-tab";
const GROUP_EXPANSION_STORAGE_KEY = "pi-web:sidebar-groups-v2";
/**
 * The group choices before v2. A group that stopped being current was saved
 * there as open, so every project ever visited came back expanded; its
 * `true` entries cannot be told from the user's own, and only its collapses
 * move to v2 (loadGroupExpansion).
 */
const LEGACY_GROUP_EXPANSION_STORAGE_KEY = "pi-web:sidebar-groups";
const PINNED_COLLAPSED_STORAGE_KEY = "pi-web:sidebar-pins-collapsed";
const SHOW_IGNORED_FILES_STORAGE_KEY = "pi-web:sidebar-files-show-ignored";
const FILES_COLLAPSED_STORAGE_KEY = "pi-web:sidebar-files-collapsed";
const NON_GIT_CWDS_STORAGE_KEY = "pi-web:sidebar-non-git-cwds";
/**
 * Keys nothing reads now: the sessions/explorer split's, which the two tabs
 * replaced, and the group choices before v2 (loadGroupExpansion reads them
 * only while v2 is missing).
 */
const RETIRED_STORAGE_KEYS = ["pi-web:file-explorer:open", "pi-web:sidebar-session-pane-height", LEGACY_GROUP_EXPANSION_STORAGE_KEY];

/** Oldest choices are dropped beyond this many project keys. */
const MAX_GROUP_EXPANSION_ENTRIES = 300;
/** Oldest folders are dropped beyond this many. */
const MAX_NON_GIT_CWDS = 50;

export type SidebarTab = "sessions" | "files";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSidebarTab(storage: StorageLike | null = getBrowserStorage()): SidebarTab {
  if (!storage) return "sessions";
  try {
    return storage.getItem(SIDEBAR_TAB_STORAGE_KEY) === "files" ? "files" : "sessions";
  } catch {
    return "sessions";
  }
}

export function saveSidebarTab(tab: SidebarTab, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_TAB_STORAGE_KEY, tab);
  } catch {
    // Persistence is best-effort.
  }
}

/** Only boolean entries survive; "__proto__" is never a project key. */
function cleanGroupExpansion(value: unknown): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, expanded] of Object.entries(value)) {
    if (key === "__proto__" || typeof expanded !== "boolean") continue;
    result[key] = expanded;
  }
  return result;
}

/**
 * The saved group choices. A browser without v2 yet takes the collapses of
 * the old key and saves them as v2 at once, so the old key can go
 * (forgetRetiredSidebarKeys, after this) and is never read again; its
 * expansions are dropped: the defaults (current and pinned projects open)
 * come back once.
 */
export function loadGroupExpansion(storage: StorageLike | null = getBrowserStorage()): Record<string, boolean> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(GROUP_EXPANSION_STORAGE_KEY);
    if (raw !== null) return cleanGroupExpansion(JSON.parse(raw));
  } catch {
    return {};
  }
  let legacy: Record<string, boolean>;
  try {
    const raw = storage.getItem(LEGACY_GROUP_EXPANSION_STORAGE_KEY);
    if (raw === null) return {};
    legacy = cleanGroupExpansion(JSON.parse(raw));
  } catch {
    // Unreadable: nothing to keep, and the key goes with the retired ones.
    legacy = {};
  }
  const collapsed = Object.fromEntries(Object.entries(legacy).filter(([, expanded]) => !expanded));
  saveGroupExpansion(collapsed, storage);
  return collapsed;
}

/**
 * Keeps at most 300 entries, dropping the oldest by insertion order. To mark
 * a choice as recent, delete the key before setting it again.
 */
export function saveGroupExpansion(
  value: Record<string, boolean>,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    const entries = Object.entries(cleanGroupExpansion(value));
    const kept = entries.length > MAX_GROUP_EXPANSION_ENTRIES
      ? entries.slice(entries.length - MAX_GROUP_EXPANSION_ENTRIES)
      : entries;
    storage.setItem(GROUP_EXPANSION_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Persistence is best-effort.
  }
}

export function loadPinnedCollapsed(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(PINNED_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function savePinnedCollapsed(
  collapsed: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PINNED_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Persistence is best-effort.
  }
}

/** The files tab's (or section's) ignored-files switch; off unless the browser saved it on. */
export function loadShowIgnoredFiles(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SHOW_IGNORED_FILES_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const ACTIVE_NOW_STORAGE_KEY = "pi-web:sidebar-sessions-active-now";
const SESSIONS_CATEGORY_FILTER_STORAGE_KEY = "pi-web:sidebar-sessions-category-filter";
const SESSIONS_SORT_MODE_STORAGE_KEY = "pi-web:sidebar-sessions-sort-mode";

/**
 * "Secciones del Sistema" (the strip under the voice button): whether it is
 * collapsed, its layout variant and the sub-section it shows. Per browser,
 * like the rest of the sidebar's own memories.
 */
const SYSTEM_SECTIONS_COLLAPSED_STORAGE_KEY = "pi-web:sidebar-system-sections-collapsed";
const SYSTEM_SECTIONS_VARIANT_STORAGE_KEY = "pi-web:sidebar-system-sections-variant";
const SYSTEM_SECTIONS_SEGMENT_STORAGE_KEY = "pi-web:sidebar-system-sections-segment";

export type SystemSectionVariant = "full" | "compact" | "access";
export type SystemSectionSegment = "proyectos" | "rutinas" | "decisiones" | "recientes";

const SYSTEM_SECTION_VARIANTS: readonly SystemSectionVariant[] = ["full", "compact", "access"];
const SYSTEM_SECTION_SEGMENTS: readonly SystemSectionSegment[] = ["proyectos", "rutinas", "decisiones", "recientes"];

/** Whether the sessions tree starts with the "activas ahora" filter on. */
export function loadActiveNowOnly(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ACTIVE_NOW_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveActiveNowOnly(
  active: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_NOW_STORAGE_KEY, String(active));
  } catch {
    // Persistence is best-effort.
  }
}

export function loadSessionsCategoryFilter(storage: StorageLike | null = getBrowserStorage()): string {
  if (!storage) return "all";
  try {
    return storage.getItem(SESSIONS_CATEGORY_FILTER_STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

export function saveSessionsCategoryFilter(
  category: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SESSIONS_CATEGORY_FILTER_STORAGE_KEY, category);
  } catch {
    // Persistence is best-effort.
  }
}

export function loadSessionsSortMode(storage: StorageLike | null = getBrowserStorage()): string {
  if (!storage) return "recent";
  try {
    return storage.getItem(SESSIONS_SORT_MODE_STORAGE_KEY) || "recent";
  } catch {
    return "recent";
  }
}

/** The "Secciones del Sistema" strip folded to its header; open unless the browser saved it folded. */
export function loadSystemSectionsCollapsed(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(SYSTEM_SECTIONS_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSystemSectionsCollapsed(
  collapsed: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SYSTEM_SECTIONS_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Persistence is best-effort.
  }
}

/** The strip's layout variant; anything unreadable is the full one. */
export function loadSystemSectionsVariant(
  storage: StorageLike | null = getBrowserStorage(),
): SystemSectionVariant {
  if (!storage) return "full";
  try {
    const value = storage.getItem(SYSTEM_SECTIONS_VARIANT_STORAGE_KEY);
    return SYSTEM_SECTION_VARIANTS.includes(value as SystemSectionVariant) ? (value as SystemSectionVariant) : "full";
  } catch {
    return "full";
  }
}

export function saveSystemSectionsVariant(
  variant: SystemSectionVariant,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SYSTEM_SECTIONS_VARIANT_STORAGE_KEY, variant);
  } catch {
    // Persistence is best-effort.
  }
}

/** The sub-section the full variant shows; defaults to projects. */
export function loadSystemSectionsSegment(
  storage: StorageLike | null = getBrowserStorage(),
): SystemSectionSegment {
  if (!storage) return "proyectos";
  try {
    const value = storage.getItem(SYSTEM_SECTIONS_SEGMENT_STORAGE_KEY);
    return SYSTEM_SECTION_SEGMENTS.includes(value as SystemSectionSegment) ? (value as SystemSectionSegment) : "proyectos";
  } catch {
    return "proyectos";
  }
}

export function saveSystemSectionsSegment(
  segment: SystemSectionSegment,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SYSTEM_SECTIONS_SEGMENT_STORAGE_KEY, segment);
  } catch {
    // Persistence is best-effort.
  }
}

export function saveSessionsSortMode(
  mode: string,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SESSIONS_SORT_MODE_STORAGE_KEY, mode);
  } catch {
    // Persistence is best-effort.
  }
}

export function saveShowIgnoredFiles(
  show: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SHOW_IGNORED_FILES_STORAGE_KEY, String(show));
  } catch {
    // Persistence is best-effort.
  }
}

/**
 * The files section below the sessions folded to its header row; open unless
 * the browser saved it folded. The tabs layout ignores it.
 */
export function loadFilesCollapsed(storage: StorageLike | null = getBrowserStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(FILES_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveFilesCollapsed(
  collapsed: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(FILES_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Persistence is best-effort.
  }
}

/**
 * Folders the worktree listing last found outside any git repository, oldest
 * first. The sidebar knows them before its listing answers, after a reload
 * too, so such a folder never shows the "checking" worktree box only to drop
 * it and widen the project box (the default dated folder is one).
 */
export function loadNonGitCwds(storage: StorageLike | null = getBrowserStorage()): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(NON_GIT_CWDS_STORAGE_KEY);
    const value: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((cwd): cwd is string => typeof cwd === "string" && cwd !== "").slice(-MAX_NON_GIT_CWDS);
  } catch {
    return [];
  }
}

/**
 * Records what a listing found for `cwd`: a folder outside git becomes the
 * newest, one in git leaves the list (it may have become a repository).
 * Read, then written, so the folders another tab saved stay; nothing is
 * written when nothing changes.
 */
export function rememberCwdGitStatus(
  cwd: string,
  isGit: boolean,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage || !cwd) return;
  const known = loadNonGitCwds(storage);
  const index = known.indexOf(cwd);
  if (isGit ? index === -1 : index !== -1 && index === known.length - 1) return;
  const next = known.filter((other) => other !== cwd);
  if (!isGit) next.push(cwd);
  try {
    storage.setItem(NON_GIT_CWDS_STORAGE_KEY, JSON.stringify(next.slice(-MAX_NON_GIT_CWDS)));
  } catch {
    // Persistence is best-effort.
  }
}

/**
 * Drops the retired keys. Best-effort, like the rest. Runs after
 * loadGroupExpansion, which moves the old group choices it keeps to v2.
 */
export function forgetRetiredSidebarKeys(storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  for (const key of RETIRED_STORAGE_KEYS) {
    try {
      storage.removeItem?.(key);
    } catch {
      // Privacy mode may refuse it; the key is simply left unread.
    }
  }
}
