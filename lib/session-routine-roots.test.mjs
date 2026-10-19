import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { additionalSessionRoots } = await jiti.import("./session-list-scanner.ts");
const { resolveSessionPath, resolveSessionIdByPath } = await jiti.import("./session-reader.ts");

// The fixture home must be in place while the tests run, not while the
// modules load: every helper reads the env at call time. Setup and teardown
// live in before()/after() so module evaluation (which finishes before any
// test callback starts) never restores the env early.
const fixtureHome = mkdtempSync(join(tmpdir(), "pi-web-routine-roots-"));
const previousHome = process.env.HOME;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

const routinesRoot = join(fixtureHome, ".local/state/routines/sessions");
const botRoot = join(fixtureHome, ".local/state/rg-facesearch-bot/sessions");

function writeSession(dir, fileName, id) {
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, fileName);
  writeFileSync(filePath, `${JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-19T00:00:00.000Z", cwd: "/tmp" })}\n`);
  return filePath;
}

before(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  process.env.HOME = fixtureHome;
});

after(() => {
  process.env.HOME = previousHome;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(fixtureHome, { recursive: true, force: true });
});

test("additionalSessionRoots lists the routine and bot roots under HOME", () => {
  assert.deepEqual(additionalSessionRoots(), [routinesRoot, botRoot]);
});

test("additionalSessionRoots is empty when the agent dir is isolated", () => {
  process.env.PI_CODING_AGENT_DIR = join(fixtureHome, "isolated-agent");
  try {
    assert.deepEqual(additionalSessionRoots(), []);
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
  }
});

test("resolveSessionPath resolves a routine session id without the catalogue fallback", async () => {
  const filePath = writeSession(join(routinesRoot, "rot-archive"), "2026-10-15T19-27-22-080Z_rot-test-r8.jsonl", "rot-test-r8");
  // A cold targeted lookup must find it: the fixture agent dir has no
  // sessions at all, so only the additional-roots scan can answer.
  assert.equal(await resolveSessionPath("rot-test-r8"), filePath);
});

test("resolveSessionPath resolves a bot session file sitting directly in the root", async () => {
  const filePath = writeSession(botRoot, "2026-10-15T06-03-06-059Z_bot-test-1.jsonl", "bot-test-1");
  assert.equal(await resolveSessionPath("bot-test-1"), filePath);
});

test("a candidate whose header id differs is not resolved as the requested id", async () => {
  writeSession(join(routinesRoot, "morning-brief"), "2026-10-19T05-00-00-000Z_decoy-id.jsonl", "someone-else");
  assert.equal(await resolveSessionPath("decoy-id"), null);
});

test("duplicate header ids across roots resolve to the newest file, like a rotated routine id", async () => {
  // rot-telegram-r8 exists in rot/ and in two rot-archive/ copies at once:
  // the live file has the newest mtime and must own the id (enc-7baa576c).
  const archived = writeSession(join(routinesRoot, "dup-a"), "2026-01-01T00-00-00-000Z_dup-id.jsonl", "dup-id");
  const live = writeSession(botRoot, "2026-01-02T00-00-00-000Z_dup-id.jsonl", "dup-id");
  utimesSync(archived, new Date("2026-10-15T00:00:00Z"), new Date("2026-10-15T00:00:00Z"));
  utimesSync(live, new Date("2026-10-19T00:00:00Z"), new Date("2026-10-19T00:00:00Z"));
  assert.equal(await resolveSessionPath("dup-id"), live);
});

test("resolveSessionIdByPath reads the id of a routine session file directly", async () => {
  const filePath = writeSession(join(routinesRoot, "rot-archive"), "2026-10-19T07-00-00-000Z_rot-test-path.jsonl", "rot-test-path");
  assert.equal(await resolveSessionIdByPath(filePath), "rot-test-path");
});

test("a path outside every session root is not accepted", async () => {
  const filePath = writeSession(join(fixtureHome, "elsewhere"), "2026-01-01T00-00-00-000Z_outside-id.jsonl", "outside-id");
  assert.equal(await resolveSessionIdByPath(filePath), undefined);
});
