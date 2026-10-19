"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaneles } from "@/hooks/usePaneles";
import { usePanelSessions } from "@/hooks/usePanelSessions";
import { copyText } from "@/lib/clipboard";
import type { PanelMeta } from "@/lib/paneles";
import type { PanelSessionLink } from "@/lib/paneles-sessions";

export interface PanelesViewProps {
  onClose?: () => void;
  /** `?panel=<dir>` deep link: the panel to open once the list loads. */
  initialPanelDir?: string | null;
  /** Open one of the panel's related Pi sessions (leaves this view). */
  onOpenSession?: (sessionId: string) => void;
}

type Filter = "activos" | "archivados" | "todos";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "activos", label: "Activos" },
  { key: "archivados", label: "Archivados" },
  { key: "todos", label: "Todos" },
];

const TIPO_META: Record<string, { label: string; icon: string; bg: string; color: string }> = {
  informe: { label: "Informes", icon: "📄", bg: "rgba(56, 189, 248, 0.14)", color: "#38bdf8" },
  galeria: { label: "Galerías", icon: "🖼️", bg: "rgba(168, 85, 247, 0.14)", color: "#a855f7" },
  comparativa: { label: "Comparativas", icon: "⚖️", bg: "rgba(245, 158, 11, 0.14)", color: "#f59e0b" },
  base: { label: "Bases", icon: "🧱", bg: "rgba(34, 197, 94, 0.14)", color: "#22c55e" },
  otro: { label: "Otros", icon: "📊", bg: "var(--bg-selected)", color: "var(--text-muted)" },
};

const TIPO_ORDER = Object.keys(TIPO_META);

/** Session rows the dashboard card lists before its "+N más". */
const CARD_SESSION_ROWS = 5;

function tipoMeta(tipo: string) {
  return TIPO_META[tipo] ?? TIPO_META.otro;
}

function tipoRank(tipo: string): number {
  const index = TIPO_ORDER.indexOf(tipo);
  return index === -1 ? TIPO_ORDER.length : index;
}

