import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  normalizeWorkspace,
  normalizeWorkspaceCategory,
  normalizeWorkspaceStatus,
  groupWorkspaces,
  formatWorkspaceAge,
} = await jiti.import("./workspaces-data.ts");

test("categories map from the EXO words, unknown to otro", () => {
  assert.equal(normalizeWorkspaceCategory("proyecto"), "proyecto");
  assert.equal(normalizeWorkspaceCategory("Proyectos"), "proyecto");
  assert.equal(normalizeWorkspaceCategory("temporal"), "temporal");
  assert.equal(normalizeWorkspaceCategory("rutina"), "rutina");
  assert.equal(normalizeWorkspaceCategory("misterio"), "otro");
  assert.equal(normalizeWorkspaceCategory(undefined), "otro");
});

test("status: field first, a closed title second, active by default", () => {
  assert.equal(normalizeWorkspaceStatus("active", null), "active");
  assert.equal(normalizeWorkspaceStatus("terminado", null), "done");
  assert.equal(normalizeWorkspaceStatus("pendiente", null), "pending");
  assert.equal(normalizeWorkspaceStatus(undefined, "Investigación voz en vivo (cerrado)"), "done");
  assert.equal(normalizeWorkspaceStatus(undefined, "StoryLater — Mejora continua"), "active");
  assert.equal(normalizeWorkspaceStatus("en_curso", null), "active");
});

test("a workspace.json normalizes with phases, steps and a resolvable cwd", () => {
  const workspace = normalizeWorkspace("wallapop", {
    id: "wallapop",
    category: "rutina",
    title: "Watcher Wallapop",
    created_at: "2026-10-15T03:24:00Z",
    phases: { intake: { status: "done" }, watch: { status: "running", name: "Watcher" } },
    next_steps: ["Revisar avisos", "", 42],
    cwd: "/home/rgsaura/workspaces/wallapop",
  }, "2026-10-15T12:19:10.161Z", null);
  assert.equal(workspace.title, "Watcher Wallapop");
  assert.equal(workspace.status, "active");
  assert.equal(workspace.createdAt, "2026-10-15T03:24:00Z");
  // Phases are a record in EXO's files: the key is the name, the value the detail.
  assert.deepEqual(workspace.phases, [
    { name: "intake", status: "done" },
    { name: "watch", status: "active" },
  ]);
  assert.deepEqual(workspace.nextSteps, ["Revisar avisos"]);
  assert.equal(workspace.cwd, "/home/rgsaura/workspaces/wallapop");
});

test("a bare record falls back to folder id, title and the conventional cwd", () => {
  const workspace = normalizeWorkspace("storylater", { category: "proyecto" }, null, "/home/rgsaura/workspaces/storylater");
  assert.equal(workspace.id, "storylater");
  assert.equal(workspace.title, "storylater");
  assert.equal(workspace.cwd, "/home/rgsaura/workspaces/storylater");
  assert.equal(workspace.updatedAt, null);
  assert.deepEqual(workspace.phases, []);
  const missing = normalizeWorkspace("x", null, null, null);
  assert.equal(missing.title, "x");
  assert.equal(missing.category, "otro");
});

test("groups come in sidebar order, newest first inside", () => {
  const groups = groupWorkspaces([
    { id: "a", title: "A", category: "rutina", status: "active", createdAt: null, updatedAt: "2026-10-15T10:00:00Z", phases: [], nextSteps: [], cwd: null },
    { id: "b", title: "B", category: "proyecto", status: "active", createdAt: null, updatedAt: "2026-10-15T12:00:00Z", phases: [], nextSteps: [], cwd: null },
    { id: "c", title: "C", category: "proyecto", status: "done", createdAt: null, updatedAt: null, phases: [], nextSteps: [], cwd: null },
    { id: "d", title: "D", category: "temporal", status: "pending", createdAt: null, updatedAt: "2026-10-14T09:00:00Z", phases: [], nextSteps: [], cwd: null },
  ]);
  assert.deepEqual(groups.map((group) => group.label), ["Proyectos", "Temporales", "Rutinas"]);
  assert.deepEqual(groups[0].workspaces.map((workspace) => workspace.id), ["b", "c"]);
  assert.deepEqual(groups[1].workspaces.map((workspace) => workspace.id), ["d"]);
});

test("ages in spanish", () => {
  const now = Date.UTC(2026, 9, 15, 12, 30, 0);
  assert.equal(formatWorkspaceAge(new Date(now - 30_000).toISOString(), now), "ahora");
  assert.equal(formatWorkspaceAge(new Date(now - 12 * 60_000).toISOString(), now), "hace 12 min");
  assert.equal(formatWorkspaceAge(new Date(now - 3 * 3600_000).toISOString(), now), "hace 3 h");
  assert.equal(formatWorkspaceAge(new Date(now - 2 * 86_400_000).toISOString(), now), "hace 2 d");
  assert.equal(formatWorkspaceAge(null, now), null);
});
