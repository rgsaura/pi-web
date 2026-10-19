# Paneles (deliverables) and their session trace

The paneles module lists, serves and traces Rodrigo's visible deliverables
(`~/.local/share/exohuman/paneles`, created by `rg-panel`). Read this before
touching `app/api/paneles/**`, `lib/paneles*.ts`, `hooks/usePaneles.ts`,
`hooks/usePanelSessions.ts` or `components/PanelesView.tsx`.

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

Creating and archiving panels stays `rg-panel`'s job; the routes never write
to the root.
