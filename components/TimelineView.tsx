"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dayKey,
  formatDayLabel,
  splitTimeline,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/timeline-data";

export interface TimelineViewProps {
  onSelectSession?: (sessionId: string) => void;
}

const REFRESH_MS = 15_000;

interface TimelineResponse {
  capturedAt: string;
  events: TimelineEvent[];
}

const KIND_META: Record<TimelineKind, { icon: string; label: string; color: string }> = {
  encargo: { icon: "📦", label: "Encargos", color: "#38bdf8" },
  decision: { icon: "🎯", label: "Decisiones", color: "#a855f7" },
  fallo: { icon: "⚠️", label: "Fallos", color: "#f59e0b" },
  informe: { icon: "📄", label: "Informes", color: "#94a3b8" },
  recibo: { icon: "🧾", label: "Recibos", color: "#64748b" },
  sesion: { icon: "💬", label: "Sesiones", color: "#22c55e" },
  rutina: { icon: "⏱️", label: "Rutinas", color: "#eab308" },
  calendario: { icon: "📅", label: "Calendario", color: "#ec4899" },
};

function timeLabel(event: TimelineEvent): string {
  const date = new Date(event.ts);
  if (Number.isNaN(date.getTime())) return "";
  if (event.status === "Todo el día") return "todo el día";
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

interface DayGroup {
  key: string;
  label: string;
  events: TimelineEvent[];
}

function groupByDay(events: TimelineEvent[], nowMs: number): DayGroup[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const time = Date.parse(event.ts);
    if (!Number.isFinite(time)) continue;
    const key = dayKey(new Date(time));
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }
  return [...groups.entries()].map(([key, dayEvents]) => ({
    key,
    label: formatDayLabel(key, nowMs),
    events: dayEvents,
  }));
}

export function TimelineView({ onSelectSession }: TimelineViewProps) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<"all" | TimelineKind>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/timeline", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Timeline ${response.status}`);
        return response.json() as Promise<TimelineResponse>;
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.events ?? []).filter((event) => {
      if (kindFilter !== "all" && event.kind !== kindFilter) return false;
      if (!query) return true;
      return `${event.title} ${event.detail ?? ""} ${event.category ?? ""} ${event.status ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [data, kindFilter, search]);

  const split = useMemo(() => splitTimeline(filtered, now), [filtered, now]);
  const pastDays = useMemo(() => groupByDay(split.past, now), [split.past, now]);
  const todayGroup = useMemo<DayGroup | null>(() => {
    const key = dayKey(new Date(now));
    if (!split.today.length) return null;
    return { key, label: "Hoy", events: split.today };
  }, [split.today, now]);
  const futureDays = useMemo(() => groupByDay(split.future, now), [split.future, now]);

  const kindCounts = useMemo(() => {
    const counts = new Map<TimelineKind, number>();
    for (const event of data?.events ?? []) {
      counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    }
    return counts;
  }, [data]);

  const renderEvent = (event: TimelineEvent) => {
    const meta = KIND_META[event.kind] ?? KIND_META.encargo;
    const clickable = event.kind === "sesion" && event.sessionId && onSelectSession;
    return (
      <button
        key={event.id}
        type="button"
        disabled={!clickable}
        onClick={clickable ? () => onSelectSession?.(event.sessionId as string) : undefined}
        title={clickable ? "Abrir sesión" : event.title}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          width: "100%",
          textAlign: "left",
          padding: "8px 10px",
          minHeight: 40,
          background: "transparent",
          border: "none",
          borderBottom: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
          color: "var(--text)",
          cursor: clickable ? "pointer" : "default",
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
        onMouseEnter={(e) => {
          if (clickable) e.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (clickable) e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", flexShrink: 0 }} aria-hidden="true">{meta.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", overflowWrap: "anywhere" }}>{event.title}</span>
          {(event.category || event.status || event.detail) && (
            <span style={{ display: "block", color: "var(--text-dim, #888)", fontSize: 11, marginTop: 2, overflowWrap: "anywhere" }}>
              {[timeLabel(event), event.category, event.status, event.detail].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      </button>
    );
  };

  const renderDay = (day: DayGroup) => (
    <section key={day.key}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 10px",
          background: "var(--bg-panel)",
          borderBottom: "1px solid var(--border)",
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: "0.02em",
          color: "var(--text)",
          textTransform: "capitalize",
        }}
      >
        <span>{day.label}</span>
        <span style={{ color: "var(--text-dim, #888)", fontWeight: 500 }}>{day.events.length}</span>
      </div>
      {day.events.map(renderEvent)}
    </section>
  );

  const sectionTitle = (label: string, count: number, accent: string) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 10px 6px",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: accent,
      }}
    >
      <span>{label}</span>
      <span style={{ color: "var(--text-dim, #888)", fontWeight: 500 }}>{count}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg)" }}>
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ color: "var(--accent)", fontSize: 15 }} aria-hidden="true">🗓️</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Línea de tiempo</div>
            <div style={{ fontSize: 11, color: "var(--text-dim, #888)" }}>
              {loading ? "cargando…" : `${filtered.length} eventos · pasado / hoy / próximo`}
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          onClick={() => setKindFilter("all")}
          style={chipStyle(kindFilter === "all")}
        >
          Todos {(data?.events ?? []).length}
        </button>
        {(Object.keys(KIND_META) as TimelineKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter(kindFilter === kind ? "all" : kind)}
            style={chipStyle(kindFilter === kind)}
          >
            {KIND_META[kind].icon} {KIND_META[kind].label} {kindCounts.get(kind) ?? 0}
          </button>
        ))}
      </div>

      <div style={{ flexShrink: 0, padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en la línea de tiempo…"
          aria-label="Buscar eventos"
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: 36,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg-panel)",
            color: "var(--text)",
            fontSize: 12.5,
            outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {error ? (
          <div style={{ padding: 24, textAlign: "center", color: "#f87171", fontSize: 12.5 }}>
            ⚠️ {error}
          </div>
        ) : !loading && filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim, #888)", fontSize: 12.5 }}>
            Sin eventos para este filtro.
          </div>
        ) : (
          <>
            {futureDays.length > 0 && (
              <>
                {sectionTitle("Próximo", split.future.length, "#22c55e")}
                {futureDays.map(renderDay)}
              </>
            )}
            {todayGroup && (
              <>
                {sectionTitle("Hoy", split.today.length, "var(--accent)")}
                <div style={{ margin: "0 8px 4px", border: "1px solid color-mix(in srgb, var(--accent) 45%, transparent)", borderRadius: 10, overflow: "hidden" }}>
                  {todayGroup.events.map(renderEvent)}
                </div>
              </>
            )}
            {pastDays.length > 0 && (
              <>
                {sectionTitle("Pasado", split.past.length, "var(--text-dim, #888)")}
                {pastDays.map(renderDay)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
    background: active ? "color-mix(in srgb, var(--accent) 14%, var(--bg-panel))" : "var(--bg-panel)",
    color: active ? "var(--accent)" : "var(--text)",
    cursor: "pointer",
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
