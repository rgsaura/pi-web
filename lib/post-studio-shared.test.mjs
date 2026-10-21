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
  postStudioMediaSrc,
} = await jiti.import("./post-studio-shared.ts");
const {
  getPostStudio,
  mutatePostStudio,
  resolvePostStudioAsset,
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
    music: [
      { id: "a", letter: "A", label: "Rumba", style: "s", bpm: "104", why: "w", file: "a.wav", generated: true },
      { id: "b", letter: "B", label: "Indie", style: "s", bpm: "96", why: "w", file: "b.wav" },
    ],
    presets: [
      { id: "p1", letter: "A", name: "Uno", desc: "d", slides: ["m1", "m2"] },
      { id: "p2", letter: "B", name: "Dos", desc: "d", slides: ["m3"] },
    ],
    media: [
      { id: "m1", file: "one.jpg", kind: "photo", caption: "uno", star: true },
      { id: "m2", file: "two.jpg", kind: "photo", caption: "dos" },
      { id: "m3", file: "three.jpg", kind: "photo", caption: "tres" },
      { id: "m4", file: "four.jpg", kind: "photo", caption: "cuatro" },
      { id: "v1", file: "clip.mp4", kind: "video", caption: "clip" },
    ],
    videos: ["v1"],
    reel: { duration: "30s", storyboard: [{ t: "0–1s", shot: "hook" }], defaultVideo: "v1" },
    caption: "caption",
    hashtags: "#h",
    checklist: ["uno"],
  };
}

test("parseStudioDefinition accepts a complete studio and rejects junk", () => {
  const def = parseStudioDefinition(definitionFixture());
  assert.ok(def);
  assert.equal(def.media.length, 5);
  assert.equal(def.music.length, 2);
  assert.equal(def.reel.defaultVideo, "v1");
  assert.equal(parseStudioDefinition(null), null);
  assert.equal(parseStudioDefinition("x"), null);
  assert.equal(parseStudioDefinition({ ...definitionFixture(), id: "BAD ID" }), null);
  // no media / no presets / no music → unusable definition
  assert.equal(parseStudioDefinition({ ...definitionFixture(), media: [] }), null);
  assert.equal(parseStudioDefinition({ ...definitionFixture(), presets: [] }), null);
  assert.equal(parseStudioDefinition({ ...definitionFixture(), music: [] }), null);
});

test("initialStateFor seeds the first preset, carousel, no music yet", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  assert.deepEqual(state.selection, ["m1", "m2"]);
  assert.equal(state.presetId, "p1");
  assert.equal(state.format, "carousel");
  assert.equal(state.musicId, null);
  assert.equal(state.decidedAt, null);
});

test("parseStudioState keeps known ids only and heals broken files", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = parseStudioState(
    { revision: 3, presetId: null, selection: ["m2", "ghost", "v1"], musicId: "b", format: "reel", reelVideoId: "v1" },
    def,
  );
  assert.deepEqual(state.selection, ["m2", "v1"]);
  assert.equal(state.musicId, "b");
  assert.equal(state.format, "reel");
  assert.equal(state.reelVideoId, "v1");
  // empty selection heals to the preset; corrupt file heals the same way
  assert.deepEqual(parseStudioState({ selection: [] }, def).selection, ["m1", "m2"]);
  assert.deepEqual(parseStudioState("junk", def).selection, ["m1", "m2"]);
});

test("apply-preset replaces the selection and clears the custom flag", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def);
  const out = applyStudioAction(def, state, { action: "apply-preset", presetId: "p2" });
  assert.equal(out.ok, true);
  assert.deepEqual(out.state.selection, ["m3"]);
  assert.equal(out.state.presetId, "p2");
  assert.equal(applyStudioAction(def, state, { action: "apply-preset", presetId: "nope" }).error, "PRESET_NOT_FOUND");
});

