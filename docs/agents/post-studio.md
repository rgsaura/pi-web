# Post Studio (social drafts)

The Post Studio is where a social post gets curated end to end before it
reaches Rodrigo: media with provenance, real Instagram music, a full-post
vision validation, and a decision receipt for OpenPost. Read this before
touching `components/PostStudioView.tsx`, `app/api/post-studio/**`,
`lib/post-studio*.ts`.

## Store and actions

- One directory per post under `~/.local/state/exohuman/post-studio/<post>/`:
  `studio.json` (authored definition: media with provenance, presets, caption,
  the EXO `plan`), `state.json` (working selection, music pick, per-slide
  review), `validation.json` (selectionHash-scoped vision report) and the
  `decision.json` receipt that the OpenPost dispatcher reads.
- `lib/post-studio-shared.ts` is the pure engine: every POST action funnels
  through `applyStudioAction` (typed `PostStudioAction`), so the route stays a
  thin validated shell. `lib/post-studio.ts` owns disk IO, a per-post write
  lock (`serializeByKey`), and asset serving (`resolvePostStudioAsset`: only
  filenames the definition owns — no traversal, no directory reads).
- `decide` is gated twice: `studioCoherence` (no rejected media, dates inside
  the plan window, publishable music, review complete) AND a fresh passing
  `validationCovers` check — any selection edit stales the report (selection
  hash) and re-locking is refused until the vision pass reruns.

## Real Instagram music (never generated)

- `lib/post-studio-ig-music.ts` bridges to the instagrapi session on CT126
  (`exo-services-ts`, the `instagram-self-data` skill route). The python
  script travels as a heredoc on stdin: `python - <base64 argv>` — the dash
  is what makes the base64 land in `sys.argv[1]` instead of being read as a
  script path.
- Search (`cl.search_music`) is read-only; previews stream from IG's signed
  CDN `progressive_download_url` (m4a bytes). The direct `audio/<id>` REST
  endpoint 404s, so a preview resolves by re-searching the query and matching
  the audio_id.
- Adding a track (`POST /api/post-studio/music`) downloads the preview into
  the post's `music/` dir (playback never depends on expiring CDN URLs) and
  the `audioId` rides the decision receipt for OpenPost/Postiz. Generated
  reference loops are display-only: `publishableMusic` refuses them.

## Vision validation (the gate behind decide)

- `lib/post-studio-vision.ts`: one bounded multimodal pass over the CURRENT
  selection — photos downscaled with sharp, video frames extracted with
  ffmpeg on CT126 over ssh stdin (best-effort; a video that cannot be
  inspected is reported honestly as `unclear`), one call through the
  LiteLLM gateway (candidate models tried in order; the report records which
  one judged).
- Verdicts per slide: `fit` / `unclear` / `off`. Any `off` blocks `decide`.
  Provenance warnings (capture date outside the plan window) ride along as
  visible, non-blocking issues.
- The curation loop this drives: validate → read what the slides ACTUALLY
  show → drop/fix the off ones → revalidate. The La Herradura post caught a
  "despedida" video that was really an office presentation and a Semana
  Santa procession this way (enc-ebe31041).

## QA visual harness

`qa-enc-ebe31041/` holds the capture + gateway-analysis scripts used for the
visual pass (playwright with `pi-theme` in localStorage, analysis via
litellm with the undici ProxyAgent on 127.0.0.1:1056 — plain `fetch` from a
CLI script cannot reach the gateway without it). Emoji tofu in those
captures is a headless-Chromium font artifact, not an app bug.
