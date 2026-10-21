import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const {
  POST_ID_RE,
  applyStudioAction,
  buildDecision,
  initialStateFor,
  parseStudioDefinition,
  parseStudioState,
  parseStudioValidation,
  postStudioMediaSrc,
  postStudioIgPreviewSrc,
  reviewSummary,
  selectionHashFor,
  studioCoherence,
  takenAtInPlan,
  validationCovers,
} = await jiti.import("./post-studio-shared.ts");
const {
  getPostStudio,
  getValidation,
  listPostStudios,
  mutatePostStudio,
  resolvePostStudioAsset,
  writeValidation,
} = await jiti.import("./post-studio.ts");

/** Minimal-but-complete definition exercising every branch of the engine. */
function definitionFixture() {
  return {
    id: "fixture-post",
    title: "Fixture",
    subtitle: "sub",
    account: "@fixture",
    status: "pre",
    maxSlides: 4,
    plan: {
      summary: "Finde de prueba en la costa",
      location: "Cabo de Peñas",
      dateStart: "2026-10-09",
      dateEnd: "2026-10-14",
      people: ["Rodrigo", "Celia"],
    },
    music: [
      { id: "a", letter: "A", label: "Rumba", style: "s", bpm: "104", why: "w", file: "a.wav", generated: true },
      { id: "b", letter: "B", label: "Indie", style: "s", bpm: "96", why: "w", file: "b.wav" },
    ],
    presets: [
      { id: "p1", letter: "A", name: "Uno", desc: "d", slides: ["m1", "m2"] },
      { id: "p2", letter: "B", name: "Dos", desc: "d", slides: ["m3"] },
    ],
    media: [
      { id: "m1", file: "20261009-162813_celia_1.jpg", kind: "photo", caption: "uno", star: true, date: "2026-10-09", time: "16:28", sender: "celia" },
      { id: "m2", file: "20261011-123358_stefano_2.jpg", kind: "photo", caption: "dos", date: "2026-10-11", time: "12:33", sender: "stefano" },
      { id: "m3", file: "20261013-094857_rgsaura_3.jpg", kind: "photo", caption: "tres", date: "2026-10-13", time: "09:48", sender: "rgsaura" },
      { id: "m4", file: "20261020-101010_amigo_4.jpg", kind: "photo", caption: "fuera", date: "2026-10-20", time: "10:10", sender: "amigo" },
      { id: "v1", file: "20261014-102159_sergio_5.mp4", kind: "video", caption: "clip", date: "2026-10-14", time: "10:21", sender: "sergio" },
    ],
    videos: ["v1"],
    reel: { duration: "30s", storyboard: [{ t: "0–1s", shot: "hook" }], defaultVideo: "v1" },
    caption: "caption",
    hashtags: "#h",
    checklist: ["uno"],
  };
}

const IG_TRACK = {
  audioId: "1945868442655220",
  audioClusterId: "1332923161830574",
  title: "Verano",
  artist: "Leo Middea",
  durationMs: 187069,
};

/** A state that passes every decide gate except validation (server-side). */
function readyState(def) {
  let state = initialStateFor(def);
  state = applyStudioAction(def, state, { action: "choose-ig-track", track: IG_TRACK, query: "verano" }).state;
  for (const id of [...state.selection]) {
    state = applyStudioAction(def, state, { action: "review-media", id, status: "ok" }).state;
  }
  return state;
}

test("parseStudioDefinition accepts a complete studio (with plan) and rejects junk", () => {
  const def = parseStudioDefinition(definitionFixture());
  assert.ok(def);
  assert.equal(def.media.length, 5);
  assert.equal(def.music.length, 2);
  assert.equal(def.reel.defaultVideo, "v1");
  assert.equal(def.plan?.location, "Cabo de Peñas");
  assert.deepEqual(def.window, { start: "2026-10-09", end: "2026-10-14" }); // derived from plan
  assert.deepEqual(def.people, ["Rodrigo", "Celia"]);
  assert.equal(parseStudioDefinition(null), null);
  assert.equal(parseStudioDefinition("x"), null);
  assert.equal(parseStudioDefinition({ ...definitionFixture(), id: "BAD ID" }), null);
  assert.equal(parseStudioDefinition({ ...definitionFixture(), media: [] }), null);
  // a broken plan falls back to plan-less (window undefined), not to junk
  const noPlan = parseStudioDefinition({ ...definitionFixture(), plan: { summary: 5 } });
  assert.ok(noPlan);
  assert.equal(noPlan.plan, undefined);
  assert.equal(noPlan.window, undefined);
});

