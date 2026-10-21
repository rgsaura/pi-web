"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePaneles } from "@/hooks/usePaneles";
import { usePanelSessions } from "@/hooks/usePanelSessions";
import { useNativePanelStates } from "@/hooks/useNativePanelStates";
import { copyText } from "@/lib/clipboard";
import type { PanelSessionLink } from "@/lib/paneles-sessions";
import {
  PANEL_VISIBILITY_META,
  filterCatalogPanelsByText,
  formatPanelExpiry,
  mergeCatalogPanels,
  panelExpiryCountdown,
  panelExpiryInDays,
  panelExpiryState,
  panelTipoMeta,
  panelTipoRank,
  type CatalogPanel,
  type PanelVisibility,
} from "@/lib/panel-catalog";

export interface PanelesViewProps {
  onClose?: () => void;
  /** `?panel=<dir>` deep link: the panel to open once the list loads. */
  initialPanelDir?: string | null;
  /** Open one of the panel's related Pi sessions (leaves this view). */
  onOpenSession?: (sessionId: string) => void;
  /** Opens a native catalog panel's view (e.g. Post Studio). */
  onOpenNativePanel?: (id: string) => void;
}

type Filter = "activos" | "archivados" | "todos";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "activos", label: "Activos" },
  { key: "archivados", label: "Archivados" },
  { key: "todos", label: "Todos" },
];

/** Preset pin durations the popover offers, in days. */
const EXPIRY_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: "1 día" },
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
];

/** Session rows the dashboard card lists before its "+N más". */
const CARD_SESSION_ROWS = 5;

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

/** The pin popover: how long the pin lasts. `Sin caducidad` keeps it until
 *  Rodrigo unpins it; a preset or a picked date makes it temporal (the
 *  expiry watcher then proposes archiving it once the date passes). */