test("toggle-media add/remove with maxSlides and empty guards", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def); // m1 m2
  let out = applyStudioAction(def, state, { action: "toggle-media", id: "m3" });
  assert.deepEqual(out.state.selection, ["m1", "m2", "m3"]);
  assert.equal(out.state.presetId, null); // custom now
  out = applyStudioAction(def, out.state, { action: "toggle-media", id: "v1" });
  assert.deepEqual(out.state.selection, ["m1", "m2", "m3", "v1"]); // maxSlides 4
  // adding a fifth slide is refused; removing keeps working
  assert.equal(applyStudioAction(def, out.state, { action: "toggle-media", id: "m4" }).error, "MAX_SLIDES_4");
  out = applyStudioAction(def, out.state, { action: "toggle-media", id: "m1" });
  out = applyStudioAction(def, out.state, { action: "toggle-media", id: "m2" });
  out = applyStudioAction(def, out.state, { action: "toggle-media", id: "m3" });
  assert.deepEqual(out.state.selection, ["v1"]);
  assert.equal(applyStudioAction(def, out.state, { action: "toggle-media", id: "v1" }).error, "SELECTION_EMPTY");
  assert.equal(applyStudioAction(def, out.state, { action: "toggle-media", id: "ghost" }).error, "MEDIA_NOT_FOUND");
});

test("move-media and reorder reorder without losing or duplicating ids", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = { ...initialStateFor(def), selection: ["m1", "m2", "m3"] };
  let out = applyStudioAction(def, state, { action: "move-media", id: "m3", direction: -1 });
  assert.deepEqual(out.state.selection, ["m1", "m3", "m2"]);
  out = applyStudioAction(def, out.state, { action: "move-media", id: "m1", direction: -1 });
  assert.deepEqual(out.state.selection, ["m1", "m3", "m2"]); // no-op at the edge, still ok
  out = applyStudioAction(def, state, { action: "reorder", ids: ["m3", "m1", "m2"] });
  assert.deepEqual(out.state.selection, ["m3", "m1", "m2"]);
  assert.equal(applyStudioAction(def, state, { action: "reorder", ids: ["m1", "m2"] }).error, "BAD_ORDER");
  assert.equal(applyStudioAction(def, state, { action: "reorder", ids: ["m1", "m2", "ghost"] }).error, "BAD_ORDER");
  assert.equal(applyStudioAction(def, state, { action: "move-media", id: "v1", direction: 1 }).error, "MEDIA_NOT_SELECTED");
  assert.equal(applyStudioAction(def, state, { action: "move-media", id: "m1", direction: 5 }).error, "BAD_DIRECTION");
});

test("choose-music/format/reel-video validate their ids", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = initialStateFor(def);
  assert.equal(applyStudioAction(def, state, { action: "choose-music", musicId: "b" }).state.musicId, "b");
  assert.equal(applyStudioAction(def, state, { action: "choose-music", musicId: null }).state.musicId, null);
  assert.equal(applyStudioAction(def, state, { action: "choose-music", musicId: "zz" }).error, "MUSIC_NOT_FOUND");
  assert.equal(applyStudioAction(def, state, { action: "choose-format", format: "reel" }).state.format, "reel");
  assert.equal(applyStudioAction(def, state, { action: "choose-format", format: "story" }).error, "BAD_FORMAT");
  assert.equal(applyStudioAction(def, state, { action: "choose-reel-video", videoId: "m1" }).error, "VIDEO_NOT_FOUND");
  assert.equal(applyStudioAction(def, state, { action: "choose-reel-video", videoId: "v1" }).state.reelVideoId, "v1");
});

test("decide requires music, freezes the studio and writes the OpenPost receipt", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def);
  assert.equal(applyStudioAction(def, state, { action: "decide" }).error, "MUSIC_REQUIRED");

  state = applyStudioAction(def, state, { action: "choose-music", musicId: "a" }).state;
  const out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.ok, true);
  assert.ok(out.state.decidedAt);
  assert.equal(out.decision.post, "fixture-post");
  assert.equal(out.decision.target, "openpost");
  assert.equal(out.decision.format, "carousel");
  assert.equal(out.decision.music.id, "a");
  assert.equal(out.decision.music.label, "A · Rumba");
  assert.match(out.decision.music.note, /sustituir/); // generated loop disclaimer
  assert.deepEqual(out.decision.slides.map((s) => s.id), ["m1", "m2"]);
  assert.equal(out.decision.reel.videoId, null); // carousel decided → no reel video

  // locked: every mutation refuses until reopen
  for (const action of [
    { action: "apply-preset", presetId: "p2" },
    { action: "toggle-media", id: "m3" },
    { action: "choose-music", musicId: "b" },
    { action: "decide" },
  ]) {
    assert.equal(applyStudioAction(def, out.state, action).error, "STUDIO_LOCKED");
  }
  const reopened = applyStudioAction(def, out.state, { action: "reopen" });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.decidedAt, null);
  assert.equal(applyStudioAction(def, state, { action: "reopen" }).error, "STUDIO_NOT_DECIDED");
});