test("initialStateFor seeds the first preset, carousel, no music yet", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  assert.deepEqual(state.selection, ["m1", "m2"]);
  assert.equal(state.presetId, "p1");
  assert.equal(state.format, "carousel");
  assert.equal(state.musicId, null);
  assert.equal(state.musicTrack, null);
  assert.equal(state.decidedAt, null);
});

test("parseStudioState keeps known ids, heals broken files and restores musicTrack", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = parseStudioState(
    {
      revision: 3, presetId: null, selection: ["m2", "ghost", "v1"], musicId: "b", format: "reel", reelVideoId: "v1",
      musicTrack: { track: IG_TRACK, query: "verano", pickedAt: "2026-10-20T10:00:00Z" },
      review: { m2: { status: "ok" }, ghost: { status: "ok" } },
    },
    def,
  );
  assert.deepEqual(state.selection, ["m2", "v1"]);
  assert.equal(state.musicId, "b");
  assert.equal(state.musicTrack?.track.audioId, IG_TRACK.audioId);
  assert.deepEqual(state.review, { m2: { status: "ok" } });
  // corrupt musicTrack is dropped, not fatal
  const healed = parseStudioState({ selection: ["m1"], musicTrack: { track: { audioId: "xyz" } } }, def);
  assert.equal(healed.musicTrack, null);
  assert.deepEqual(parseStudioState({ selection: [] }, def).selection, ["m1", "m2"]);
  assert.deepEqual(parseStudioState("junk", def).selection, ["m1", "m2"]);
});

test("toggle-media blocks out-of-window additions and reports why", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def); // m1 m2
  const out = applyStudioAction(def, state, { action: "toggle-media", id: "m4" }); // 2026-10-20
  assert.equal(out.ok, false);
  assert.equal(out.error, "MEDIA_OUT_OF_WINDOW");
  assert.ok(out.issues?.[0].includes("2026-10-20"));
  // in-window video still adds fine
  const okAdd = applyStudioAction(def, state, { action: "toggle-media", id: "v1" });
  assert.equal(okAdd.ok, true);
});

test("choose-ig-track validates the track and can be cleared with null", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  const out = applyStudioAction(def, state, { action: "choose-ig-track", track: IG_TRACK, query: "verano" });
  assert.equal(out.ok, true);
  assert.equal(out.state.musicTrack?.track.title, "Verano");
  assert.equal(out.state.musicTrack?.query, "verano");
  assert.equal(out.state.musicId, null); // IG track replaces local picks
  assert.equal(applyStudioAction(def, state, { action: "choose-ig-track", track: { ...IG_TRACK, audioId: "abc" } }).error, "BAD_TRACK");
  assert.equal(applyStudioAction(def, state, { action: "choose-ig-track", track: { ...IG_TRACK, durationMs: -1 } }).error, "BAD_TRACK");
  const cleared = applyStudioAction(def, out.state, { action: "choose-ig-track", track: null });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.state.musicTrack, null);
});

test("review-media drives the review summary decide depends on", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def); // m1 m2
  assert.equal(reviewSummary(state).pending, 2);
  state = applyStudioAction(def, state, { action: "review-media", id: "m1", status: "ok" }).state;
  state = applyStudioAction(def, state, { action: "review-media", id: "m2", status: "flagged", note: "borrosa" }).state;
  assert.equal(reviewSummary(state).ok, 1);
  assert.equal(reviewSummary(state).flagged, 1);
  assert.equal(reviewSummary(state).complete, false);
  state = applyStudioAction(def, state, { action: "review-media", id: "m2", status: "pending" }).state; // unset
  assert.equal(reviewSummary(state).pending, 1);
  assert.equal(applyStudioAction(def, state, { action: "review-media", id: "m2", status: "weird" }).error, "BAD_REVIEW_STATUS");
  assert.equal(applyStudioAction(def, state, { action: "review-media", id: "ghost", status: "ok" }).error, "MEDIA_NOT_FOUND");
});

