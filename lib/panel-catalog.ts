/**
 * The panel catalog's shared model (client-safe, pure): the three visibility
 * states a panel has in the sidebar's lifecycle, the expiry that makes a
 * pinned panel temporal, the native views registered as panels, and the
 * merge + ordering both the catalog view (components/PanelesView.tsx) and
 * the sidebar's pinned strip (components/PanelPins.tsx) read. Server-side
 * readers (lib/paneles.ts) reuse the normalization so a panel.json written
 * by `rg-panel` and one written by POST /api/paneles parse the same.
 */

export type PanelVisibility = "fijado" | "demanda" | "archivado";

export const PANEL_VISIBILITIES: readonly PanelVisibility[] = ["fijado", "demanda", "archivado"];

export interface PanelVisibilityMeta {
  label: string;
  icon: string;
  hint: string;
  color: string;
  bg: string;
}

export const PANEL_VISIBILITY_META: Record<PanelVisibility, PanelVisibilityMeta> = {
  fijado: {
    label: "Fijado",
    icon: "📌",
    hint: "Aparece como acceso en el lateral",
    color: "#38bdf8",
    bg: "rgba(56, 189, 248, 0.14)",
  },
  demanda: {
    label: "Bajo demanda",
    icon: "🔍",
    hint: "Sólo desde el catálogo o la búsqueda; no ocupa el lateral",
    color: "#a855f7",
    bg: "rgba(168, 85, 247, 0.14)",
  },
  archivado: {
    label: "Archivado",
    icon: "🗄️",
    hint: "Fuera del catálogo activo; la URL sigue vigente",
    color: "var(--text-muted)",
    bg: "var(--bg-selected)",
  },
};

export function isPanelVisibility(value: unknown): value is PanelVisibility {
  return value === "fijado" || value === "demanda" || value === "archivado";
}

/**
 * panel.json's `estado`, legacy included: "activo" is the pre-catalog state
 * and counts as bajo demanda — nobody occupies the sidebar without
 * Rodrigo pinning the panel himself. Unknown values also stay off the
 * sidebar; only an explicit "fijado" pins.
 */
export function normalizePanelVisibility(estado: unknown): PanelVisibility {
  return estado === "fijado" || estado === "archivado" ? estado : "demanda";
}

/** A valid expiry: YYYY-MM-DD that names a real calendar day. V8's
 *  Date.parse rolls impossible days over (Feb 30 → Mar 2), so the check
 *  is a round-trip through UTC, never the parse alone. */
export function normalizePanelExpiry(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return value;
}

/** Local midnight of a moment, so expiry days count calendar days. */
function localMidnightMs(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export interface PanelExpiryState {
  /** Calendar days until the expiry date; 0 or less means it has passed. */
  daysLeft: number;
  expired: boolean;
}

/** When a temporal panel's expiry stands relative to `nowMs`. */
export function panelExpiryState(expira: string | null, nowMs: number = Date.now()): PanelExpiryState | null {
  if (!expira) return null;
  const expiryMs = Date.parse(`${expira}T12:00:00Z`);
  if (!Number.isFinite(expiryMs)) return null;
  const daysLeft = Math.round((localMidnightMs(expiryMs) - localMidnightMs(nowMs)) / 86_400_000);
  return { daysLeft, expired: daysLeft <= 0 };
}

export interface EffectivePanelVisibility {
  visibility: PanelVisibility;
  expired: boolean;
}

/**
 * The visibility the sidebar and the catalog show: a pinned panel whose
 * expiry has passed falls back to bajo demanda (marked caducado) — the
 * expiry watcher (rg-archive-expiry, fed from the registry the write route
 * keeps) is the one that proposes archiving it.
 */
export function effectivePanelVisibility(
  estado: unknown,
  expira: string | null,
  nowMs: number = Date.now(),
): EffectivePanelVisibility {
  const base = normalizePanelVisibility(estado);
  const expiry = panelExpiryState(expira, nowMs);
  if (base === "fijado" && expiry?.expired) return { visibility: "demanda", expired: true };
  return { visibility: base, expired: Boolean(expiry?.expired) };
}

/** The expiry a "pin for a while" choice adds to today: `days` ahead. */
export function panelExpiryInDays(days: number, nowMs: number = Date.now()): string {
  const date = new Date(nowMs + days * 86_400_000);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "20 oct" / "20 oct 2027" — the expiry chip's date, es-ES. */
export function formatPanelExpiry(expira: string): string {
  try {
    return new Date(`${expira}T12:00:00Z`).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      ...(Number(expira.slice(0, 4)) !== new Date().getFullYear() ? { year: "numeric" } : {}),
    });
  } catch {
    return expira;
  }
}

