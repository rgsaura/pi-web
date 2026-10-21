"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePaneles } from "@/hooks/usePaneles";
import { useNativePanelStates } from "@/hooks/useNativePanelStates";
import {
  mergeCatalogPanels,
  moveKey,
  orderPinnedPanels,
  panelExpiryCountdown,
  panelExpiryState,
  panelTipoMeta,
  type CatalogPanel,
} from "@/lib/panel-catalog";
import { loadPanelPinOrder, loadPanelPinsCollapsed, savePanelPinOrder, savePanelPinsCollapsed } from "@/lib/sidebar-prefs";

/**
 * The sidebar's pinned-panels strip: every panel the catalog has "fijado"
 * (HTML panels from their panel.json, native views from this browser's
 * sidebar prefs), as one-touch access in the order Rodrigo dragged them.
 * A pin with an expiry shows its countdown and quietly falls back to the
 * catalog once the date passes. Nothing pinned: the strip disappears — the
 * catalog view (?view=paneles) manages everything.
 *
 * Reordering is pointer-based (not HTML5 drag and drop: it never starts
 * from a touch on iOS). Rows are one fixed stride tall, so the drop index
 * comes from arithmetic, never from the DOM.
 */

export interface PanelPinsProps {
  /** Opens one HTML panel in the catalog's viewer (`?view=paneles&panel=…`). */
  onOpenPanel?: (slug: string) => void;
  /** Opens a native panel's view (e.g. Post Studio). */
  onOpenNativePanel?: (id: string) => void;
  /** Opens the catalog view itself (the strip's "gestionar" affordance). */
  onOpenPanelesView?: () => void;
}

/** One row's total footprint: height + the grid's row gap. */
const ROW_STRIDE_PX = 40;
/** A finger that moves this far before the long press ends it: scrolling. */
const DRAG_SLOP_PX = 6;
/** Touch/pen hold this long before the row can be picked up. */
const LONG_PRESS_MS = 300;
/** A release that produced a drop swallows its own click. */
const CLICK_SUPPRESS_MS = 400;

interface DragState {
  pointerId: number;
  pointerType: string;
  fromIndex: number;
  startY: number;
  lastY: number;
  moved: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  pickedUp: boolean;
}