test("decide gates: generated music never publishes; review must be complete", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def);

  // generated loop → MUSIC_IG_REQUIRED (never AI/reference music)
  state = applyStudioAction(def, state, { action: "choose-music", musicId: "a" }).state;
  let out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.error, "COHERENCE_FAILED");
  assert.ok(out.issues?.includes("MUSIC_IG_REQUIRED"));
  assert.ok(out.issues?.some((i) => i.startsWith("REVIEW_PENDING:")));

  // real IG track fixes music, review still pending
  state = applyStudioAction(def, state, { action: "choose-ig-track", track: IG_TRACK, query: "verano" }).state;
  out = applyStudioAction(def, state, { action: "decide" });
  assert.ok(!out.issues?.includes("MUSIC_IG_REQUIRED"));
  assert.ok(out.issues?.some((i) => i.startsWith("REVIEW_PENDING:")));

  // complete the review → pure engine decides
  state = readyState(def);
  out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.ok, true);
  assert.ok(out.state.decidedAt);
  assert.equal(out.decision.music.source, "instagram");
  assert.equal(out.decision.music.audioId, IG_TRACK.audioId);
  assert.equal(out.decision.music.audioClusterId, IG_TRACK.audioClusterId);
  assert.match(out.decision.music.note, /audio_id real/);
  assert.deepEqual(out.decision.slides.map((s) => s.id), ["m1", "m2"]);
  assert.ok(out.decision.slides[0].date); // provenance rides to the receipt
  assert.equal(out.decision.vision, null); // pure decide carries no validation (server adds it)

  // locked until reopen
  assert.equal(applyStudioAction(def, out.state, { action: "toggle-media", id: "m3" }).error, "STUDIO_LOCKED");
  const reopened = applyStudioAction(def, out.state, { action: "reopen" });
  assert.equal(reopened.state.decidedAt, null);
});

test("decide as reel still requires a video; non-generated local music passes the music gate", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = applyStudioAction(def, initialStateFor(def), { action: "choose-format", format: "reel" }).state;
  state = applyStudioAction(def, state, { action: "choose-reel-video", videoId: null }).state;
  state = applyStudioAction(def, state, { action: "choose-music", musicId: "b" }).state; // local, not generated
  state = readyStateLike(state, def);
  let out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.error, "COHERENCE_FAILED");
  assert.ok(out.issues?.includes("REEL_VIDEO_REQUIRED"));
  state = applyStudioAction(def, state, { action: "choose-reel-video", videoId: "v1" }).state;
  out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.ok, true);
  assert.equal(out.decision.format, "reel");
  assert.equal(out.decision.reel.videoId, "v1");
  assert.equal(out.decision.music.source, "local");
  assert.equal(out.decision.music.id, "b");
});

function readyStateLike(state, def) {
  let s = state;
  for (const id of [...s.selection]) {
    s = applyStudioAction(def, s, { action: "review-media", id, status: "ok" }).state;
  }
  return s;
}