/** The countdown an expiry chip shows: "caduca hoy", "3 días", "2 meses"… */
export function panelExpiryCountdown(state: PanelExpiryState): string {
  if (state.expired) return state.daysLeft === 0 ? "caducó hoy" : `caducó hace ${-state.daysLeft} d`;
  if (state.daysLeft === 0) return "caduca hoy";
  if (state.daysLeft === 1) return "caduca mañana";
  if (state.daysLeft <= 30) return `${state.daysLeft} días`;
  const months = Math.round(state.daysLeft / 30);
  return `${months} ${months === 1 ? "mes" : "meses"}`;
}

/**
 * A native view of the app registered as a catalog panel (no panel.json:
 * its visibility lives in the browser's sidebar prefs). Post Studio is the
 * temporal example: bajo demanda by default ("visible sólo cuando se usa"),
 * pinned while a social plan is active — optionally with an expiry Rodrigo
 * picks — and then quietly back to bajo demanda.
 */
export interface NativePanelDef {
  id: string;
  titulo: string;
  tipo: string;
  resumen: string;
  /** Where the panel came from: "sistema", "sesión", "plan"… */
  origen: string;
  icon: string;
  defaultVisibility: PanelVisibility;
}

export const NATIVE_PANELS: readonly NativePanelDef[] = [
  {
    id: "post-studio",
    titulo: "Post Studio",
    tipo: "studio",
    resumen: "Review interactiva del carrusel/reel antes de OpenPost: música audible, selección de fotos y decisión final.",
    origen: "sistema",
    icon: "🎬",
    defaultVisibility: "demanda",
  },
];

export function findNativePanel(id: string): NativePanelDef | null {
  return NATIVE_PANELS.find((panel) => panel.id === id) ?? null;
}

/** A native panel's saved state (sidebar-prefs); defaults come from its def. */
export interface NativePanelState {
  visibilidad: PanelVisibility;
  expira: string | null;
}

export function nativePanelState(def: NativePanelDef, saved: { visibilidad?: string; expira?: string | null } | undefined): NativePanelState {
  return {
    visibilidad: isPanelVisibility(saved?.visibilidad) ? saved.visibilidad : def.defaultVisibility,
    expira: normalizePanelExpiry(saved?.expira),
  };
}

/** Catalog keys: stable across the HTML panels and the native ones. */
export function htmlPanelKey(slug: string): string {
  return `html:${slug}`;
}

export function nativePanelKey(id: string): string {
  return `native:${id}`;
}

/** Tipo (categoría) display metadata shared by the catalog and the strip. */
export interface PanelTipoMeta {
  label: string;
  icon: string;
  bg: string;
  color: string;
}

export const PANEL_TIPO_META: Record<string, PanelTipoMeta> = {
  informe: { label: "Informes", icon: "📄", bg: "rgba(56, 189, 248, 0.14)", color: "#38bdf8" },
  galeria: { label: "Galerías", icon: "🖼️", bg: "rgba(168, 85, 247, 0.14)", color: "#a855f7" },
  comparativa: { label: "Comparativas", icon: "⚖️", bg: "rgba(245, 158, 11, 0.14)", color: "#f59e0b" },
  base: { label: "Bases", icon: "🧱", bg: "rgba(34, 197, 94, 0.14)", color: "#22c55e" },
  studio: { label: "Studios & Apps", icon: "🎬", bg: "rgba(236, 72, 153, 0.14)", color: "#ec4899" },
  otro: { label: "Otros", icon: "📊", bg: "var(--bg-selected)", color: "var(--text-muted)" },
};

export const PANEL_TIPO_ORDER: readonly string[] = ["studio", ...Object.keys(PANEL_TIPO_META).filter((tipo) => tipo !== "studio" && tipo !== "otro"), "otro"];

export function panelTipoMeta(tipo: string): PanelTipoMeta {
  return PANEL_TIPO_META[tipo] ?? PANEL_TIPO_META.otro;
}

export function panelTipoRank(tipo: string): number {
  const index = PANEL_TIPO_ORDER.indexOf(tipo);
  return index === -1 ? PANEL_TIPO_ORDER.length : index;
}

