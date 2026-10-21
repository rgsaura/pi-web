"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dayKey,
  formatDayLabel,
  splitTimeline,
  type TimelineEvent,
  type TimelineKind,
} from "@/lib/timeline-data";
import {
  computePatterns,
  guessCategory,
  hourBand,
  parseQuickEntry,
  suggestForHour,
  toTimelineEvent,
  type RetroEvent,
} from "@/lib/timeline-retro";

export interface TimelineViewProps {
  onClose?: () => void;
  onSelectSession?: (sessionId: string) => void;
}

const REFRESH_MS = 15_000;

interface TimelineResponse {
  capturedAt: string;
  events: TimelineEvent[];
}

interface RetroResponse {
  capturedAt: string;
  events: RetroEvent[];
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
  manual: { icon: "🕰️", label: "Retro", color: "#14b8a6" },
};

const DURATIONS: { label: string; minutes: number | null }[] = [
  { label: "—", minutes: null },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "2h", minutes: 120 },
  { label: "3h", minutes: 180 },
];

function timeLabel(event: TimelineEvent): string {
  const date = new Date(event.ts);
  if (Number.isNaN(date.getTime())) return "";
  if (event.status === "Todo el día") return "todo el día";
  const start = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (event.endTs) {
    const end = new Date(event.endTs);
    if (!Number.isNaN(end.getTime())) {
      return `${start}–${end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    }
  }
  return start;
}

function localDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimeValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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

export function TimelineView({ onClose, onSelectSession }: TimelineViewProps) {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [retroEvents, setRetroEvents] = useState<RetroEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<"all" | TimelineKind>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<"eventos" | "patrones">("eventos");
  const [notice, setNotice] = useState<string | null>(null);

  // --- Quick retro entry -------------------------------------------------
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryText, setEntryText] = useState("");
  const [entryDate, setEntryDate] = useState(() => localDateValue(new Date()));
  const [entryTime, setEntryTime] = useState(() => {
    const current = new Date();
    return localTimeValue(current.getHours(), 0);
  });
  const [entryCategory, setEntryCategory] = useState("");
  const [entryDuration, setEntryDuration] = useState<number | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const autoCategory = useRef<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const parsed = useMemo(() => parseQuickEntry(entryText, now), [entryText, now]);
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;

  // A successful parse drives the date/time pickers once per matched clause;
  // manual picker edits stay until the clause itself changes again.
  const matchedClause = parsed?.when?.matched ?? "";
  useEffect(() => {
    if (!matchedClause) return;
    const { date, hour, minute } = parsedRef.current.when ?? { date: null, hour: null, minute: null };
    if (!date) return;
    setEntryDate(localDateValue(date));
    if (hour !== null) setEntryTime(localTimeValue(hour, minute ?? 0));
  }, [matchedClause]);

  // The guessed category only fills an untouched field.
  useEffect(() => {
    const guess = guessCategory(parsed?.title ?? "");
    if (entryCategory === "" || entryCategory === autoCategory.current) {
      autoCategory.current = guess;
      setEntryCategory(guess ?? "");
    }
  }, [parsed?.title, entryCategory]);

  const effectiveHour = useMemo(() => {
    const fromPickers = Number(entryTime.split(":")[0]);
    if (Number.isFinite(fromPickers) && fromPickers >= 0 && fromPickers <= 23) return fromPickers;
    return new Date(now).getHours();
  }, [entryTime, now]);

  const suggestions = useMemo(() => suggestForHour(retroEvents, effectiveHour), [retroEvents, effectiveHour]);
  const patterns = useMemo(() => computePatterns(retroEvents), [retroEvents]);

  const flashNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/timeline", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Timeline ${response.status}`);
          return response.json() as Promise<TimelineResponse>;
        }),
      fetch("/api/timeline/events", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`Retro ${response.status}`);
          return response.json() as Promise<RetroResponse>;
        })
        .catch(() => ({ events: [] as RetroEvent[] })),
    ])
      .then(([timeline, retro]) => {
        setData(timeline);
        setRetroEvents(retro.events ?? []);
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

  // Manual events come from the uncached ledger route; the merged snapshot's
  // own copy is dropped so an add/delete shows up instantly.
  const mergedEvents = useMemo(() => {
    const nonManual = (data?.events ?? []).filter((event) => event.kind !== "manual");
    return [...nonManual, ...retroEvents.map(toTimelineEvent)];
  }, [data, retroEvents]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mergedEvents.filter((event) => {
      if (kindFilter !== "all" && event.kind !== kindFilter) return false;
      if (!query) return true;
      return `${event.title} ${event.detail ?? ""} ${event.category ?? ""} ${event.status ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [mergedEvents, kindFilter, search]);

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
    for (const event of mergedEvents) {
      counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
    }
    return counts;
  }, [mergedEvents]);

  const submitEntry = async () => {
    if (entryBusy) return;
    const title = (parsed?.title || entryText).trim();
    if (!title) {
      setEntryError("Escribe qué pasó");
      return;
    }
    const [year, month, day] = entryDate.split("-").map(Number);
    const [hour, minute] = entryTime.split(":").map(Number);
    const base = new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
    if (Number.isNaN(base.getTime())) {
      setEntryError("Fecha u hora no válidas");
      return;
    }
    const payload = {
      title,
      ts: base.toISOString(),
      endTs: entryDuration ? new Date(base.getTime() + entryDuration * 60_000).toISOString() : undefined,
      category: entryCategory.trim() || undefined,
    };
    setEntryBusy(true);
    setEntryError(null);
    try {
      const response = await fetch("/api/timeline/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setEntryText("");
      setEntryDuration(null);
      setEntryError(null);
      flashNotice("✓ Añadido a tu timeline");
      const refreshed = await fetch("/api/timeline/events", { cache: "no-store" });
      if (refreshed.ok) {
        const body2 = (await refreshed.json()) as RetroResponse;
        setRetroEvents(body2.events ?? []);
      }
    } catch (cause: unknown) {
      setEntryError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEntryBusy(false);
    }
  };

  const deleteManualEvent = async (event: TimelineEvent) => {
    try {
      const response = await fetch(`/api/timeline/events?id=${encodeURIComponent(event.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      setRetroEvents((current) => current.filter((item) => item.id !== event.id));
      flashNotice(`Eliminado «${event.title.slice(0, 40)}»`);
    } catch (cause: unknown) {
      flashNotice(cause instanceof Error ? `⚠️ ${cause.message}` : "⚠️ no se pudo eliminar");
    }
  };

  const renderEvent = (event: TimelineEvent) => {
    const meta = KIND_META[event.kind] ?? KIND_META.encargo;
    const clickable = event.kind === "sesion" && event.sessionId && onSelectSession;
    const manual = event.kind === "manual";
    return (
      <div
        key={event.id}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          width: "100%",
          padding: "8px 10px",
          minHeight: 40,
          borderBottom: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
          color: "var(--text)",
          fontSize: 12.5,
          lineHeight: 1.45,
          background: "transparent",
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", flexShrink: 0 }} aria-hidden="true">{meta.icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            title={event.title}
            style={{
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: 3,
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {event.title}
          </span>
          {(event.category || event.status || event.detail || event.ts) && (
            <span
              title={[timeLabel(event), event.category, event.status, event.detail].filter(Boolean).join(" · ")}
              style={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
                color: "var(--text-dim, #888)",
                fontSize: 11,
                marginTop: 2,
                overflowWrap: "anywhere",
              }}
            >
              {[timeLabel(event), event.category, event.status, event.detail].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        {manual && (
          <button
            type="button"
            onClick={() => deleteManualEvent(event)}
            aria-label={`Eliminar ${event.title}`}
            title="Eliminar este evento retro"
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
        {clickable && (
          <button
            type="button"
            onClick={() => onSelectSession?.(event.sessionId as string)}
            title="Abrir sesión"
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-panel)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            →
          </button>
        )}
      </div>
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

  const entryPanel = entryOpen ? (
    <div
      style={{
        flexShrink: 0,
        margin: 10,
        padding: 12,
        borderRadius: 12,
        border: "1px solid color-mix(in srgb, var(--accent) 40%, transparent)",
        background: "var(--bg-panel)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>🕰️ Añadir algo del pasado</div>
        <button
          type="button"
          onClick={() => setEntryOpen(false)}
          aria-label="Cerrar formulario"
          style={{ ...smallButtonStyle(), alignSelf: "flex-start" }}
        >
          ✕
        </button>
      </div>

      <input
        type="text"
        value={entryText}
        onChange={(e) => setEntryText(e.target.value)}
        placeholder={'p. ej. "ayer 18h cine con Agus" · "lunes 9h gym" · "20/10 19:30 cena"'}
        aria-label="Entrada rápida de evento pasado"
        style={inputStyle}
      />

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 3 }}>
        <span>
          🗓️{" "}
          <strong style={{ color: "var(--text)" }}>
            {formatDayLabel(entryDate, now)} · {entryTime || "--:--"}
          </strong>{" "}
          · {hourBand(effectiveHour).icon} {hourBand(effectiveHour).label}
          {parsed?.title ? ` · «${parsed.title}»` : ""}
        </span>
        {!parsed?.when && <span style={{ fontSize: 11, color: "var(--text-dim, #888)" }}>💡 Sin fecha en el texto: ajusta día y hora abajo</span>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          aria-label="Día del evento"
          style={{ ...inputStyle, flex: 1 }}
        />
        <input
          type="time"
          value={entryTime}
          onChange={(e) => setEntryTime(e.target.value)}
          aria-label="Hora del evento"
          style={{ ...inputStyle, flex: "0 0 110px" }}
        />
      </div>

      <div>
        <div style={{ fontSize: 11, color: "var(--text-dim, #888)", marginBottom: 4 }}>Categoría</div>
        <div
          style={{
            display: "flex",
            gap: 6,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            paddingBottom: 2,
            marginBottom: 6,
          }}
        >
          {(suggestions.categories.length
            ? suggestions.categories.map((item) => item.name)
            : [guessCategory(parsed?.title ?? "")]
          )
            .filter((name): name is string => Boolean(name))
            .slice(0, 4)
            .map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setEntryCategory(name)}
                style={chipStyle(entryCategory.toLowerCase() === name.toLowerCase())}
              >
                {name}
              </button>
            ))}
          {patterns.categories.slice(0, 4).map((item) => (
            <button
              key={`learned-${item.name}`}
              type="button"
              onClick={() => setEntryCategory(item.name)}
              style={chipStyle(entryCategory.toLowerCase() === item.name.toLowerCase())}
            >
              {item.name} ×{item.count}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={entryCategory}
          onChange={(e) => setEntryCategory(e.target.value)}
          list="timeline-categories"
          placeholder="Otra categoría…"
          aria-label="Categoría del evento"
          style={inputStyle}
        />
        <datalist id="timeline-categories">
          {patterns.categories.map((item) => (
            <option key={item.name} value={item.name} />
          ))}
        </datalist>
      </div>

      {suggestions.repeats.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim, #888)", marginBottom: 4 }}>
            A esta hora sueles…
          </div>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
            {suggestions.repeats.map((item) => (
              <button
                key={`repeat-${item.title}`}
                type="button"
                onClick={() => setEntryText(item.title)}
                title={`Visto ${item.count} vez/veces a esta hora`}
                style={chipStyle(false)}
              >
                ↻ {item.title.slice(0, 30)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, color: "var(--text-dim, #888)", marginBottom: 4 }}>Duración</div>
        <div style={{ display: "flex", gap: 6 }}>
          {DURATIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setEntryDuration(option.minutes)}
              style={chipStyle(entryDuration === option.minutes)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {entryError && (
        <div style={{ fontSize: 11.5, color: "#f87171" }} role="alert">
          ⚠️ {entryError}
        </div>
      )}

      <button
        type="button"
        onClick={submitEntry}
        disabled={entryBusy}
        style={{
          minHeight: 38,
          borderRadius: 10,
          border: "1px solid var(--accent)",
          background: entryBusy ? "color-mix(in srgb, var(--accent) 25%, var(--bg-panel))" : "var(--accent)",
          color: entryBusy ? "var(--text-muted)" : "var(--bg)",
          fontWeight: 700,
          fontSize: 12.5,
          cursor: entryBusy ? "wait" : "pointer",
        }}
      >
        {entryBusy ? "Guardando…" : "Añadir evento"}
      </button>
    </div>
  ) : null;

  const patternsPanel = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      {patterns.total === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim, #888)", fontSize: 12.5 }}>
          Aún no hay eventos retroactivos. Añade cosas del pasado con 🕰️ y aquí
          aparecerán tus patrones por hora.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={statChipStyle}>📅 {patterns.total} eventos</span>
            {patterns.peakHour !== null && (
              <span style={statChipStyle}>
                ⏰ punta {String(patterns.peakHour).padStart(2, "0")}:00
              </span>
            )}
            {(() => {
              const busiest = patterns.bands.reduce((best, band) => (band.count > best.count ? band : best), patterns.bands[0]);
              return busiest && busiest.count > 0 ? (
                <span style={statChipStyle}>
                  {busiest.band.icon} {busiest.band.label.toLowerCase()}
                </span>
              ) : null;
            })()}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
              Actividad por hora
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 88 }}>
              {patterns.histogram.map((count, hour) => {
                const band = hourBand(hour);
                const max = Math.max(...patterns.histogram, 1);
                return (
                  <div
                    key={hour}
                    title={`${String(hour).padStart(2, "0")}:00 · ${count} evento/s`}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      height: "100%",
                      minHeight: 0,
                    }}
                  >
                    <div
                      style={{
                        height: `${Math.max(count > 0 ? 6 : 2, Math.round((count / max) * 100))}%`,
                        minHeight: 2,
                        borderRadius: "3px 3px 0 0",
                        background:
                          count > 0
                            ? patterns.peakHour === hour
                              ? "var(--accent)"
                              : `color-mix(in srgb, ${band.color} 70%, transparent)`
                            : "color-mix(in srgb, var(--border) 45%, transparent)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
              {patterns.histogram.map((_, hour) => (
                <div
                  key={hour}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    fontSize: 8.5,
                    color: hour % 3 === 0 ? "var(--text-dim, #888)" : "transparent",
                    fontVariantNumeric: "tabular-nums",
                    userSelect: "none",
                  }}
                >
                  {String(hour).padStart(2, "0")}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {patterns.bands.map((stat) => (
              <div
                key={stat.band.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  opacity: stat.count === 0 ? 0.55 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <span aria-hidden="true">{stat.band.icon}</span>
                  <span>{stat.band.label}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 500, fontSize: 11, color: "var(--text-dim, #888)" }}>
                    {stat.count} evento/s · {stat.days} día/s
                  </span>
                </div>
                {stat.topCategories.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {stat.topCategories.map((item) => (
                      <span
                        key={item.name}
                        style={{
                          ...statChipStyle,
                          borderColor: `color-mix(in srgb, ${stat.band.color} 45%, transparent)`,
                        }}
                      >
                        {item.name} ×{item.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {patterns.patterns.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 6 }}>
                Patrones detectados
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5 }}>
                {patterns.patterns.map((phrase) => (
                  <li key={phrase}>{phrase}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setEntryOpen(true)}
            aria-label="Añadir evento pasado"
            title="Añadir algo del pasado"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              minHeight: 34,
              padding: "4px 12px",
              borderRadius: 9,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "var(--bg)",
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ＋ Añadir
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Cerrar" style={{ ...smallButtonStyle() }}>
              ✕
            </button>
          )}
        </div>
      </header>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button type="button" onClick={() => setTab("eventos")} style={chipStyle(tab === "eventos")}>
          📜 Eventos
        </button>
        <button type="button" onClick={() => setTab("patrones")} style={chipStyle(tab === "patrones")}>
          📊 Patrones por hora
        </button>
      </div>

      {tab === "eventos" ? (
        <>
          {entryPanel}

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
              Todos {mergedEvents.length}
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
              style={inputStyle}
            />
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", position: "relative" }}>
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
            {notice && (
              <div
                role="status"
                style={{
                  position: "sticky",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: "8px 12px",
                  background: "var(--bg-panel)",
                  borderTop: "1px solid var(--border)",
                  fontSize: 12,
                  color: "var(--text)",
                  textAlign: "center",
                }}
              >
                {notice}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {entryPanel}
          {patternsPanel}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
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
};

function smallButtonStyle(): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
    fontSize: 14,
  };
}

const statChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 9px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-panel)",
  color: "var(--text-muted)",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

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
