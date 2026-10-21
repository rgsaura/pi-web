import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

// getAgentDir (pi SDK) reads PI_CODING_AGENT_DIR at call time, but the
// package may be imported by any jiti.import below: point the env at a temp
// dir BEFORE any import, or the default-arg paths would read/write the real
// ~/.pi/agent.
const realAgentDirEnv = process.env.PI_CODING_AGENT_DIR;
const testAgentRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-spawn-agentdir-"));
process.env.PI_CODING_AGENT_DIR = testAgentRoot;
after(() => {
  if (realAgentDirEnv === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = realAgentDirEnv;
  fs.rmSync(testAgentRoot, { recursive: true, force: true });
});

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  loadSpawnRoutingConfig,
  classifySpawnCwd,
  parseRgWorktreeCreateOutput,
  pickZoneDocs,
  buildZoneBrief,
  withZoneBrief,
  resolveSpawnRouting,
  lookupWorktreeZone,
  registerPendingZoneBrief,
  consumePendingZoneBrief,
  spawnZonesRoot,
} = await jiti.import("./spawn-routing.ts");

// ── fixtures ────────────────────────────────────────────────────────────────

function createTempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-web-spawn-routing-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

function writeConfig(home, config) {
  const configPath = path.join(home, "routing.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config));
  return configPath;
}

function baseConfig(home) {
  const workspaces = path.join(home, "workspaces");
  const uiBase = path.join(workspaces, "exohuman-ui");
  const prodTree = path.join(workspaces, "exohuman-ui-prod");
  const registry = path.join(home, "state", "worktrees.json");
  fs.mkdirSync(uiBase, { recursive: true });
  fs.mkdirSync(path.dirname(registry), { recursive: true });
  return {
    worktreesRoot: workspaces,
    worktreeRegistry: registry,
    protectedPorts: [30141, 30149],
    protectedWorktrees: [prodTree, path.join(workspaces, "exohuman-ui")],
    projects: {
      "exohuman-ui": { base: uiBase, baseBranch: "main", git: true },
      general: { base: home, git: false },
    },
  };
}

function optionsFor(home) {
  return { configPath: path.join(home, "routing.json"), homeDir: home };
}

/** A fake rg-worktree binary: records successful calls, prints the canonical JSON. */
function fakeRgWorktree(home, t, behavior = {}) {
  const calls = [];
  const bin = path.join(home, "bin", "rg-worktree");
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  const script = [
    "#!/bin/sh",
    ...(
      behavior.fail
        ? [`echo "boom: cannot create worktree" >&2; exit 1`]
        : [
            'echo "rg-worktree $*" >> "$RECORD"',
            ...(
              behavior.stdout !== undefined
                ? [`cat <<'EOF'`, behavior.stdout, `EOF`]
                : [
                    `hex=$(echo "$2" | sed 's/^enc-//')`,
                    `printf '{"name":"wt-%s","path":"${home}/workspaces/wt-%s","branch":"fork/%s","base":"${home}/workspaces/exohuman-ui","baseBranch":"main","port":"30150"}\\n' "$hex" "$hex" "$hex"`,
                    // the fake worktree must exist for pickZoneDocs
                    `mkdir -p "${home}/workspaces/wt-$hex"`,
                  ]
            ),
            "exit 0",
          ]
    ),
  ].join("\n");
  fs.writeFileSync(bin, script.replace(/\$RECORD/g, path.join(home, "calls.log")), { mode: 0o755 });
  t.after(() => { try { fs.unlinkSync(bin); } catch { /* gone */ } });
  return { bin, calls };
}

// ── config loading ──────────────────────────────────────────────────────────

test("loadSpawnRoutingConfig: missing file means inactive (null), invalid file throws", (t) => {
  const home = createTempHome(t);
  const missing = loadSpawnRoutingConfig({ configPath: path.join(home, "absent.json") });
  assert.equal(missing, null);

  const configPath = path.join(home, "routing.json");
  fs.writeFileSync(configPath, "{ not json");
  assert.throws(() => loadSpawnRoutingConfig({ configPath }), /cannot parse/);
});

test("loadSpawnRoutingConfig caches by mtime+size", (t) => {
  const home = createTempHome(t);
  const config = baseConfig(home);
  const configPath = writeConfig(home, config);
  const first = loadSpawnRoutingConfig({ configPath });
  const second = loadSpawnRoutingConfig({ configPath });
  assert.equal(first, second); // same object: served from cache
});

// ── classification ──────────────────────────────────────────────────────────

test("classifySpawnCwd: git base (or subdir) requires a zone; prod/pre refused; rest passes", (t) => {
  const home = createTempHome(t);
  const config = loadSpawnRoutingConfig({ configPath: writeConfig(home, baseConfig(home)) });

  const uiBase = path.join(home, "workspaces", "exohuman-ui");
  assert.deepEqual(classifySpawnCwd(uiBase, config), {
    kind: "zone_required", project: "exohuman-ui", base: uiBase,
  });
  assert.deepEqual(classifySpawnCwd(path.join(uiBase, "app"), config), {
    kind: "zone_required", project: "exohuman-ui", base: uiBase,
  });

  const prod = path.join(home, "workspaces", "exohuman-ui-prod");
  fs.mkdirSync(prod, { recursive: true });
  const refused = classifySpawnCwd(prod, config);
  assert.equal(refused.kind, "refused");
  assert.match(refused.reason, /protected tree/);

  // A registered worktree sits beside the base, inside `general` (home): the
  // LONGEST base wins, so it is a non-git passthrough, not a zone.
  const wt = path.join(home, "workspaces", "wt-1a2b3c4d");
  fs.mkdirSync(wt, { recursive: true });
  assert.equal(classifySpawnCwd(wt, config).kind, "base_nogit");

  // Anywhere else in home: the non-git `general` base (passthrough with its project).
  assert.equal(classifySpawnCwd(path.join(home, "notes"), config).kind, "base_nogit");
  // Outside every base (home's parent, /tmp): plain passthrough.
  assert.equal(classifySpawnCwd(path.dirname(home), config).kind, "passthrough");
});

// ── rg-worktree output parsing ──────────────────────────────────────────────

test("parseRgWorktreeCreateOutput: last JSON line wins, human logs ignored", () => {
  const stdout = [
    "[2026-10-20 15:00:00] creating worktree",
    '{"name":"wt-00000000","path":"/tmp/wt-00000000","branch":"fork/00000000","port":"30150","reused":false}',
    "[2026-10-20 15:00:01] done",
  ].join("\n");
  assert.deepEqual(parseRgWorktreeCreateOutput(stdout), {
    name: "wt-00000000", path: "/tmp/wt-00000000", branch: "fork/00000000", port: "30150", reused: false,
  });

  assert.throws(() => parseRgWorktreeCreateOutput("no json at all"), /no JSON/);
});

// ── brief ───────────────────────────────────────────────────────────────────

test("buildZoneBrief carries path, port, docs cap of 2 and artifact rules", () => {
  const zone = {
    encargo: "enc-1a2b3c4d", project: "exohuman-ui",
    base: "/home/x/workspaces/exohuman-ui",
    worktreePath: "/home/x/workspaces/wt-1a2b3c4d",
    branch: "fork/1a2b3c4d", port: "30150",
    cacheDir: "/home/x/.cache/enc-1a2b3c4d",
  };
  const brief = buildZoneBrief(zone, [30141, 30149], ["AGENTS.md", "README.md"]);
  assert.match(brief, /wt-1a2b3c4d/);
  assert.match(brief, /fork\/1a2b3c4d/);
  assert.match(brief, /30150/);
  assert.match(brief, /30141, 30149/);
  assert.match(brief, /AGENTS\.md/);
  assert.match(brief, /\/home\/x\/\.cache\/enc-1a2b3c4d/);
  assert.match(brief, /nunca en ~/);
  assert.ok(brief.length < 1200, "brief stays bounded");
  // More than 2 candidate docs still yield at most 2 lines of docs.
  const threeDocs = buildZoneBrief(zone, [], ["A.md", "B.md", "C.md"]);
  assert.match(threeDocs, /A\.md · B\.md/);
  assert.doesNotMatch(threeDocs, /C\.md/);
});

test("withZoneBrief delimits the brief above the caller's message", () => {
  const combined = withZoneBrief("[BRIEF]", "do the work");
  assert.equal(combined, "[BRIEF]\n\n---\n\ndo the work");
});

test("pickZoneDocs returns at most 2 existing doc candidates from the zone checkout", (t) => {
  const zone = createTempHome(t);
  fs.writeFileSync(path.join(zone, "AGENTS.md"), "x");
  fs.writeFileSync(path.join(zone, "README.md"), "x");
  fs.writeFileSync(path.join(zone, "CONTEXT.md"), "x");
  assert.deepEqual(pickZoneDocs(zone), ["AGENTS.md", "README.md"]);

  const empty = path.join(createTempHome(t), "empty");
  fs.mkdirSync(empty, { recursive: true });
  assert.deepEqual(pickZoneDocs(empty), []);
});

// ── resolveSpawnRouting (end decisions, fake rg-worktree) ───────────────────

test("resolveSpawnRouting: base tree spawn gets a zone with brief; failure fails closed", async (t) => {
  const home = createTempHome(t);
  const config = baseConfig(home);
  writeConfig(home, config);
  const fake = fakeRgWorktree(home, t);
  const options = { ...optionsFor(home), rgWorktreeBin: fake.bin };

  const uiBase = path.join(home, "workspaces", "exohuman-ui");
  const outcome = await resolveSpawnRouting(uiBase, options);
  assert.equal(outcome.kind, "zone");
  assert.match(outcome.zone.encargo, /^enc-[0-9a-f]{8}$/);
  assert.equal(outcome.zone.worktreePath, path.join(home, "workspaces", `wt-${outcome.zone.encargo.slice(4)}`));
  assert.equal(outcome.zone.branch, `fork/${outcome.zone.encargo.slice(4)}`);
  assert.equal(outcome.zone.port, "30150");
  assert.ok(fs.existsSync(outcome.zone.cacheDir), "zone cache dir created");
  assert.match(outcome.brief, /ZONA DE TRABAJO ASIGNADA/);

  // rg-worktree was called exactly once with create <enc> --project exohuman-ui
  const calls = fs.readFileSync(path.join(home, "calls.log"), "utf8").trim().split("\n");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /create enc-[0-9a-f]{8} --project exohuman-ui/);

  // Failure closes the door: no fallback, a thrown error the route surfaces.
  const broken = fakeRgWorktree(home, t, { fail: true });
  await assert.rejects(
    () => resolveSpawnRouting(uiBase, { ...optionsFor(home), rgWorktreeBin: broken.bin }),
    /rg-worktree create failed/,
  );
});