test("selectionHashFor is stable, order-sensitive and feeds validationCovers", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  const h1 = selectionHashFor(state);
  assert.equal(selectionHashFor({ ...state }), h1);
  assert.match(h1, /^[0-9a-f]{8}$/);
  const reordered = { ...state, selection: [...state.selection].reverse() };
  assert.notEqual(selectionHashFor(reordered), h1);

  const okValidation = {
    status: "ok",
    at: "2026-10-20T12:00:00Z",
    model: "zai-glm-flash",
    selectionHash: h1,
    items: state.selection.map((id) => ({ id, verdict: "fit", desc: "ok", issues: [] })),
    issues: [],
  };
  assert.equal(validationCovers(null, state).reason, "MISSING");
  assert.equal(validationCovers({ ...okValidation, selectionHash: "00000000" }, state).reason, "STALE");
  assert.equal(
    validationCovers({ ...okValidation, items: okValidation.items.slice(0, 1) }, state).reason,
    "OFF_SLIDE",
  );
  assert.equal(
    validationCovers({ ...okValidation, items: okValidation.items.map((it) => ({ ...it, verdict: "off" })) }, state).reason,
    "ISSUES",
  );
  const covers = validationCovers(okValidation, state);
  assert.equal(covers.ok, true);
  // an "issues" status with only unclear slides still blocks (status gate)
  assert.equal(
    validationCovers({ ...okValidation, status: "issues" }, state).reason,
    "ISSUES",
  );
  // selection edit stales the report
  const edited = { ...state, selection: ["m1"] };
  assert.equal(validationCovers(okValidation, edited).reason, "STALE");
});

test("takenAtInPlan judges dates against the plan window", () => {
  const def = parseStudioDefinition(definitionFixture());
  const m4 = def.media.find((m) => m.id === "m4");
  const m1 = def.media.find((m) => m.id === "m1");
  assert.equal(takenAtInPlan(m1, def.plan), true);
  assert.equal(takenAtInPlan(m4, def.plan), false);
  assert.equal(takenAtInPlan({ ...m4, date: undefined }, def.plan), null);
  assert.equal(takenAtInPlan(m4, undefined), null);
});

test("parseStudioValidation keeps sane reports and rejects junk", () => {
  const good = parseStudioValidation({
    status: "ok", at: "x", model: "m", selectionHash: "abcd1234",
    items: [{ id: "m1", verdict: "fit", desc: "d", issues: ["i"] }], issues: [], notes: "n",
  });
  assert.ok(good);
  assert.equal(good.items[0].issues.length, 1);
  assert.equal(parseStudioValidation(null), null);
  assert.equal(parseStudioValidation({ status: "weird" }), null);
});

test("studioCoherence lists every blocking rule", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  const issues = studioCoherence(def, state);
  assert.ok(issues.includes("MUSIC_IG_REQUIRED"));
  assert.ok(issues.some((i) => i.startsWith("REVIEW_PENDING:")));
  const ready = readyState(def);
  assert.deepEqual(studioCoherence(def, ready), []);
});

test("buildDecision maps ids to files, drops unknowns and records vision", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = { ...initialStateFor(def), selection: ["m2", "ghost"] };
  const decision = buildDecision(def, state, "2026-10-19T00:00:00.000Z");
  assert.deepEqual(decision.slides.map((s) => s.id), ["m2"]);
  assert.equal(decision.music, null); // nothing publishable picked
  const withVision = buildDecision(def, state, "2026-10-19T00:00:00.000Z", {
    at: "2026-10-19T23:00:00.000Z", model: "zai-glm-flash", status: "ok", selectionHash: "abcd1234",
  });
  assert.equal(withVision.vision.model, "zai-glm-flash");
});

test("postStudioMediaSrc / postStudioIgPreviewSrc encode their parts", () => {
  assert.equal(postStudioMediaSrc("a b", "c d.mp3"), "/api/post-studio/media/a%20b/c%20d.mp3");
  assert.equal(postStudioIgPreviewSrc("rumba", "123"), "/api/post-studio/music?q=rumba&id=123");
});

test("POST_ID_RE accepts slug ids and rejects the rest", () => {
  assert.ok(POST_ID_RE.test("herradura-2026"));
  assert.ok(!POST_ID_RE.test(""));
  assert.ok(!POST_ID_RE.test("-x"));
  assert.ok(!POST_ID_RE.test("a".repeat(50)));
  assert.ok(!POST_ID_RE.test("a/b"));
});

