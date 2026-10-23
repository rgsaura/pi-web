# Exo panel — Decisiones (ExoProposalsView), encargos y rutas /api/exo

The Exo panel is this fork's integration with EXOHUMAN's local state. It is
read-mostly: the one write is Rodrigo's explicit choice on a decision.

## Data flow

- `lib/exo-data.ts` reads `~/.local/state/proposals/ledger.json` (written by the
  `rg-proposal` CLI) through `loadLocalActiveProposals()`; if that ledger has no
  proposals it falls back to the DSH private snapshot routes on loopback
  (`readPrivate`, header-identical to a local browser session).
  `RG_PROPOSALS_LEDGER`/`RG_ENCARGOS_LEDGER` override both ledger paths (the
  CLI honors the same variables; `lib/exo-data.test.mjs` uses them).
- **Live cache**: `getExoData` serves its 30 s cache only while both ledger
  files' `mtimeMs:size` stamps are unchanged — any external write (the CLIs,
  another agent session) is re-read at once, not when the TTL lapses; the TTL
  only bounds the upstream snapshot path (no local proposals). Every mutation
  through our routes also calls `invalidateExoData()`.
- `app/api/exo/data/route.ts` exposes the merged snapshot; `app/api/exo/resolve`
  records choices/discard/undo (local ledger first, EXO private route second).
- **One shared live store** (`hooks/use-live-store.ts`) backs every number:
  `useExoData` (15 s poll) and `useWorkspaces` (45 s) subscribe to a single
  store per endpoint, so the sidebar badges and the views can never disagree —
  one reader's `refresh()` (after a resolve/discard/undo) updates every badge
  at once. The store polls while any reader is mounted and the tab is visible,
  pauses when hidden, and refetches on foreground. Views no longer keep their
  own intervals (`ExoProposalsView` only forces one read on mount).
- **Pending-first counters**: a badge shows the number that needs action, the
  historical total is secondary. Sidebar strip: Decisiones =
  `relevantProposals(...)` length (activas pendientes; tooltip adds «N en
  historial»), Encargos = `pendingCount` (tooltip «N registrados»), Workspaces =
  active workspaces (tooltip «N registrados»). In `ExoProposalsView` the
  «Todas» category pill counts the active filter's base (pending when Pendientes
  is on), never the historical total; the header switch keeps «🎯 Pendientes»
  first with «📋 Todas» secondary. `EncargosView` shows «N activos» then
  «M total».
- The old `ExoPanel` dialog («Centro de Control») and `DashboardView` were
  unreachable leftovers (AppShell never rendered them) with total-based
  Decisiones counters; both were removed with their dead wiring
  (`exoPanelOpen`, `onOpenExoProposal`).

## Visual decisions (option images)

Decisions can show an image per option — mockups, screenshots, diagrams — so a
choice between interface styles is made by looking, not reading labels.

- **CLI**: `rg-proposal add --option-images "a.png,https://x/b.png"` aligns
  entries by position with `--options`; local files are copied into
  `~/.local/state/proposals/media/` and stored as `media/<name>` entries, http(s)
  URLs pass through. `rg-proposal images <id> --set|--add` retro-fits an existing
  proposal. `RG_PROPOSALS_LEDGER`/`RG_PROPOSALS_MEDIA` isolate tests.
- **Resolver**: `lib/exo-media.ts` (`resolveOptionImageSrc`,
  `optionImagesFor`) maps ledger entries to renderable srcs — `/api/exo/media/<name>`
  for `media/` entries, https/data-URIs as-is; anything else (traversal, svg,
  plain http, junk) becomes null. `lib/exo-data.ts` zips the resolved images
  onto `ExoProposalOption.image` (`lib/exo-types.ts`).
- **Route**: `app/api/exo/media/[...path]/route.ts` serves one media file: single
  raster filename only (extension allowlist shared with the resolver via
  `OPTION_IMAGE_EXTENSIONS`, no SVG, no dotfiles, no subpaths), 15 MB cap,
  `inline` + `nosniff` + private cache.