export function PanelPins({ onOpenPanel, onOpenNativePanel, onOpenPanelesView }: PanelPinsProps) {
  const { paneles } = usePaneles();
  const { states } = useNativePanelStates();
  const [order, setOrder] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [drag, setDrag] = useState<{ key: string; fromIndex: number; toIndex: number; dy: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const lastDropAtRef = useRef(0);

  // Sidebar memories restore after mount, never in a state initializer.
  useEffect(() => {
    setOrder(loadPanelPinOrder());
    setCollapsed(loadPanelPinsCollapsed());
  }, []);

  const catalog = useMemo(() => mergeCatalogPanels(paneles, states), [paneles, states]);
  const pinned = useMemo(
    () => orderPinnedPanels(catalog.filter((panel) => panel.visibility === "fijado"), order),
    [catalog, order],
  );

  const openPanel = useCallback(
    (panel: CatalogPanel) => {
      if (Date.now() - lastDropAtRef.current < CLICK_SUPPRESS_MS) return;
      if (panel.kind === "native" && panel.nativeId) onOpenNativePanel?.(panel.nativeId);
      else if (panel.slug) onOpenPanel?.(panel.slug);
      else onOpenPanelesView?.();
    },
    [onOpenNativePanel, onOpenPanel, onOpenPanelesView],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const state = dragRef.current;
      dragRef.current = null;
      if (state?.longPressTimer) clearTimeout(state.longPressTimer);
      setDrag(null);
      if (!commit || !state?.pickedUp || !drag) return;
      if (drag.toIndex !== drag.fromIndex) {
        const keys = pinned.map((panel) => panel.key);
        const next = moveKey(keys, drag.fromIndex, drag.toIndex);
        setOrder(next);
        savePanelPinOrder(next);
      }
      lastDropAtRef.current = Date.now();
    },
    // `drag` is read for the commit only; the callback identity may change.
    [drag, pinned],
  );

  const onHandleDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, index: number, key: string) => {
      if (dragRef.current) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const state: DragState = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        fromIndex: index,
        startY: event.clientY,
        lastY: event.clientY,
        moved: false,
        longPressTimer: null,
        pickedUp: event.pointerType === "mouse",
      };
      dragRef.current = state;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (state.pickedUp) {
        // Mouse: the row is picked up at once, so the drag state exists from
        // the first move (touch/pen wait for their long press below).
        setDrag({ key, fromIndex: index, toIndex: index, dy: 0 });
      } else {
        state.longPressTimer = setTimeout(() => {
          const current = dragRef.current;
          if (current === state && current.moved === false) {
            current.pickedUp = true;
            setDrag({ key, fromIndex: index, toIndex: index, dy: 0 });
            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
          }
        }, LONG_PRESS_MS);
      }
    },
    [],
  );

  const onHandleMove = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      state.lastY = event.clientY;
      const dy = event.clientY - state.startY;
      if (Math.abs(dy) > DRAG_SLOP_PX) {
        state.moved = true;
        if (state.longPressTimer) {
          clearTimeout(state.longPressTimer);
          state.longPressTimer = null;
          // A finger that moves before the long press was scrolling: let go.
          if (!state.pickedUp) {
            dragRef.current = null;
            try {
              event.currentTarget.releasePointerCapture(state.pointerId);
            } catch {
              // Already gone.
            }
            return;
          }
        }
      }
      if (!state.pickedUp) return;
      const raw = state.fromIndex + Math.round(dy / ROW_STRIDE_PX);
      const toIndex = Math.max(0, Math.min(pinned.length - 1, raw));
      setDrag((current) => (current ? { ...current, dy, toIndex } : current));
    },
    [pinned.length],
  );

  const onHandleUp = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>) => {
      const state = dragRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(state.pointerId);
      } catch {
        // Already gone.
      }
      finishDrag(true);
    },
    [finishDrag],
  );

  if (pinned.length === 0) return null;

  return (
    <section
      aria-label="Paneles fijados"
      style={{
        flexShrink: 0,
        padding: "6px 10px 8px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "color-mix(in srgb, var(--bg-panel) 60%, var(--bg))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "0 2px" }}>
        <button
          type="button"
          onClick={() => {
            setCollapsed((value) => {
              savePanelPinsCollapsed(!value);
              return !value;
            });
          }}
          aria-expanded={!collapsed}
          title={collapsed ? "Desplegar paneles fijados" : "Plegar paneles fijados"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 10.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 11 }}>📌</span>
          <span>Fijados · {pinned.length}</span>
          <span aria-hidden="true" style={{ fontSize: 8, transition: "transform 0.15s", transform: collapsed ? "rotate(-90deg)" : "none" }}>▼</span>
        </button>
        {onOpenPanelesView ? (
          <button
            type="button"
            onClick={onOpenPanelesView}
            title="Gestionar paneles: catálogo, visibilidad y caducidad"
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--accent)",
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            gestionar
          </button>
        ) : null}
      </div>
      {collapsed ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative" }}>
          {pinned.map((panel, index) => {
            const isDragging = drag?.key === panel.key && drag.fromIndex === index;
            const tipo = panelTipoMeta(panel.tipo);
            const expiry = panelExpiryState(panel.expira);
            const dropBefore = drag !== null && drag.toIndex === index && drag.fromIndex !== index;
            return (
              <div key={panel.key} style={{ position: "relative" }}>
                {dropBefore && index !== 0 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: -3,
                      left: 4,
                      right: 4,
                      height: 2,
                      borderRadius: 2,
                      background: "var(--accent)",
                      boxShadow: "0 0 6px var(--accent)",
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => openPanel(panel)}
                  title={`${panel.titulo} — ${panel.kind === "native" ? "vista del sistema" : "abrir panel"}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    minHeight: 36,
                    padding: "6px 8px 6px 6px",
                    borderRadius: 9,
                    border: `1px solid ${isDragging ? "var(--accent)" : "var(--border)"}`,
                    background: "var(--bg-panel)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    boxShadow: isDragging ? "0 6px 16px rgba(0,0,0,0.28)" : "0 1px 2px rgba(0,0,0,0.06)",
                    transform: isDragging ? `translateY(${drag?.dy ?? 0}px) scale(1.02)` : "none",
                    opacity: isDragging ? 0.92 : 1,
                    transition: isDragging ? "none" : "border-color 0.12s, background 0.12s",
                    zIndex: isDragging ? 2 : undefined,
                    touchAction: "pan-y",
                  }}
                  onMouseEnter={(e) => {
                    if (!isDragging) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isDragging) e.currentTarget.style.background = "var(--bg-panel)";
                  }}
                >
                  <span
                    onPointerDown={(e) => onHandleDown(e, index, panel.key)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    aria-hidden="true"
                    title="Arrastra para reordenar (mantén pulsado en táctil)"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 24,
                      flexShrink: 0,
                      color: "var(--text-dim, #888)",
                      cursor: "grab",
                      fontSize: 12,
                      letterSpacing: "-1px",
                      touchAction: "none",
                      userSelect: "none",
                    }}
                  >
                    ⠿
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      borderRadius: 7,
                      background: tipo.bg,
                      fontSize: 12.5,
                      flexShrink: 0,
                    }}
                  >
                    {panel.icon ?? tipo.icon}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "left",
                    }}
                  >
                    {panel.titulo}
                  </span>
                  {expiry && !expiry.expired ? (
                    <span
                      title={`Caduca ${panel.expira}`}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 999,
                        flexShrink: 0,
                        color: expiry.daysLeft <= 3 ? "#f59e0b" : "var(--text-muted)",
                        background: expiry.daysLeft <= 3 ? "rgba(245, 158, 11, 0.14)" : "var(--bg-selected)",
                      }}
                    >
                      ⏳ {panelExpiryCountdown(expiry)}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
          {drag && drag.toIndex === pinned.length - 1 && drag.fromIndex !== drag.toIndex ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: -3,
                left: 4,
                right: 4,
                height: 2,
                borderRadius: 2,
                background: "var(--accent)",
                boxShadow: "0 0 6px var(--accent)",
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