test("resolveSpawnRouting: passthrough and refused cwds never call rg-worktree", async (t) => {
  const home = createTempHome(t);
  writeConfig(home, baseConfig(home));
  const fake = fakeRgWorktree(home, t);
  const options = { ...optionsFor(home), rgWorktreeBin: fake.bin };

  const wt = path.join(home, "workspaces", "wt-deadbeef");
  fs.mkdirSync(wt, { recursive: true });
  assert.equal((await resolveSpawnRouting(wt, options)).kind, "passthrough");
  assert.equal((await resolveSpawnRouting(home, options)).kind, "passthrough");

  const prod = path.join(home, "workspaces", "exohuman-ui-prod");
  fs.mkdirSync(prod, { recursive: true });
  const refused = await resolveSpawnRouting(prod, options);
  assert.equal(refused.kind, "refused");

  assert.ok(!fs.existsSync(path.join(home, "calls.log")), "no zone creation for non-base cwds");
});

// ── worktree registry lookup (passthrough metadata) ─────────────────────────

test("lookupWorktreeZone maps a cwd inside a registered worktree to its zone info", (t) => {
  const home = createTempHome(t);
  const config = baseConfig(home);
  writeConfig(home, config);
  fs.writeFileSync(config.worktreeRegistry, JSON.stringify({
    worktrees: {
      "wt-a81dfe71": {
        encargo: "enc-a81dfe71", project: "exohuman-ui",
        branch: "fork/a81dfe71", port: "30150",
        path: path.join(home, "workspaces", "wt-a81dfe71"),
      },
    },
  }));
  const options = optionsFor(home);
  const info = lookupWorktreeZone(path.join(home, "workspaces", "wt-a81dfe71", "lib"), options);
  assert.deepEqual(info, {
    project: "exohuman-ui", encargo: "enc-a81dfe71", branch: "fork/a81dfe71", port: "30150",
  });
  assert.equal(lookupWorktreeZone(path.join(home, "elsewhere"), options), null);
});

