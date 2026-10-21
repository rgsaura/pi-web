# Timeline — merged view and the retroactive (hour-pattern) ledger

The Timeline view aggregates every EXOHUMAN source into past/today/future
day groups. On top of it sits the retroactive ledger: manually logged past
events at hour precision, which feed hour-band aggregation and learned
suggestions.

## Data flow

- `GET /api/timeline` (`app/api/timeline/route.ts`) merges encargos,
  propuestas, failure-ledger, routine reports/recibos, recent Pi sessions,
  systemd timers, `exo-control read personal.calendar` and the retro ledger
  (mapped to `kind: "manual"` by `toTimelineEvent`). 15 s in-memory cache,
  every source best-effort.
- `GET /api/timeline/events` returns the raw retro ledger (newest first,
  no cache — mutations reflect instantly); `POST` appends one event, taking
  either the form's authoritative `{ title, ts, endTs?, category? }` or a
  free `{ text }` quick entry parsed server-side with `quickEntryTs`
  (Europe/Madrid — the host runs UTC, Rodrigo's hours are Madrid's);
  `DELETE ?id=` removes one row.
- `lib/timeline-retro.ts` (pure, client+server) holds the model:
  `parseQuickEntry` ("ayer 18h cine con Agus", "lunes 9h gym", "20/10
  19:30 cena", bare explicit times fall back to today-or-yesterday),
  `hourBand`/`HOUR_BANDS` (madrugada 0–5, mañana 6–11, mediodía 12–15,
  tarde 16–19, noche 20–23), `guessCategory` (keyword seed categories),
  `computePatterns` (24-slot histogram, band stats, human phrases with a
  minimum support of 2–3), `suggestForHour` (categories weighted 3/1 for
  exact/adjacent hours + repeat titles) and the JSONL row codec.
- `lib/timeline-retro-store.ts` is the ledger IO:
  `~/.local/state/timeline/retro-events.jsonl` (`TIMELINE_RETRO_LEDGER`
  overrides for tests), append-only writes and atomic rewrites under
  `serializeByKey`; rows validated by `parseRetroLine`; past-only (≤ now
  +2 h tolerance, ≥ ~13 months back).
- `components/TimelineView.tsx` renders two tabs. Eventos: the classic
  day-grouped list plus the 🕰️ entry panel — live parse preview, native
  date/time pickers the parse drives once per matched clause, category
  chips (suggestion at that hour + learned top categories + free input
  with datalist), duration chips, repeat chips ("a esta hora sueles…"),
  and a per-row delete on manual events. Patrones: summary chips, the
  24-bar histogram (colored per band, peak hour accented), band cards
  with top categories, and the detected pattern phrases. Manual events in
  the list come from the uncached events route (the merged snapshot's own
  copy is filtered out) so add/delete is instant client-side; hour
  interpretation happens in the browser's zone (Madrid for Rodrigo).

Files: `lib/timeline-retro.ts`(+test), `lib/timeline-retro-store.ts`,
`app/api/timeline/route.ts`, `app/api/timeline/events/route.ts`,
`components/TimelineView.tsx`, `lib/timeline-data.ts` (the `manual` kind).