- **UI**: an option with an image renders as a visual card (image banner with
  16:9 crop, letter badge, label) — `role="button"` with Enter/Space to choose —
  and tapping the image or its 🔍 button opens a full-screen lightbox (Esc/backdrop
  closes; the view-level Esc handler yields to it). Text-only options keep the
  classic `<button>` card. `e2e/proposals-check.mjs` accepts both selectors.

Files: `lib/exo-media.ts`(+test), `lib/exo-data.ts`, `lib/exo-types.ts`,
`app/api/exo/media/**`, `components/ExoProposalsView.tsx`, `~/.local/bin/rg-proposal`
(backup `rg-proposal.bak-YYYYMMDD` alongside).

## Live counters QA

`e2e/counters-check.mjs` (Playwright, against the dev server) verifies the
whole chain with the real ledgers: badges match the ledger's real pending
counts, an externally injected proposal reaches the badge within the poll
window without any reload, resolving it from the view drops the badge at once
(the shared store), and restoring the ledger returns it to the original
number. It backs up and restores the ledger byte-for-byte around the run, and
recomputes every expected value on each poll (the system is live: other
agents write the ledgers mid-run).

Run it from a worktree against the dev server:

```bash
# Start the dev server on the encargo's registered port with a CLEAN env —
# this harness's sessions can inherit the production runner's
# NEXT_DEPLOYMENT_ID=""/PI_WEB_ROLE, and that empty deployment id makes
# Turbopack panic at boot ("Invalid distDirRoot … should not navigate out of
# the projectPath"):
env -i HOME=$HOME PATH=$PATH node_modules/.bin/next dev -H 127.0.0.1 -p <port>
# Playwright's chromium needs the extracted system libs on this host:
LD_LIBRARY_PATH=/tmp/chromium-libs/root/usr/lib/x86_64-linux-gnu:\
/tmp/chromium-libs/root/usr/lib/x86_64-linux-gnu/nss:\
/tmp/chromium-libs/root/lib/x86_64-linux-gnu \
COUNTERS_CHECK_BASE=http://127.0.0.1:<port> node e2e/counters-check.mjs
```

## Embedded comparative previews (option panels)

An F1 proposal can carry a **live comparative preview embedded in the
Decisiones view itself**: options A/B/C switchable in-situ, same-origin,
without leaving the panel (the method prop-d35754a4/prop-1cbfac6a lacked:
staging panels nobody served, links to dev ports, manual promotion).

- **Ledger field**: `option_panels`, aligned with `options` by position
  (same rule as `option_images`). Entries are `paneles/<slug>[/file]`
  (`paneles/<slug>` = the panel's index; `paneles/<slug>/<file>` = one page
  of a multi-variant panel). `rg-proposal` does not know the field yet: the
  F1 encargo writes it directly into
  `~/.local/state/proposals/ledger.json` alongside `options`.
- **Panel assets**: created in the staging root
  (`PANELES_ROOT=$HOME/.local/state/exohuman/paneles rg-panel new …`),
  served by the canonical `/api/paneles/<slug>/` route (both roots — see
  `docs/agents/paneles.md`). Never dev-port URLs, never external origins.
- **Resolver**: `lib/exo-panels.ts` (`resolveOptionPanelSrc`,
  `optionPanelsFor`) maps entries to same-origin `/api/paneles/…` srcs only —
  http(s), traversal, non-dated or malformed slugs become null, so a bad
  ledger entry can never point the iframe outside the app. `lib/exo-data.ts`
  zips the resolved src onto `ExoProposalOption.previewUrl`
  (`lib/exo-types.ts`).
- **UI**: when a proposal has options with `previewUrl`, `ExoProposalsView`
  renders a "Comparativa en vivo" block above the option cards: an A/B/C
  switcher (letters match the cards), the panel in an iframe with the same
  sandbox the Paneles view uses, plus reload / fullscreen (Esc closes it
  before the view's own Esc) / new-tab. Switching only looks; the option
  cards below remain the act of choosing (keyboard A–E included).

Files: `lib/exo-panels.ts`(+test), `lib/exo-data.ts`, `lib/exo-types.ts`,
`components/ExoProposalsView.tsx`, the staging roots in `lib/paneles.ts` and
`app/api/paneles/**`.