// ── pending zone briefs ─────────────────────────────────────────────────────

test("pending zone briefs: registered, consumed once, and survive in the zone dir", async () => {
  const agentDir = path.join(testAgentRoot, "agent");

  const { getAgentDir } = await jiti.import("@earendil-works/pi-coding-agent");
  assert.equal(getAgentDir(), testAgentRoot, "PI_CODING_AGENT_DIR set before imports wins");
  assert.equal(path.dirname(spawnZonesRoot(agentDir)), agentDir);

  registerPendingZoneBrief("session-1", "[BRIEF]", agentDir);
  assert.equal(consumePendingZoneBrief("session-1", agentDir), "[BRIEF]");
  assert.equal(consumePendingZoneBrief("session-1", agentDir), null, "one-shot");

  // Disk-backed arm: fresh process state (map cleared) still finds the marker.
  registerPendingZoneBrief("session-2", "[BRIEF-2]", agentDir);
  globalThis.__piPendingZoneBriefs?.clear();
  assert.equal(consumePendingZoneBrief("session-2", agentDir), "[BRIEF-2]");
  assert.ok(!fs.existsSync(path.join(spawnZonesRoot(agentDir), "session-2.json")), "marker removed after consumption");

  // Default args resolve through getAgentDir → the test agent root.
  registerPendingZoneBrief("session-3", "[BRIEF-3]");
  globalThis.__piPendingZoneBriefs?.clear();
  assert.equal(consumePendingZoneBrief("session-3"), "[BRIEF-3]");
});
