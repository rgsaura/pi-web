import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { isSessionActiveNow, activeNowSessionIds, ACTIVE_NOW_WINDOW_MS } = await jiti.import("./session-activity.ts");

const now = Date.UTC(2026, 9, 15, 14, 0, 0);

test("a live process or a recent write makes a session active now", () => {
  const session = { id: "s1", modified: new Date(now - 3600_000).toISOString() };
  assert.equal(isSessionActiveNow(session, now, new Set(["s1"]), new Set()), true, "running");
  assert.equal(isSessionActiveNow(session, now, new Set(), new Set(["s1"])), true, "awaiting input");
  assert.equal(isSessionActiveNow(session, now, new Set(), new Set()), false, "an hour old, no process");
});

test("activity inside the window counts, at the edge it does not", () => {
  const inside = { id: "s2", modified: new Date(now - (ACTIVE_NOW_WINDOW_MS - 1000)).toISOString() };
  const outside = { id: "s3", modified: new Date(now - (ACTIVE_NOW_WINDOW_MS + 1000)).toISOString() };
  assert.equal(isSessionActiveNow(inside, now, new Set(), new Set()), true);
  assert.equal(isSessionActiveNow(outside, now, new Set(), new Set()), false);
});

test("a future or unparsable date never counts as recent on its own", () => {
  assert.equal(isSessionActiveNow({ id: "s4", modified: "nonsense" }, now, new Set(), new Set()), false);
  assert.equal(isSessionActiveNow({ id: "s5", modified: "" }, now, new Set(), new Set()), false);
  // Clock skew: modified slightly ahead of now still counts (negative age).
  assert.equal(isSessionActiveNow({ id: "s6", modified: new Date(now + 30_000).toISOString() }, now, new Set(), new Set()), true);
});

test("the id set keeps only the active ones", () => {
  const ids = activeNowSessionIds([
    { id: "old", modified: new Date(now - 7200_000).toISOString() },
    { id: "fresh", modified: new Date(now - 60_000).toISOString() },
    { id: "churning", modified: new Date(now - 7200_000).toISOString() },
  ], now, new Set(["churning"]), new Set());
  assert.deepEqual([...ids], ["fresh", "churning"]);
});