test("server store: get, mutate, validation-gated decide and assets on a scratch root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "post-studio-test-"));
  const dir = join(root, "fixture-post");
  t.after(() => rm(root, { recursive: true, force: true }));
  const { mkdirSync, writeFileSync, readFileSync, existsSync } = await import("node:fs");
  mkdirSync(join(dir, "media"), { recursive: true });
  mkdirSync(join(dir, "music"), { recursive: true });
  writeFileSync(join(dir, "studio.json"), JSON.stringify(definitionFixture()));
  writeFileSync(join(dir, "media", "20261009-162813_celia_1.jpg"), "jpg-bytes");
  writeFileSync(join(dir, "music", "a.wav"), "wav-bytes");

  const previousRoot = process.env.POST_STUDIO_ROOT;
  process.env.POST_STUDIO_ROOT = root;
  t.after(() => {
    if (previousRoot === undefined) delete process.env.POST_STUDIO_ROOT;
    else process.env.POST_STUDIO_ROOT = previousRoot;
  });

  assert.equal(getPostStudio("no-existe"), null);
  const snapshot = getPostStudio("fixture-post");
  assert.ok(snapshot);
  assert.deepEqual(snapshot.state.selection, ["m1", "m2"]);

  // list: one row, plan-derived location, no real music yet
  const list = listPostStudios();
  assert.equal(list.length, 1);
  assert.equal(list[0].location, "Cabo de Peñas");
  assert.equal(list[0].realMusicCount, 0);

  assert.equal((await mutatePostStudio("BAD ID", { action: "decide" })).error, "BAD_POST_ID");

  // walk the state to ready-by-engine, then hit the validation gate
  let mutate = await mutatePostStudio("fixture-post", { action: "choose-ig-track", track: IG_TRACK, query: "verano" });
  assert.equal(mutate.ok, true);
  mutate = await mutatePostStudio("fixture-post", { action: "review-media", id: "m1", status: "ok" });
  mutate = await mutatePostStudio("fixture-post", { action: "review-media", id: "m2", status: "ok" });
  assert.equal(mutate.ok, true);
  const blocked = await mutatePostStudio("fixture-post", { action: "decide" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "VALIDATION_MISSING");

  // a stale validation does not gate; a fresh passing one does
  writeValidation("fixture-post", {
    status: "ok", at: "2026-10-20T00:00:00Z", model: "zai-glm-flash",
    selectionHash: "00000000", // stale
    items: [], issues: [],
  });
  assert.equal((await mutatePostStudio("fixture-post", { action: "decide" })).error, "VALIDATION_STALE");
  const fresh = getPostStudio("fixture-post");
  writeValidation("fixture-post", {
    status: "ok", at: "2026-10-20T12:00:00Z", model: "zai-glm-flash",
    selectionHash: selectionHashFor(fresh.state),
    items: fresh.state.selection.map((id) => ({ id, verdict: "fit", desc: "encaja", issues: [] })),
    issues: [],
  });
  assert.ok(getValidation("fixture-post"));
  const decided = await mutatePostStudio("fixture-post", { action: "decide" });
  assert.equal(decided.ok, true);
  const receipt = JSON.parse(readFileSync(join(dir, "decision.json"), "utf8"));
  assert.equal(receipt.music.source, "instagram");
  assert.equal(receipt.music.audioId, IG_TRACK.audioId);
  assert.equal(receipt.vision.model, "zai-glm-flash");
  assert.ok(existsSync(join(dir, "state.json")));

  // decided → locked; reopen works
  const locked = await mutatePostStudio("fixture-post", { action: "toggle-media", id: "m3" });
  assert.equal(locked.error, "STUDIO_LOCKED");
  const reopened = await mutatePostStudio("fixture-post", { action: "reopen" });
  assert.equal(reopened.ok, true);

  // assets: only definition-owned files resolve
  assert.equal(resolvePostStudioAsset("fixture-post", "20261009-162813_celia_1.jpg").kind, "photo");
  assert.equal(resolvePostStudioAsset("fixture-post", "a.wav").kind, "music");
  assert.equal(resolvePostStudioAsset("fixture-post", "no-file.jpg"), null);
  assert.equal(resolvePostStudioAsset("fixture-post", "../studio.json"), null);
  assert.equal(resolvePostStudioAsset("fixture-post", "studio.json"), null);
});