/** One catalog entry, whichever side it came from. */
export interface CatalogPanel {
  key: string;
  kind: "html" | "native";
  /** The paneles directory name; null for native panels. */
  slug: string | null;
  /** The native def's id; null for HTML panels. */
  nativeId: string | null;
  titulo: string;
  tipo: string;
  fecha: string;
  resumen: string;
  origen: string;
  /** panel.json's raw estado ("activo" legacy included); "" for native. */
  estado: string;
  expira: string | null;
  /** The state the sidebar and filters use (expiry included). */
  visibility: PanelVisibility;
  expired: boolean;
  icon: string | null;
  sessions: string[];
  mtime: string;
}

/** The shape lib/paneles.ts lists (PanelMeta) minus the file-only fields —
 *  structural typing keeps the route's PanelMeta acceptable as-is. */
export interface PanelMetaLike {
  slug: string;
  titulo: string;
  tipo: string;
  fecha: string;
  resumen: string;
  estado: string;
  origen: string;
  expira: string | null;
  sessions: string[];
  mtime: string;
}

export function catalogPanelFromMeta(meta: PanelMetaLike, nowMs: number = Date.now()): CatalogPanel {
  const effective = effectivePanelVisibility(meta.estado, normalizePanelExpiry(meta.expira), nowMs);
  return {
    key: htmlPanelKey(meta.slug),
    kind: "html",
    slug: meta.slug,
    nativeId: null,
    titulo: meta.titulo,
    tipo: meta.tipo,
    fecha: meta.fecha,
    resumen: meta.resumen,
    origen: meta.origen,
    estado: meta.estado,
    expira: normalizePanelExpiry(meta.expira),
    visibility: effective.visibility,
    expired: effective.expired,
    icon: null,
    sessions: meta.sessions,
    mtime: meta.mtime,
  };
}

export function catalogPanelFromNative(
  def: NativePanelDef,
  saved: Partial<NativePanelState> | undefined,
  nowMs: number = Date.now(),
): CatalogPanel {
  const state = nativePanelState(def, saved);
  const effective = effectivePanelVisibility(state.visibilidad, state.expira, nowMs);
  return {
    key: nativePanelKey(def.id),
    kind: "native",
    slug: null,
    nativeId: def.id,
    titulo: def.titulo,
    tipo: def.tipo,
    fecha: "",
    resumen: def.resumen,
    origen: def.origen,
    estado: state.visibilidad,
    expira: state.expira,
    visibility: effective.visibility,
    expired: effective.expired,
    icon: def.icon,
    sessions: [],
    mtime: "",
  };
}

/** The catalog a view shows: native panels first (their registry order),
 *  then HTML panels in the list's own (newest-first) order. */
export function mergeCatalogPanels(
  htmlPanels: readonly PanelMetaLike[],
  nativeSaved: Readonly<Record<string, Partial<NativePanelState>>>,
  nowMs: number = Date.now(),
): CatalogPanel[] {
  const native = NATIVE_PANELS.map((def) => catalogPanelFromNative(def, nativeSaved[def.id], nowMs));
  const html = htmlPanels.map((meta) => catalogPanelFromMeta(meta, nowMs));
  return [...native, ...html];
}

/**
 * The pinned strip's order: keys the browser saved first, in that order;
 * panels pinned since (another browser, a fresh panel) follow in the
 * catalog's own order. Saving happens on every drag drop.
 */
export function orderPinnedPanels(panels: readonly CatalogPanel[], order: readonly string[]): CatalogPanel[] {
  const rank = new Map<string, number>();
  order.forEach((key, index) => {
    if (key !== "__proto__") rank.set(key, index);
  });
  return [...panels].sort((a, b) => {
    const rankA = rank.get(a.key);
    const rankB = rank.get(b.key);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return 0;
  });
}

/** A plain-text haystack for panel search (title, summary, tipo, slug). */
export function panelSearchText(panel: CatalogPanel): string {
  return `${panel.titulo} ${panel.resumen} ${panel.tipo} ${panel.slug ?? ""}`.toLowerCase();
}

/** The order after one drag drop: `from`'s key lands at `to`, the rest
 *  shifts. Out-of-range indexes keep the order unchanged. */
export function moveKey(order: readonly string[], from: number, to: number): string[] {
  if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) {
    return [...order];
  }
  const next = [...order];
  const [key] = next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

export function filterCatalogPanelsByText(panels: readonly CatalogPanel[], query: string): CatalogPanel[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...panels];
  return panels.filter((panel) => panelSearchText(panel).includes(needle));
}
