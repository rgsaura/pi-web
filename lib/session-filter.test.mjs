import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  filterAndSortSessions,
  inferSessionCategory,
} = await jiti.import("./session-filter.ts");

const dummySession = (id, overrides = {}) => ({
  id,
  path: `/tmp/${id}.jsonl`,
  cwd: "/home/rgsaura/workspaces/exohuman-ui",
  modified: new Date().toISOString(),
  created: new Date().toISOString(),
  messageCount: 5,
  firstMessage: "Hola",
  ...overrides,
});

test("inferSessionCategory classifies sessions by keywords", () => {
  const s1 = dummySession("1", { cwd: "/work/facesearch", firstMessage: "Arreglar checkout" });
  assert.equal(inferSessionCategory(s1).category, "facesearch");

  const s2 = dummySession("2", { cwd: "/work/exohuman-ui", firstMessage: "Filtros en sidebar" });
  assert.equal(inferSessionCategory(s2).category, "ui");

  const s3 = dummySession("3", { cwd: "/home/rgsaura", firstMessage: "triage de telegram beeper" });
  assert.equal(inferSessionCategory(s3).category, "comms");

  const s4 = dummySession("4", { cwd: "/home/rgsaura/routines/daily", firstMessage: "briefing" });
  assert.equal(inferSessionCategory(s4).category, "rutinas");
});

test("filterAndSortSessions filters by category and activeNowOnly", () => {
  const now = Date.now();
  const s1 = dummySession("1", { cwd: "/work/facesearch", modified: new Date(now - 1000).toISOString() });
  const s2 = dummySession("2", { cwd: "/work/exohuman-ui", modified: new Date(now - 20 * 60_000).toISOString() });
  const s3 = dummySession("3", { cwd: "/work/infra", modified: new Date(now - 2000).toISOString() });

  const runningIds = new Set(["1"]);
  const awaitingIds = new Set();

  // activeNowOnly
  const activeOnly = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: true,
    category: "all",
    searchQuery: "",
    sortMode: "recent",
  }, now, runningIds, awaitingIds);

  assert.equal(activeOnly.length, 2);
  assert.deepEqual(activeOnly.map(s => s.id), ["1", "3"]);

  // working category filter
  const workingOnly = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: false,
    category: "working",
    searchQuery: "",
    sortMode: "recent",
  }, now, runningIds, awaitingIds);
  assert.equal(workingOnly.length, 1);
  assert.equal(workingOnly[0].id, "1");

  // facesearch category filter
  const faceOnly = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: false,
    category: "facesearch",
    searchQuery: "",
    sortMode: "recent",
  }, now, runningIds, awaitingIds);
  assert.equal(faceOnly.length, 1);
  assert.equal(faceOnly[0].id, "1");
});

test("filterAndSortSessions sorts by recent, name and messages", () => {
  const now = Date.now();
  const s1 = dummySession("1", { name: "Zeta", modified: new Date(now - 1000).toISOString(), messageCount: 10 });
  const s2 = dummySession("2", { name: "Alfa", modified: new Date(now - 5000).toISOString(), messageCount: 50 });
  const s3 = dummySession("3", { name: "Beta", modified: new Date(now - 200).toISOString(), messageCount: 2 });

  const byRecent = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: false,
    category: "all",
    searchQuery: "",
    sortMode: "recent",
  }, now, new Set(), new Set());
  assert.deepEqual(byRecent.map(s => s.id), ["3", "1", "2"]);

  const byName = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: false,
    category: "all",
    searchQuery: "",
    sortMode: "name",
  }, now, new Set(), new Set());
  assert.deepEqual(byName.map(s => s.id), ["2", "3", "1"]);

  const byMsg = filterAndSortSessions([s1, s2, s3], {
    activeNowOnly: false,
    category: "all",
    searchQuery: "",
    sortMode: "messages",
  }, now, new Set(), new Set());
  assert.deepEqual(byMsg.map(s => s.id), ["2", "1", "3"]);
});

test("inferSessionCategory: spawn routing metadata wins over keyword matching", () => {
  // A worktree cwd (hex8) says nothing to keyword matching, but the routing
  // sidecar (enc-a81dfe71) pins the project exactly.
  const routed = dummySession("1", {
    cwd: "/home/rgsaura/workspaces/exohuman/.worktrees/wt-1a2b3c4d",
    firstMessage: "cambia el botón",
    routing: { project: "exohuman-ui", encargo: "enc-1a2b3c4d", spawnedAt: new Date().toISOString() },
  });
  assert.equal(inferSessionCategory(routed).category, "ui");

  const routedFs = dummySession("2", {
    cwd: "/home/rgsaura/workspaces/exohuman/.worktrees/wt-deadbeef",
    firstMessage: "cambia el botón",
    routing: { project: "facesearch", encargo: "enc-deadbeef", spawnedAt: new Date().toISOString() },
  });
  assert.equal(inferSessionCategory(routedFs).category, "facesearch");

  // Without routing metadata the keyword fallback keeps working.
  assert.equal(inferSessionCategory(dummySession("3", { cwd: "/work/exohuman-ui", firstMessage: "x" })).category, "ui");
});