function PinExpiryPopover({
  busy,
  onPin,
  onClose,
}: {
  busy: boolean;
  onPin: (expira: string | null) => void;
  onClose: () => void;
}) {
  const [customDate, setCustomDate] = useState("");
  const min = panelExpiryInDays(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // A card near the grid's bottom would open the popover below the fold;
  // bring it fully into view once, without fighting the user's own scroll.
  useEffect(() => {
    boxRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const optionStyle = {
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
    textAlign: "left" as const,
  };
  return (
    <div
      ref={boxRef}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: "100%",
        padding: 10,
        borderRadius: 10,
        border: "1px solid var(--accent)",
        background: "var(--bg-panel)",
        marginTop: 4,
        boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        ¿Por cuánto tiempo lo fijas?
      </span>
      <button type="button" disabled={busy} onClick={() => onPin(null)} style={optionStyle}>
        Sin caducidad — hasta que lo quites
      </button>
      {EXPIRY_PRESETS.map(({ days, label }) => (
        <button key={days} type="button" disabled={busy} onClick={() => onPin(panelExpiryInDays(days))} style={optionStyle}>
          {label} · hasta el {formatPanelExpiry(panelExpiryInDays(days))}
        </button>
      ))}
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="date"
          value={customDate}
          min={min}
          onChange={(e) => setCustomDate(e.target.value)}
          aria-label="Fecha de caducidad"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        />
        <button
          type="button"
          disabled={busy || !customDate}
          onClick={() => onPin(customDate)}
          style={{
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid var(--accent)",
            background: "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))",
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 700,
            cursor: busy || !customDate ? "wait" : "pointer",
          }}
        >
          Fijar
        </button>
      </span>
      <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11.5, cursor: "pointer", padding: 0, textAlign: "left" }}>
        Cancelar
      </button>
    </div>
  );
}

/** One panel's visibility controls: the three states as a segmented row,
 *  plus the temporal pin's chip (countdown, clear) and the pin popover. */
function VisibilityControl({
  panel,
  busy,
  write,
}: {
  panel: CatalogPanel;
  busy: boolean;
  write: (visibilidad: PanelVisibility, expira?: string | null) => void;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const expiry = panelExpiryState(panel.expira);
  const isFijado = panel.visibility === "fijado";
  const segment = (active: boolean, accentColor: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 9px",
    minHeight: 36,
    borderRadius: 8,
    border: `1px solid ${active ? accentColor : "var(--border)"}`,
    background: active ? `color-mix(in srgb, ${accentColor} 12%, var(--bg-panel))` : "var(--bg-panel)",
    color: active ? accentColor : "var(--text-muted)",
    fontSize: 11.5,
    fontWeight: 700,
    cursor: busy ? "wait" : "pointer",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, width: "100%" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }} role="group" aria-label="Visibilidad del panel">
        <button
          type="button"
          disabled={busy}
          aria-pressed={isFijado}
          title={PANEL_VISIBILITY_META.fijado.hint}
          onClick={() => {
            // Pinning opens the duration popover; an already pinned panel
            // reopens it to change or clear its expiry.
            setPinOpen((open) => !open);
          }}
          style={segment(isFijado, "var(--accent)")}
        >
          <span aria-hidden="true">📌</span>
          <span>Fijar</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={panel.visibility === "demanda"}
          title={PANEL_VISIBILITY_META.demanda.hint}
          onClick={() => write("demanda")}
          style={segment(panel.visibility === "demanda", "#9333ea")}
        >
          <span aria-hidden="true">🔍</span>
          <span>Demanda</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={panel.visibility === "archivado"}
          title={PANEL_VISIBILITY_META.archivado.hint}
          onClick={() => write("archivado")}
          style={segment(panel.visibility === "archivado", "var(--text-muted)")}
        >
          <span aria-hidden="true">🗄️</span>
          <span>Archivar</span>
        </button>
      </div>
      {isFijado && panel.expira && expiry ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            title={`Fijado hasta el ${formatPanelExpiry(panel.expira)}`}
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              color: expiry.expired ? "#ef4444" : expiry.daysLeft <= 3 ? "#f59e0b" : "var(--text-muted)",
              background: expiry.expired ? "rgba(239, 68, 68, 0.12)" : expiry.daysLeft <= 3 ? "rgba(245, 158, 11, 0.14)" : "var(--bg-selected)",
            }}
          >
            ⏳ {panelExpiryCountdown(expiry)} · {formatPanelExpiry(panel.expira)}
          </span>
          <button type="button" disabled={busy} onClick={() => write("fijado", null)} title="Dejarlo fijado sin fecha límite" style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 600, cursor: busy ? "wait" : "pointer", padding: 0 }}>
            quitar caducidad
          </button>
        </span>
      ) : null}
      {panel.expired && !isFijado ? (
        <span style={{ fontSize: 10.5, color: "#ef4444", fontWeight: 700 }}>⌛ caducó — volvió a bajo demanda</span>
      ) : null}
      {pinOpen ? (
        <PinExpiryPopover
          busy={busy}
          onPin={(expira) => {
            setPinOpen(false);
            write("fijado", expira);
          }}
          onClose={() => setPinOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** One dashboard card: the panel's own tile plus an on-demand expansion with
 *  its related sessions (panel.json registrations and transcript mentions),
 *  each openable in one tap, and its visibility controls. */
function PanelCard({
  panel,
  onOpen,
  onOpenSession,
  busy,
  write,
}: {
  panel: CatalogPanel;
  onOpen: () => void;
  onOpenSession?: (sessionId: string) => void;
  busy: boolean;
  write: (visibilidad: PanelVisibility, expira?: string | null) => void;
}) {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Fetch only once expanded; the module cache keeps revisits free.
  const { sessions, missing, loading, error } = usePanelSessions(panel.kind === "html" && sessionsOpen ? panel.slug : null);

  const tipo = panelTipoMeta(panel.tipo);
  const archived = panel.visibility === "archivado";
  const shortSlug = panel.slug ? panel.slug.replace(/^\d{4}-\d{2}-\d{2}-/, "") : "";
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
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
          {panel.fecha ? <span>{formatDate(panel.fecha)}</span> : null}
          {panel.icon ? <span aria-hidden="true" style={{ fontSize: 13 }}>{panel.icon}</span> : null}
        </span>
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

      <VisibilityControl panel={panel} busy={busy} write={write} />

      {panel.kind === "html" ? (
        <>
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
              minHeight: 36,
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
        </>
      ) : null}
    </div>
  );
}

/** The generation flow, documented where any session (or Rodrigo) reads it:
 *  how a reusable panel gets created, registered and made visible. */
function GenerationFlowHelp({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const code = {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "2px 6px",
    overflowWrap: "anywhere" as const,
  };
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: 12,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          background: "var(--bg-panel)",
          border: "none",
          color: "var(--text)",
          fontSize: 12.5,
          fontWeight: 650,
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true">🛠️</span>
          <span>Cómo crear un panel reutilizable</span>
        </span>
        <span aria-hidden="true" style={{ fontSize: 10, color: "var(--text-muted)", transition: "transform 0.15s", transform: open ? "none" : "rotate(-90deg)" }}>▼</span>
      </button>
      {open ? (
        <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, color: "var(--text)", lineHeight: 1.55 }}>
          <span>
            <strong>1 · Crea el panel desde cualquier sesión de Pi.</strong> El entregable vive en su propio
            directorio con plantilla, nunca como archivo suelto:
            <br />
            <code style={code}>rg-panel new &lt;slug&gt; --tipo informe|galeria|comparativa|base --titulo &quot;…&quot; --resumen &quot;…&quot;</code>
          </span>
          <span>
            <strong>2 · Escribe el contenido</strong> en el <code style={code}>index.html</code> creado bajo{" "}
            <code style={code}>~/.local/share/exohuman/paneles/&lt;fecha&gt;-&lt;slug&gt;/</code> (plantillas en{" "}
            <code style={code}>_plantillas/</code>; HTML autosuficiente o con datos vivos de <code style={code}>/api/*</code>).
          </span>
          <span>
            <strong>3 · Registra la sesión creadora</strong> para que el panel trace su origen (aparece en
            «Sesiones» de su tarjeta): <code style={code}>rg-panel link &lt;slug&gt;</code> — usa{" "}
            <code style={code}>PI_SESSION_ID</code> automáticamente.
          </span>
          <span>
            <strong>4 · Elige su visibilidad aquí:</strong>{" "}
            <strong style={{ color: "var(--accent)" }}>📌 Fijar</strong> lo pone en el lateral (con caducidad
            opcional: 1/7/30 días o fecha), <strong style={{ color: "#a855f7" }}>🔍 Demanda</strong> lo deja
            sólo en este catálogo (el estado por defecto), <strong>🗄️ Archivar</strong> lo saca del catálogo
            activo sin romper su URL.
          </span>
          <span>
            <strong>5 · Comparte</strong> el enlace profundo del panel:{" "}
            <code style={code}>/?view=paneles&amp;panel=&lt;slug&gt;</code> — el botón «Copiar enlace» del visor
            lo arma por ti.
          </span>
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

export function PanelesView({ onClose, initialPanelDir, onOpenSession, onOpenNativePanel }: PanelesViewProps) {
  const { paneles, activeCount, loading, error, refresh } = usePaneles();
  const { states, setNativePanelState } = useNativePanelStates();
  const [filter, setFilter] = useState<Filter>("activos");
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialPanelDir ?? null);
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  /** The last `initialPanelDir` already applied: a new one (the sidebar's
   *  pinned strip asking for a panel) navigates even mid-session. */
  const appliedDirRef = useRef(initialPanelDir ?? null);

  const catalog = useMemo(() => mergeCatalogPanels(paneles, states), [paneles, states]);

  const selectPanel = useCallback((slug: string | null) => {
    setSelectedSlug(slug);
    setIframeKey((key) => key + 1);
    syncPanelParam(slug);
  }, []);

  // A deep link asked again after mount (the pins strip): apply it once.
  useEffect(() => {
    if (initialPanelDir && initialPanelDir !== appliedDirRef.current) {
      appliedDirRef.current = initialPanelDir;
      selectPanel(initialPanelDir);
    }
  }, [initialPanelDir, selectPanel]);

  // A stale `?panel=` deep link (renamed or archived dir) falls back to the grid.
  useEffect(() => {
    if (selectedSlug && paneles.length > 0 && !paneles.some((p) => p.slug === selectedSlug)) {
      selectPanel(null);
    }
  }, [paneles, selectedSlug, selectPanel]);

  const filtered = useMemo(() => {
    const byText = filterCatalogPanelsByText(catalog, search);
    return byText.filter((p) => {
      if (filter === "activos" && p.visibility === "archivado") return false;
      if (filter === "archivados" && p.visibility !== "archivado") return false;
      return true;
    });
  }, [catalog, filter, search]);

  /** Grid sections by tipo (categoría): known categories in a fixed order,
      unknown ones alphabetical after them; panels keep their fecha order. */
  const grouped = useMemo(() => {
    const buckets = new Map<string, CatalogPanel[]>();
    for (const panel of filtered) {
      const bucket = buckets.get(panel.tipo);
      if (bucket) bucket.push(panel);
      else buckets.set(panel.tipo, [panel]);
    }
    return [...buckets.entries()]
      .sort((a, b) => {
        const rank = panelTipoRank(a[0]) - panelTipoRank(b[0]);
        return rank !== 0 ? rank : a[0].localeCompare(b[0]);
      })
      .map(([tipo, panelesOfTipo]) => ({ tipo, paneles: panelesOfTipo }));
  }, [filtered]);

  const selected = useMemo(
    () => catalog.find((p) => p.kind === "html" && p.slug === selectedSlug) ?? null,
    [catalog, selectedSlug],
  );

  /** The catalog's one write (VisibilityControl and the viewer header): HTML
   *  panels through POST /api/paneles, native ones through sidebar prefs. */
  const write = useCallback(
    async (panel: CatalogPanel, visibilidad: PanelVisibility, expira?: string | null) => {
      if (busyKey) return;
      setBusyKey(panel.key);
      setWriteError(null);
      try {
        if (panel.kind === "native" && panel.nativeId) {
          setNativePanelState(panel.nativeId, {
            visibilidad,
            expira: expira === undefined ? panel.expira : expira,
          });
        } else if (panel.slug) {
          const response = await fetch("/api/paneles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: panel.slug, visibilidad, ...(expira === undefined ? {} : { expira }) }),
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `Error ${response.status}`);
          }
          refresh();
        }
      } catch (cause: unknown) {
        setWriteError(cause instanceof Error ? cause.message : "No se pudo guardar");
      } finally {
        setBusyKey(null);
      }
    },
    [busyKey, refresh, setNativePanelState],
  );

  const openNative = useCallback(
    (panel: CatalogPanel) => {
      if (panel.nativeId && onOpenNativePanel) onOpenNativePanel(panel.nativeId);
      else if (panel.nativeId === "post-studio") window.location.href = "/?view=post-studio";
    },
    [onOpenNativePanel],
  );

  const copySelectedLink = useCallback(() => {
    if (!selected) return;
    const url = `${window.location.origin}/?view=paneles&panel=${encodeURIComponent(selected.slug ?? "")}`;
    copyText(url)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {
        // Clipboard denied: the transient state simply never shows.
      });
  }, [selected]);

  const renderCard = (panel: CatalogPanel) => (
    <PanelCard
      key={panel.key}
      panel={panel}
      onOpen={() => {
        if (panel.kind === "native") openNative(panel);
        else if (panel.slug) selectPanel(panel.slug);
      }}
      onOpenSession={onOpenSession}
      busy={busyKey === panel.key}
      write={(visibilidad, expira) => {
        void write(panel, visibilidad, expira);
      }}
    />
  );

  const selectedExpiry = selected?.expira ? panelExpiryState(selected.expira) : null;

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap", rowGap: 8 }}>
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
        <h1
          title={selected ? selected.titulo : undefined}
          style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flex: "1 1 auto" }}
        >
          {selected ? selected.titulo : "Paneles e Informes"}
        </h1>
        {selected ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-muted)", flexWrap: "wrap", minWidth: 0 }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                background: panelTipoMeta(selected.tipo).bg,
                color: panelTipoMeta(selected.tipo).color,
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
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {writeError ? (
          <span title={writeError} style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {writeError}
          </span>
        ) : null}
        {selected ? (
          <>
            {selected.visibility === "fijado" && selected.expira && selectedExpiry ? (
              <span
                title={`Fijado hasta el ${formatPanelExpiry(selected.expira)}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 999,
                  color: selectedExpiry.daysLeft <= 3 ? "#f59e0b" : "var(--text-muted)",
                  background: selectedExpiry.daysLeft <= 3 ? "rgba(245, 158, 11, 0.14)" : "var(--bg-selected)",
                }}
              >
                ⏳ {panelExpiryCountdown(selectedExpiry)}
              </span>
            ) : null}
            <button
              type="button"
              disabled={busyKey === selected.key}
              onClick={() => {
                void write(selected, selected.visibility === "fijado" ? "demanda" : "fijado", null);
              }}
              title={selected.visibility === "fijado" ? "Quitar del lateral (vuelve a bajo demanda)" : "Fijar en el lateral sin caducidad"}
              className="config-button config-button-small config-button-secondary"
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 6, cursor: busyKey === selected.key ? "wait" : "pointer" }}
            >
              {selected.visibility === "fijado" ? "🔍 Quitar del lateral" : "📌 Fijar"}
            </button>
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
              onClick={() => window.open(`/api/paneles/${encodeURIComponent(selected.slug ?? "")}/`, "_blank", "noopener")}
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

      <GenerationFlowHelp open={helpOpen} onToggle={() => setHelpOpen((open) => !open)} />

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
          {catalog.length > 0
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
            const meta = panelTipoMeta(tipo);
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
      src={`/api/paneles/${encodeURIComponent(selected.slug ?? "")}/`}
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
      {selected ? <PanelSessionsStrip slug={selected.slug ?? ""} onOpenSession={onOpenSession} /> : null}
      {selected ? viewer : grid}
    </div>
  );
}
