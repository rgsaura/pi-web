# Paneles (deliverables) and their session trace

The paneles module lists, serves, traces and manages the visibility of
Rodrigo's visible deliverables (`~/.local/share/exohuman/paneles`, created
by `rg-panel`). Read this before touching `app/api/paneles/**`,
`lib/paneles*.ts`, `lib/panel-*.ts`, `hooks/usePaneles.ts`,
`hooks/usePanelSessions.ts`, `hooks/useNativePanelStates.ts`,
`components/PanelesView.tsx` or `components/PanelPins.tsx`.

## The panel manager (catalog + pinned strip)

Three visibility states, in each panel.json's `estado` (`lib/panel-catalog.ts`):

- `fijado` — access in the sidebar's pinned strip (`components/PanelPins.tsx`),
  optionally temporal: `expira` (YYYY-MM-DD) makes it fall back to bajo
  demanda once the date passes (the sidebar never shows an expired pin).
- `demanda` (default) — only from the catalog view (`?view=paneles`) and its
  search. The legacy `activo` (everything pre-2026-10-21, and what
  `rg-panel new` still writes) reads as demanda: nobody occupies the sidebar
  unless Rodrigo pins the panel himself.
- `archivado` — out of the active catalog; its URL keeps working.

`POST /api/paneles` (`{ slug, visibilidad, expira? }`) is the one write: it
updates `estado`/`expira` in the panel's own panel.json (locked per slug,
atomic, every other field preserved — `lib/panel-state.ts`) and keeps the
expiry watcher's registry in step (`lib/panel-expiry.ts`: the existing
rg-archive-expiry then proposes archiving a temporal pin when its date
nears; `EXO_EXPIRY_REGISTRY` overrides the registry path, which is how the
tests stay off the real one). An expiry on a non-pinned panel is refused.

Native views (no panel.json: their state is per browser in sidebar prefs)
are registered in `NATIVE_PANELS` — Post Studio, bajo demanda by default
("visible sólo cuando se usa": pin it while a social plan is active, with an
expiry if you want). `mergeCatalogPanels()` is the one merge both the catalog
view and the pinned strip read; `orderPinnedPanels()` applies the dragged
order (pointer-based reorder in PanelPins; `moveKey()` is the pure move).
`usePaneles` shares one module cache and one listener set, so a visibility
change from the catalog reaches the pinned strip at once.

## The generation flow (documented in the catalog itself)

Any session can create a reusable panel; the catalog view carries the doc
("Cómo crear un panel reutilizable", always one tap away):

1. `rg-panel new <slug> --tipo informe|galeria|comparativa|base --titulo "…" --resumen "…"`
2. write the deliverable into its `index.html` (templates in `_plantillas/`);
3. `rg-panel link <slug>` registers the creating session (PI_SESSION_ID);
4. visibility from the catalog: 📌 Fijar (with optional 1/7/30-day or custom
   expiry), 🔍 Demanda, 🗄️ Archivar;
5. share `/?view=paneles&panel=<slug>` (the viewer's «Copiar enlace»).

## Serving and listing

- `lib/paneles.ts` is the only reader of the root: dated directories
  (`isPanelDirName`) with an `index.html` list; `_plantillas` and dotfiles are
  internal. `PANELES_ROOT` overrides the root (production sets it in the
  systemd drop-in).
- `app/api/paneles/[...path]/route.ts` serves one panel's bytes with a
  `<base href>` injected into HTML (relative assets survive Next's
  slashless-directory normalization). No traversal, no symlink escapes,
  `no-store` for HTML/JSON.
- `app/api/paneles/route.ts` lists metadata (10 s cache). PanelMeta carries
  the `sessions` registered in `panel.json`.

## The bidirectional session trace

A panel's related Pi sessions come from two directions, merged by
`mergePanelSessions` (`lib/paneles-sessions.ts`):

1. **Registered** — `rg-panel new|link` writes `PI_SESSION_ID` into
   `panel.json`'s `sessions` array (capped at 20). Source `panel.json`.
2. **Mentions** — `GET /api/paneles/sessions?slug=<dir>` scans transcripts
   with `searchSessionContents` and the needle `panelSessionNeedle(slug)`: the
   slug without its date prefix (so both the dated URL and the bare slug an
   agent typed match). Source `mencion`, carrying the snippet and `entryId`
   that prove the link.

Registered sessions come first in `panel.json` order; a session found by both
keeps `panel.json` as its source and gains the snippet; registered ids with
neither catalog row nor mention land in `missing`.

**Trap**: the route parses the *whole* `panel.json` value — extract the ids
with `registeredSessionIds(raw)`, never `parsePanelSessionIds(raw)` (the whole
object is not an array and parses to nothing; that bug shipped the feature
with an empty registered direction until a fixture probe caught it).

UI: `PanelesView` renders a touch-scrollable chip strip under the viewer
header (`PanelSessionsStrip`) and an on-demand card expansion in the dashboard
(`PanelCard` → `SessionRow`s with snippets). Rows/chips link to
`/?session=<id>`; when `AppShell` passes `onOpenSession` they navigate
in-app (catalog hit → `handleSelectSession`, miss → URL restore), and stay
plain `<a>` without it so middle-click/new-tab always work.

## Budgets and caches

The mention scan reuses the search machinery as-is: newest-first candidates,
500 files / 30 results / 3 s budget, literal needle — `truncated: true` means
the strip may be incomplete, which the UI says ("+ más…"). The route caches
each slug's response 20 s; `hooks/usePanelSessions.ts` adds a 30 s module
cache shared by the strip and the cards (cards only fetch once expanded).

Creating panels stays `rg-panel`'s job; the routes' one write is the
catalog's visibility change above, and it only ever touches panel.json of an
existing panel directory.