function formatDate(fecha: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  try {
    return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

function formatWhen(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** Why this session is related, as the chip/row tooltip tells it. */
function sessionTooltip(link: PanelSessionLink): string {
  const why =
    link.source === "panel.json"
      ? "vinculada en panel.json (rg-panel)"
      : "menciona el slug del panel";
  const when = formatWhen(link.modified);
  const snippet = link.snippet
    ? `\n…${link.snippet.before}${link.snippet.match}${link.snippet.after}…`
    : "";
  return `${link.title}\n${why}${when ? ` · ${when}` : ""}${snippet}`;
}

/** A related session as a one-line chip (visor strip). Plain link when the
 * shell passes no onOpenSession, so middle-click/new-tab still work. */
function SessionChip({
  link,
  onOpenSession,
}: {
  link: PanelSessionLink;
  onOpenSession?: (sessionId: string) => void;
}) {
  const registered = link.source === "panel.json";
  return (
    <a
      href={`/?session=${link.id}`}
      onClick={(e) => {
        if (onOpenSession) {
          e.preventDefault();
          onOpenSession(link.id);
        }
      }}
      title={sessionTooltip(link)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        minHeight: 30,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        color: "var(--text)",
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        textDecoration: "none",
        flexShrink: 0,
        transition: "border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: registered ? "var(--accent)" : "var(--text-dim, #888)",
          boxShadow: registered ? "0 0 5px var(--accent)" : "none",
          flexShrink: 0,
        }}
      />
      <span style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>{link.title}</span>
      <span aria-hidden="true" style={{ color: "var(--accent)", fontSize: 11, fontWeight: 700 }}>
        ↗
      </span>
    </a>
  );
}

/** A related session as a full-width row (dashboard card expansion): title,
 * source badge and, for mentions, the snippet that proves the link. */
function SessionRow({
  link,
  onOpenSession,
}: {
  link: PanelSessionLink;
  onOpenSession?: (sessionId: string) => void;
}) {
  const registered = link.source === "panel.json";
  return (
    <a
      href={`/?session=${link.id}`}
      onClick={(e) => {
        if (onOpenSession) {
          e.preventDefault();
          onOpenSession(link.id);
        }
      }}
      title={sessionTooltip(link)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: "8px 10px",
        minHeight: 42,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        textDecoration: "none",
        width: "100%",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: registered ? "var(--accent)" : "var(--text-dim, #888)",
            boxShadow: registered ? "0 0 5px var(--accent)" : "none",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {link.title}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 5,
            background: registered ? "color-mix(in srgb, var(--accent) 13%, var(--bg-panel))" : "var(--bg-selected)",
            color: registered ? "var(--accent)" : "var(--text-muted)",
            flexShrink: 0,
            letterSpacing: "0.03em",
          }}
        >
          {registered ? "panel.json" : "mención"}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>Abrir ↗</span>
      </span>
      {link.snippet ? (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-dim, #888)",
            fontFamily: "var(--font-mono)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          …{link.snippet.before}
          <span style={{ color: "var(--text-muted)", fontWeight: 700 }}>{link.snippet.match}</span>
          {link.snippet.after}…
        </span>
      ) : (
        <span style={{ fontSize: 11, color: "var(--text-dim, #888)" }}>{formatWhen(link.modified)}</span>
      )}
    </a>
  );
}

/** The visor's related-sessions rail: one horizontal, touch-scrollable strip
 * under the header. Hidden while empty so a panel without sessions keeps its
 * full canvas. */
function PanelSessionsStrip({
  slug,
  onOpenSession,
}: {
  slug: string;
  onOpenSession?: (sessionId: string) => void;
}) {
  const { sessions, missing, truncated, loading, error } = usePanelSessions(slug);
  if (!loading && sessions.length === 0 && missing.length === 0) return null;
  if (error && sessions.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px calc(8px + env(safe-area-inset-left, 0px))",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        overflowX: "auto",
        overflowY: "hidden",
        flexShrink: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        Sesiones{loading && sessions.length === 0 ? "…" : ` · ${sessions.length}`}
      </span>
      {sessions.map((link) => (
        <SessionChip key={link.id} link={link} onOpenSession={onOpenSession} />
      ))}
      {truncated ? (
        <span
          title="El escaneo cubre los transcripts más recientes; puede haber más sesiones"
          style={{ fontSize: 11, color: "var(--text-dim, #888)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          + más…
        </span>
      ) : null}
      {missing.length > 0 ? (
        <span
          title={`Registradas en panel.json pero no encontradas: ${missing.join(", ")}`}
          style={{ fontSize: 11, color: "var(--text-dim, #888)", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          · {missing.length} sin archivo
        </span>
      ) : null}
    </div>
  );
}

/** One dashboard card: the panel's own tile plus an on-demand expansion with
 * its related sessions (panel.json registrations and transcript mentions),
 * each openable in one tap. */
function PanelCard({
  panel,
  onOpen,
  onOpenSession,
}: {
  panel: PanelMeta;
  onOpen: () => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Fetch only once expanded; the module cache keeps revisits free.
  const { sessions, missing, loading, error } = usePanelSessions(sessionsOpen ? panel.slug : null);

  const tipo = tipoMeta(panel.tipo);
  const archived = panel.estado === "archivado";
  const shortSlug = panel.slug.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const count = sessions.length || panel.sessions.length;

  const openCard = useCallback(() => {
    if (!sessionsOpen) onOpen();
  }, [onOpen, sessionsOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openCard}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            openCard();
          }
        }
      }}
      title={archived ? `${panel.titulo} (archivado)` : panel.titulo}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 6,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--bg-panel)",
        color: "var(--text)",
        cursor: "pointer",
        textAlign: "left",
        opacity: archived ? 0.62 : 1,
        transition: "border-color 0.12s, transform 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 6,
            background: tipo.bg,
            color: tipo.color,
          }}
        >
          {panel.tipo}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(panel.fecha)}</span>
      </span>
      <span style={{ fontSize: 14.5, fontWeight: 650, lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {panel.titulo}
      </span>
      {panel.resumen ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {panel.resumen}
        </span>
      ) : null}
      {archived ? (
        <span style={{ fontSize: 10.5, color: "var(--text-dim, #888)", fontWeight: 600 }}>archivado</span>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSessionsOpen((open) => !open);
        }}
        aria-expanded={sessionsOpen}
        title="Sesiones Pi relacionadas: vinculadas en panel.json y menciones del slug"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 2,
          padding: "4px 10px",
          minHeight: 28,
          borderRadius: 999,
          border: `1px solid ${sessionsOpen ? "var(--accent)" : "var(--border)"}`,
          background: sessionsOpen ? "color-mix(in srgb, var(--accent) 10%, var(--bg-panel))" : "var(--bg-panel)",
          color: sessionsOpen ? "var(--accent)" : "var(--text-muted)",
          fontSize: 11.5,
          fontWeight: 650,
          cursor: "pointer",
          transition: "border-color 0.12s",
        }}
      >
        <span aria-hidden="true">💬</span>
        <span>Sesiones{count > 0 ? ` · ${count}` : ""}</span>
        <span aria-hidden="true" style={{ fontSize: 9 }}>{sessionsOpen ? "▲" : "▼"}</span>
      </button>

      {sessionsOpen ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {loading && sessions.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              Buscando sesiones relacionadas…
            </span>
          ) : error && sessions.length === 0 ? (
            <span style={{ fontSize: 12, color: "#dc2626" }}>{error}</span>
          ) : sessions.length === 0 && missing.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Sin sesiones vinculadas todavía. Vincula una con{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>rg-panel link {shortSlug}</code>.
            </span>
          ) : (
            <>
              {sessions.slice(0, showAll ? sessions.length : CARD_SESSION_ROWS).map((link) => (
                <SessionRow key={link.id} link={link} onOpenSession={onOpenSession} />
              ))}
              {sessions.length > CARD_SESSION_ROWS && !showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px 2px",
                    textAlign: "left",
                  }}
                >
                  + {sessions.length - CARD_SESSION_ROWS} más
                </button>
              ) : null}
              {missing.length > 0 ? (
                <span
                  title={`Registradas en panel.json pero no encontradas: ${missing.join(", ")}`}
                  style={{ fontSize: 11, color: "var(--text-dim, #888)" }}
                >
                  · {missing.length} registrada{missing.length === 1 ? "" : "s"} sin archivo
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Keep `?view=paneles&panel=<dir>` shareable without re-triggering navigation. */
function syncPanelParam(dir: string | null) {
  try {
    const url = new URL(window.location.href);
    if (dir) url.searchParams.set("panel", dir);
    else url.searchParams.delete("panel");
    window.history.replaceState(null, "", url.toString());
  } catch {
    // URL fiddling is a nicety; never break the view over it.
  }
}

export function PanelesView({ onClose, initialPanelDir, onOpenSession }: PanelesViewProps) {
  const { paneles, activeCount, loading, error, refresh } = usePaneles();
  const [filter, setFilter] = useState<Filter>("activos");
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialPanelDir ?? null);
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const selectPanel = useCallback((slug: string | null) => {
    setSelectedSlug(slug);
    setIframeKey((key) => key + 1);
    syncPanelParam(slug);
  }, []);

  // A stale `?panel=` deep link (renamed or archived dir) falls back to the grid.
  useEffect(() => {
    if (selectedSlug && paneles.length > 0 && !paneles.some((p) => p.slug === selectedSlug)) {
      selectPanel(null);
    }
  }, [paneles, selectedSlug, selectPanel]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return paneles.filter((p) => {
      if (filter === "activos" && p.estado === "archivado") return false;
      if (filter === "archivados" && p.estado !== "archivado") return false;
      if (!query) return true;
      return `${p.titulo} ${p.resumen} ${p.tipo} ${p.slug}`.toLowerCase().includes(query);
    });
  }, [paneles, filter, search]);

  /** Grid sections by tipo (categoría): known categories in a fixed order,
      unknown ones alphabetical after them; panels keep their fecha order. */
  const grouped = useMemo(() => {
    const buckets = new Map<string, PanelMeta[]>();
    for (const panel of filtered) {
      const bucket = buckets.get(panel.tipo);
      if (bucket) bucket.push(panel);
      else buckets.set(panel.tipo, [panel]);
    }
    return [...buckets.entries()]
      .sort((a, b) => {
        const rank = tipoRank(a[0]) - tipoRank(b[0]);
        return rank !== 0 ? rank : a[0].localeCompare(b[0]);
      })
      .map(([tipo, panelesOfTipo]) => ({ tipo, paneles: panelesOfTipo }));
  }, [filtered]);

  const selected = useMemo(
    () => paneles.find((p) => p.slug === selectedSlug) ?? null,
    [paneles, selectedSlug],
  );

  const copySelectedLink = useCallback(() => {
    if (!selected) return;
    const url = `${window.location.origin}/?view=paneles&panel=${encodeURIComponent(selected.slug)}`;
    copyText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {
        // Clipboard denied: the transient state simply never shows.
      });
  }, [selected]);

  const renderCard = (panel: PanelMeta) => (
    <PanelCard
      key={panel.slug}
      panel={panel}
      onOpen={() => selectPanel(panel.slug)}
      onOpenSession={onOpenSession}
    />
  );

  const header = (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-panel)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {selected ? (
          <button
            type="button"
            onClick={() => selectPanel(null)}
            className="config-button config-button-small config-button-secondary"
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            ← Paneles
          </button>
        ) : null}
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)", whiteSpace: "nowrap" }}>
          {selected ? selected.titulo : "Paneles e Informes"}
        </h1>
        {selected ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", flexWrap: "wrap" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: tipoMeta(selected.tipo).bg,
                color: tipoMeta(selected.tipo).color,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                fontSize: 10,
              }}
            >
              {selected.tipo}
            </span>
            <span>{formatDate(selected.fecha)}</span>
            {selected.resumen ? <span style={{ opacity: 0.85 }}>· {selected.resumen}</span> : null}
          </span>
        ) : (
          <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, background: "rgba(56, 189, 248, 0.13)", color: "#38bdf8", fontWeight: 700 }}>
            {activeCount} activos
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {selected ? (
          <>
            <button
              type="button"
              onClick={copySelectedLink}
              className="config-button config-button-small config-button-secondary"
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              {copied ? "✓ Copiado" : "Copiar enlace"}
            </button>
            <button
              type="button"
              onClick={() => setIframeKey((key) => key + 1)}
              className="config-button config-button-small config-button-secondary"
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Recargar
            </button>
            <button
              type="button"
              onClick={() => window.open(`/api/paneles/${encodeURIComponent(selected.slug)}/`, "_blank", "noopener")}
              className="config-button config-button-small config-button-secondary"
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
            >
              Pestaña nueva
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={refresh}
            className="config-button config-button-small config-button-secondary"
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            Actualizar
          </button>
        )}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="config-button config-button-small config-button-secondary"
            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: "pointer" }}
          >
            Cerrar
          </button>
        ) : null}
      </div>
    </header>
  );

  const grid = (
    <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px calc(24px + env(safe-area-inset-bottom))" }}>
      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              border: `1px solid ${filter === key ? "var(--accent)" : "var(--border)"}`,
              background: filter === key ? "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))" : "var(--bg-panel)",
              color: filter === key ? "var(--accent)" : "var(--text-muted)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar panel…"
          aria-label="Buscar panel"
          style={{
            flex: 1,
            minWidth: 140,
            maxWidth: 280,
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 12.5,
            outline: "none",
          }}
        />
      </div>

      {loading && paneles.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>Cargando paneles…</div>
      ) : error && paneles.length === 0 ? (
        <div style={{ color: "#dc2626", fontSize: 13, padding: "24px 0", textAlign: "center" }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            color: "var(--text-muted)",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            padding: "28px 20px",
            textAlign: "center",
            fontSize: 13,
          }}
        >
          {filter === "activos" && paneles.length > 0
            ? "Ningún panel coincide con la búsqueda."
            : "Todavía no hay paneles. Crea uno con rg-panel new <slug>."}
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          {grouped.map(({ tipo, paneles: panelesOfTipo }) => {
            const meta = tipoMeta(tipo);
            return (
              <section key={tipo} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: meta.color }}>
                  <span aria-hidden="true">{meta.icon}</span>
                  <span>{meta.label}</span>
                  <span style={{ fontWeight: 600, color: "var(--text-dim, #888)" }}>{panelesOfTipo.length}</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
                    gap: 10,
                  }}
                >
                  {panelesOfTipo.map(renderCard)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );

  const viewer = selected ? (
    <iframe
      key={iframeKey}
      src={`/api/paneles/${encodeURIComponent(selected.slug)}/`}
      title={selected.titulo}
      loading="lazy"
      // Self-authored deliverables rendered same-origin: scripts stay enabled
      // (live-data panels fetch /api/live/*), popups/forms for embedded links.
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      style={{
        flex: 1,
        width: "100%",
        border: "none",
        background: "var(--bg)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    />
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "var(--bg)", overflow: "hidden" }}>
      {header}
      {selected ? <PanelSessionsStrip slug={selected.slug} onOpenSession={onOpenSession} /> : null}
      {selected ? viewer : grid}
    </div>
  );
}