test("decide as reel carries the chosen video in the receipt", () => {
  const def = parseStudioDefinition(definitionFixture());
  let state = initialStateFor(def);
  state = applyStudioAction(def, state, { action: "choose-format", format: "reel" }).state;
  state = applyStudioAction(def, state, { action: "choose-reel-video", videoId: null }).state;
  assert.equal(applyStudioAction(def, state, { action: "choose-music", musicId: "a" }).ok, true);
  state = applyStudioAction(def, state, { action: "choose-music", musicId: "a" }).state;
  assert.equal(applyStudioAction(def, state, { action: "decide" }).error, "REEL_VIDEO_REQUIRED");
  state = applyStudioAction(def, state, { action: "choose-reel-video", videoId: "v1" }).state;
  const out = applyStudioAction(def, state, { action: "decide" });
  assert.equal(out.decision.format, "reel");
  assert.equal(out.decision.reel.videoId, "v1");
  assert.equal(out.decision.reel.storyboard.length, 1);
});

test("buildDecision maps ids to files and drops unknown ones", () => {
  const def = parseStudioDefinition(definitionFixture());
  const state = { ...initialStateFor(def), selection: ["m2", "ghost"], musicId: "b" };
  const decision = buildDecision(def, state, "2026-10-19T00:00:00.000Z");
  assert.deepEqual(decision.slides, [{ id: "m2", file: "two.jpg", caption: "dos", kind: "photo" }]);
  assert.equal(decision.music.note, ""); // non-generated loop carries no disclaimer
  assert.equal(decision.decidedAt, "2026-10-19T00:00:00.000Z");
});

test("postStudioMediaSrc encodes post and file", () => {
  assert.equal(postStudioMediaSrc("a b", "c d.mp3"), "/api/post-studio/media/a%20b/c%20d.mp3");
});

test("POST_ID_RE accepts slug ids and rejects the rest", () => {
  assert.ok(POST_ID_RE.test("herradura-2026"));
  assert.ok(!POST_ID_RE.test(""));
  assert.ok(!POST_ID_RE.test("-x"));
  assert.ok(!POST_ID_RE.test("a".repeat(50)));
  assert.ok(!POST_ID_RE.test("a/b"));
});

test("server store: get, mutate, decide and asset resolution on a scratch root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "post-studio-test-"));
  const dir = join(root, "fixture-post");
  t.after(() => rm(root, { recursive: true, force: true }));
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(join(dir, "media"), { recursive: true });
  mkdirSync(join(dir, "music"), { recursive: true });
  writeFileSync(join(dir, "studio.json"), JSON.stringify(definitionFixture()));
  writeFileSync(join(dir, "media", "one.jpg"), "jpg-bytes");
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

  assert.equal((await mutatePostStudio("BAD ID", { action: "decide" })).error, "BAD_POST_ID");
  const bad = await mutatePostStudio("fixture-post", { action: "apply-preset", presetId: "zz" });
  assert.equal(bad.ok, false);

  const ok = await mutatePostStudio("fixture-post", { action: "choose-music", musicId: "a" });
  assert.equal(ok.ok, true);
  const decided = await mutatePostStudio("fixture-post", { action: "decide" });
  assert.equal(decided.ok, true);
  assert.equal(decided.decision.post, "fixture-post");
  const { readFileSync, existsSync } = await import("node:fs");
  assert.ok(existsSync(join(dir, "decision.json")));
  assert.ok(existsSync(join(dir, "state.json")));
  assert.equal(JSON.parse(readFileSync(join(dir, "state.json"), "utf8")).musicId, "a");
  // decided → locked
  const locked = await mutatePostStudio("fixture-post", { action: "toggle-media", id: "m3" });
  assert.equal(locked.ok, false);
  assert.equal(locked.error, "STUDIO_LOCKED");
  const reopened = await mutatePostStudio("fixture-post", { action: "reopen" });
  assert.equal(reopened.ok, true);

  // assets: only definition-owned files resolve
  assert.equal(resolvePostStudioAsset("fixture-post", "one.jpg").kind, "photo");
  assert.equal(resolvePostStudioAsset("fixture-post", "a.wav").kind, "music");
  assert.equal(resolvePostStudioAsset("fixture-post", "two.jpg"), null); // in definition but not on disk
  assert.equal(resolvePostStudioAsset("fixture-post", "../studio.json"), null);
  assert.equal(resolvePostStudioAsset("fixture-post", "studio.json"), null); // not a media/music entry
});
