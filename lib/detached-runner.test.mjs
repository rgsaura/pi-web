import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  detachedUnitName,
  readDetachedRun,
  listDetachedRuns,
  isDetachedRunActive,
  getActiveDetachedSessionIds,
  buildWrapperScript,
  __setUnitProbeForTests,
} = await jiti.import("./detached-runner.ts");

const {
  excludeProfileExtension,
} = await jiti.import("./extension-profile-exclusion.ts");

// ── detached runner ──────────────────────────────────────────────────────────

test("unit names sanitize to systemd-safe scope names", () => {
  assert.equal(detachedUnitName("01a15874-6ab7-74c3-bde2-5905027093b0"), "pi-session-01a15874-6ab7-74c3-bde2-5905027093b0.scope");
  assert.throws(() => detachedUnitName("///"));
});

test("records roundtrip: list reads what was written", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-web-detached-test-"));
  try {
    const runsDir = join(agentDir, "pi-web-detached", "runs");
    mkdirSync(runsDir, { recursive: true });
    const run = {
      sessionId: "test-uuid-1",
      unit: "pi-session-test-uuid-1.scope",
      cwd: "/tmp",
      startedAt: "2026-10-20T00:00:00.000Z",
      status: "running",
      logPath: "/tmp/x.log",
    };
    writeFileSync(join(runsDir, "test-uuid-1.json"), JSON.stringify(run));
    const listed = listDetachedRuns(agentDir);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].sessionId, "test-uuid-1");
    assert.equal(readDetachedRun("test-uuid-1", agentDir)?.unit, "pi-session-test-uuid-1.scope");
    assert.equal(readDetachedRun("missing", agentDir), null);
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("a running record with a dead unit is reconciled to lost and inactive", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-web-detached-test-"));
  try {
    const runsDir = join(agentDir, "pi-web-detached", "runs");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "sess-dead.json"), JSON.stringify({
      sessionId: "sess-dead",
      unit: "pi-session-sess-dead.scope",
      cwd: "/tmp",
      startedAt: "2026-10-20T00:00:00.000Z",
      status: "running",
      logPath: "/tmp/y.log",
    }));
    __setUnitProbeForTests(async () => false);
    assert.equal(await isDetachedRunActive("sess-dead", agentDir), false);
    assert.equal(readDetachedRun("sess-dead", agentDir)?.status, "lost");
  } finally {
    __setUnitProbeForTests(null);
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("getActiveDetachedSessionIds reports only live units and reconciles the rest", async () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-web-detached-test-"));
  try {
    const runsDir = join(agentDir, "pi-web-detached", "runs");
    mkdirSync(runsDir, { recursive: true });
    for (const row of [["sess-live", "running"], ["sess-gone", "running"], ["sess-done", "exited"]]) {
      const [id, status] = row;
      writeFileSync(join(runsDir, `${id}.json`), JSON.stringify({
        sessionId: id,
        unit: `pi-session-${id}.scope`,
        cwd: "/tmp",
        startedAt: "2026-10-20T00:00:00.000Z",
        status,
        logPath: "/tmp/z.log",
      }));
    }
    __setUnitProbeForTests(async (unit) => unit === "pi-session-sess-live.scope");
    const active = await getActiveDetachedSessionIds(agentDir);
    assert.deepEqual(active, ["sess-live"]);
    assert.equal(readDetachedRun("sess-gone", agentDir)?.status, "lost");
    assert.equal(readDetachedRun("sess-done", agentDir)?.status, "exited");
  } finally {
    __setUnitProbeForTests(null);
    rmSync(agentDir, { recursive: true, force: true });
  }
});

test("wrapper script runs pi with the prompt on stdin and writes a final record", () => {
  const script = buildWrapperScript({
    piBin: "/usr/local/bin/pi",
    sessionId: "abc-123",
    promptFile: "/runs/prompts/abc-123.txt",
    logFile: "/runs/logs/abc-123.log",
    recordFile: "/runs/runs/abc-123.json",
    modelArgs: ["--provider", "litellm", "--model", "failover-fast"],
    nameArg: [],
  });
  assert.ok(script.includes("--print --session-id 'abc-123'"));
  assert.ok(script.includes("'--provider' 'litellm' '--model' 'failover-fast'"));
  assert.ok(script.includes("< '/runs/prompts/abc-123.txt'"));
  assert.ok(script.includes("> '/runs/logs/abc-123.log'"));
  assert.ok(script.includes("status=exited"));
  // final record merge is pure python over the two json files
  assert.ok(script.includes("a.update(json.load(open(sys.argv[2])))"));
});

// ── profile exclusion ────────────────────────────────────────────────────────

function fakeBase(paths) {
  return {
    extensions: paths.map((path) => ({ path, resolvedPath: path, tools: new Map(), handlers: new Map(), commands: new Map(), flags: new Map(), shortcuts: new Map(), messageRenderers: new Map(), sourceInfo: {} })),
    errors: paths.map((path) => ({ path, error: "boom" })),
    runtime: {},
  };
}

test("excludeProfileExtension drops only pi-profile entries", () => {
  const base = fakeBase([
    "/home/u/.pi/agent/npm/node_modules/pi-profile/index.ts",
    "/home/u/.pi/agent/npm/node_modules/pi-subagents/index.ts",
    "<inline:pi-web-project-command-environment>",
  ]);
  const filtered = excludeProfileExtension(base);
  assert.equal(filtered.extensions.length, 2);
  assert.ok(filtered.extensions.every((e) => !e.path.includes("pi-profile")));
  assert.equal(filtered.errors.length, 2);
});

test("excludeProfileExtension is a no-op when pi-profile is absent", () => {
  const base = fakeBase(["/a/pi-subagents/index.ts", "/b/custom.ts"]);
  const filtered = excludeProfileExtension(base);
  assert.equal(filtered, base);
});
