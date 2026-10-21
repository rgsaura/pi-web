import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

/**
 * Detached session runner (enc-7c2d78ac).
 *
 * `/api/agent/new` can start a session as an OUT-OF-PROCESS `pi --print` run
 * inside its own systemd scope (`systemd-run --user --scope`). Such a run:
 *
 * - survives restarts of the pi-web server (own cgroup: a service restart only
 *   kills the service's cgroup) — the 00:32 class of incident where the guard
 *   restarted production and SIGTERM'd a live encargo mid-run;
 * - keeps its dev servers and helper processes out of the production cgroup,
 *   so they stop counting against the server's memory limits;
 * - writes the same session `.jsonl` every other pi run writes, so the file
 *   shows in the sidebar and can be opened read-only while it runs.
 *
 * The registry lives in `<agentDir>/pi-web-detached/`:
 *   runs/<sessionId>.json   run record (status machine below)
 *   prompts/<sessionId>.txt the prompt, fed to pi on stdin (no argv limits)
 *   wrappers/<sessionId>.sh the scope's inner script; writes the final record
 *   logs/<sessionId>.log    pi stdout+stderr for post-mortem
 *
 * Record status machine: running → exited | failed | aborted | lost.
 * Liveness reads verify the run's host (systemd unit, or the wrapper pid for
 * process runs) on every poll; a record that says running while its host is
 * gone is reconciled to `lost`, and — enc-aca74f1f — a terminal record whose
 * host is still alive (poisoned by older code) is healed back to `running`:
 * the probe, not the record, decides (pi-web crashed between spawn and wrapper
 * bookkeeping, or the unit was stopped out-of-band).
 */

export interface DetachedRunStart {
  cwd: string;
  message: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  name?: string;
}

export type DetachedRunStatus = "running" | "exited" | "failed" | "aborted" | "lost";

export interface DetachedRun {
  sessionId: string;
  unit: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  status: DetachedRunStatus;
  logPath: string;
  /** Process-runner bookkeeping (api container, enc-29d7943d). */
  runner?: RunnerMode;
  pid?: number;
  model?: { provider: string; modelId: string } | null;
  thinkingLevel?: string | null;
}

export interface DetachedRunnerOptions {
  /** Override for tests. */
  systemdRunBin?: string;
  systemctlBin?: string;
  piBin?: string;
  /** Test seam: how the wrapper script resolves pi. */
  spawnTimeoutMs?: number;
}

const DEFAULTS: Required<Pick<DetachedRunnerOptions, "systemdRunBin" | "systemctlBin" | "piBin" | "spawnTimeoutMs">> = {
  systemdRunBin: "systemd-run",
  systemctlBin: "systemctl",
  piBin: "/usr/local/bin/pi",
  spawnTimeoutMs: 10_000,
};

/**
 * Runner mode (enc-29d7943d): `systemd` (host: scoped units) or `process`
 * (api container: supervised plain child processes — no systemd --user inside
 * Docker). Explicit env wins; otherwise auto-detect via /run/systemd/system.
 */
export type RunnerMode = "systemd" | "process";

export function resolveRunnerMode(): RunnerMode {
  const env = process.env.EXO_RUNNER_MODE;
  if (env === "process" || env === "systemd") return env;
  return existsSync("/run/systemd/system") ? "systemd" : "process";
}

/** systemd unit names allow [a-zA-Z0-9:._-\\] — UUIDs are already safe. */
export function detachedUnitName(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, "");
  if (!safe) throw new Error("sessionId has no unit-safe characters");
  return `pi-session-${safe}.scope`;
}

export function detachedRoot(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-detached");
}

function runPath(sessionId: string, agentDir?: string): string {
  return join(detachedRoot(agentDir), "runs", `${sessionId}.json`);
}

export function readDetachedRun(sessionId: string, agentDir?: string): DetachedRun | null {
  const path = runPath(sessionId, agentDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as DetachedRun;
  } catch {
    return null;
  }
}

function writeDetachedRun(run: DetachedRun, agentDir?: string): void {
  const path = runPath(run.sessionId, agentDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(run, null, 2));
  renameSync(tmp, path);
}

export function listDetachedRuns(agentDir?: string): DetachedRun[] {
  const dir = join(detachedRoot(agentDir), "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".tmp"))
    .map((file) => {
      try {
        return JSON.parse(readFileSync(join(dir, file), "utf-8")) as DetachedRun;
      } catch {
        return null;
      }
    })
    .filter((run): run is DetachedRun => run !== null);
}

// ── systemd unit liveness (memoized: /api/agent/running polls every 2.5 s) ──

type UnitProbe = (unit: string) => Promise<boolean>;

const unitProbeCache = new Map<string, { active: boolean; ts: number }>();
const UNIT_PROBE_TTL_MS = 2_500;

let customUnitProbe: UnitProbe | null = null;

/** Test seam: replace the systemctl probe. */
export function __setUnitProbeForTests(probe: UnitProbe | null): void {
  customUnitProbe = probe;
  unitProbeCache.clear();
}

async function defaultUnitProbe(unit: string, systemctlBin = DEFAULTS.systemctlBin): Promise<boolean> {
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    execFile(systemctlBin, ["--user", "is-active", unit], { timeout: 5_000 }, (error, stdout) => {
      resolve(!error && String(stdout).trim() === "active");
    });
  });
}

async function isUnitActive(unit: string, options?: DetachedRunnerOptions): Promise<boolean> {
  const cached = unitProbeCache.get(unit);
  const now = Date.now();
  if (cached && now - cached.ts < UNIT_PROBE_TTL_MS) return cached.active;
  const active = customUnitProbe
    ? await customUnitProbe(unit)
    : await defaultUnitProbe(unit, options?.systemctlBin);
  unitProbeCache.set(unit, { active, ts: now });
  return active;
}

/** Process-runner liveness: signal 0 probes the pid without touching it. */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The wrapper path fragment that identifies a run's own pid. */
function wrapperIdentityPath(sessionId: string): string {
  return join("pi-web-detached", "wrappers", `${sessionId}.sh`);
}

function readCmdline(pid: number): string {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch {
    return "";
  }
}

/**
 * True when pid is alive AND is this run's wrapper, not a recycled pid:
 * /proc/<pid>/cmdline must name the wrapper script (zombies read empty on
 * Linux, so they land here as dead). Without /proc (non-Linux dev) the bare
 * signal-0 probe is all we have and stays authoritative.
 */
function isWrapperPid(sessionId: string, pid: number): boolean {
  if (!isPidAlive(pid)) return false;
  const cmdline = readCmdline(pid);
  if (!existsSync("/proc")) return true;
  return cmdline.includes(wrapperIdentityPath(sessionId));
}

/** Run-aware probe: process runs check their pid, systemd runs their unit. */
async function isRunHostAlive(run: DetachedRun, options?: DetachedRunnerOptions): Promise<boolean> {
  if (run.runner === "process" && typeof run.pid === "number") {
    const alive = isWrapperPid(run.sessionId, run.pid);
    unitProbeCache.set(`pid:${run.pid}`, { active: alive, ts: Date.now() });
    return alive;
  }
  return isUnitActive(run.unit, options);
}

/** Drop a stale end time and mark the record running again. */
function markRunning(run: DetachedRun, agentDir?: string): void {
  const healed = { ...run, status: "running" as const };
  delete healed.endedAt;
  writeDetachedRun(healed, agentDir);
}

/**
 * A terminal record gets a resurrection probe only where the record can lie:
 * process runs (the container poisoned them; the pid probe is two cheap
 * syscalls, no exec). Systemd units reconcile themselves and probing every
 * historical record would cost one systemctl spawn each poll.
 */
function shouldProbeTerminal(run: DetachedRun): boolean {
  return run.runner === "process" && typeof run.pid === "number";
}

/**
 * A detached run is active while its host (wrapper pid or systemd unit) is
 * alive — the probe is the real liveness signal and beats a stale record.
 * enc-aca74f1f: the pre-enc-29d7943d build reconciled process runs to `lost`
 * (it probed a systemd unit that cannot exist in the api container) while
 * their wrappers kept working; those records are healed back to `running`.
 * A record that says running while its host is gone is reconciled to `lost`
 * so the sidebar never shows a zombie spinner.
 */
export async function isDetachedRunActive(sessionId: string, agentDir?: string): Promise<boolean> {
  const run = readDetachedRun(sessionId, agentDir);
  if (!run) return false;
  if (run.status !== "running" && !shouldProbeTerminal(run)) return false;
  if (!(await isRunHostAlive(run))) {
    if (readDetachedRun(sessionId, agentDir)?.status === "running") {
      writeDetachedRun({ ...run, status: "lost", endedAt: new Date().toISOString() }, agentDir);
    }
    return false;
  }
  if (run.status !== "running") markRunning(run, agentDir);
  return true;
}

/** Session ids with a live detached run, for /api/agent/running. */
export async function getActiveDetachedSessionIds(agentDir?: string): Promise<string[]> {
  const active: string[] = [];
  for (const run of listDetachedRuns(agentDir)) {
    if (run.status !== "running" && !shouldProbeTerminal(run)) continue;
    if (await isRunHostAlive(run)) {
      if (run.status !== "running") markRunning(run, agentDir);
      active.push(run.sessionId);
    } else if (run.status === "running") {
      writeDetachedRun({ ...run, status: "lost", endedAt: new Date().toISOString() }, agentDir);
    }
  }
  return active;
}

// ── spawning ────────────────────────────────────────────────────────────────

/** The inner scope script: run pi, then write the final record. */
export function buildWrapperScript(params: {
  piBin: string;
  sessionId: string;
  promptFile: string;
  logFile: string;
  recordFile: string;
  modelArgs: string[];
  nameArg: string[];
  /** Process runner (api container): forward SIGTERM/SIGINT to pi so aborts work. */
  processMode?: boolean;
}): string {
  const { piBin, sessionId, promptFile, logFile, recordFile, modelArgs, nameArg, processMode } = params;
  // Values are all machine-generated (uuid/abs paths), safe to inline.
  const args = [modelArgs, nameArg].flat().map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  return [
    "#!/bin/sh",
    "# pi-web detached session wrapper (enc-7c2d78ac)",
    `status=running`,
    `${piBin} --print --session-id '${sessionId}' ${args} < '${promptFile}' > '${logFile}' 2>&1 ${processMode ? "&\npid=$!\ntrap 'kill -TERM $pid 2>/dev/null' TERM INT\nwait $pid" : ""}`,
    `code=$?`,
    `if [ "$code" -eq 0 ]; then status=exited; else status=failed; fi`,
    `printf '{"sessionId":"${sessionId}","status":"%s","exitCode":%s,"endedAt":"%s"}\\n' "$status" "$code" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > '${recordFile}.final'`,
    `node -e 'const fs=require("fs");const a=JSON.parse(fs.readFileSync(process.argv[1]));Object.assign(a,JSON.parse(fs.readFileSync(process.argv[2])));fs.writeFileSync(process.argv[3],JSON.stringify(a,null,2))' '${recordFile}' '${recordFile}.final' '${recordFile}.merged'`,
    `mv '${recordFile}.merged' '${recordFile}'`,
    `rm -f '${recordFile}.final'`,
    `exit $code`,
  ].join("\n");
}

/**
 * Start a detached session. Returns as soon as systemd accepted the scope;
 * the pi process keeps running in it, decoupled from this server process.
 */
export async function startDetachedSession(
  start: DetachedRunStart,
  options: DetachedRunnerOptions = {},
): Promise<DetachedRun> {
  const opts = { ...DEFAULTS, ...options };
  const runnerMode = resolveRunnerMode();
  const sessionId = randomUUID();
  const unit = detachedUnitName(sessionId);
  const root = detachedRoot();
  const dirs = {
    runs: join(root, "runs"),
    prompts: join(root, "prompts"),
    wrappers: join(root, "wrappers"),
    logs: join(root, "logs"),
  };
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true });

  const promptFile = join(dirs.prompts, `${sessionId}.txt`);
  const logFile = join(dirs.logs, `${sessionId}.log`);
  const wrapperFile = join(dirs.wrappers, `${sessionId}.sh`);
  const recordFile = runPath(sessionId);

  writeFileSync(promptFile, start.message, { mode: 0o600 });

  const modelArgs: string[] = [];
  if (start.provider && start.modelId) {
    modelArgs.push("--provider", start.provider, "--model", start.modelId);
  }
  const nameArg: string[] = start.name ? ["--name", start.name] : [];

  const script = buildWrapperScript({
    piBin: opts.piBin,
    sessionId,
    promptFile,
    logFile,
    recordFile,
    modelArgs,
    nameArg,
    processMode: runnerMode === "process",
  });
  writeFileSync(wrapperFile, script, { mode: 0o700 });

  const initial: DetachedRun = {
    sessionId,
    unit,
    cwd: start.cwd,
    startedAt: new Date().toISOString(),
    status: "running",
    logPath: logFile,
    model: start.provider && start.modelId ? { provider: start.provider, modelId: start.modelId } : null,
    thinkingLevel: start.thinkingLevel ?? null,
    runner: runnerMode,
  };
  writeDetachedRun(initial);

  // ── process runner (api container, enc-29d7943d): no systemd --user inside
  // Docker. The wrapper is self-contained (writes its own final record), so a
  // detached, unref'd child with pid bookkeeping is the whole machinery.
  if (runnerMode === "process") {
    const child = spawn("/bin/sh", [wrapperFile], {
      cwd: start.cwd,
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, PI_PROFILE: "", PI_PROFILE_ISOLATE: "1" },
    });
    const pid = child.pid;
    child.unref();
    if (!pid) {
      writeDetachedRun({ ...initial, status: "failed", endedAt: new Date().toISOString() }, undefined);
      throw new Error("process runner: no pid");
    }
    writeDetachedRun({ ...initial, pid }, undefined);
    return { ...initial, pid };
  }

  const args = [
    "--user",
    "--scope",
    "--collect",
    `--unit=${unit}`,
    `--working-directory=${start.cwd}`,
    // A detached run is its own thing: never let a global profile (or a
    // routine's leftover .active) rename it or switch its model (enc-7c2d78ac §4).
    // --unsetenv is not portable across systemd-run versions; an empty value
    // disables the env switch and PI_PROFILE_ISOLATE blocks the .active path.
    "--setenv=PI_PROFILE=",
    "--setenv=PI_PROFILE_ISOLATE=1",
    "/bin/sh",
    wrapperFile,
  ];

  const child = spawn(opts.systemdRunBin, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

  // systemd-run --scope may return as soon as the scope is registered OR keep
  // waiting on the command. Never await its full exit: resolve as soon as the
  // unit is active (or exited cleanly for a very fast run). Only a nonzero
  // systemd-run exit (spawn/registration failure) is an error.
  const started = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false;
    const settle = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(failTimer);
      resolve(result);
    };
    const unitActiveLoop = () => {
      void isUnitActive(unit).then((active) => {
        if (settled) return;
        if (active) settle({ ok: true });
        else setTimeout(unitActiveLoop, 150);
      });
    };
    const failTimer = setTimeout(() => {
      // Neither the unit came up nor systemd-run failed within the window.
      settle({ ok: false, error: `scope did not become active: ${stderr.trim()}` });
    }, opts.spawnTimeoutMs);
    child.on("error", (error) => settle({ ok: false, error: error.message }));
    child.on("exit", (code) => {
      if (settled) return;
      if (code !== 0) {
        settle({ ok: false, error: `systemd-run exited ${code}: ${stderr.trim()}` });
        return;
      }
      // Exit 0 after "Running as unit": the scope was accepted. If the unit is
      // already gone the run finished in the meantime — the record tells us.
      setTimeout(() => {
        if (settled) return;
        const record = readDetachedRun(sessionId);
        if (record && record.status !== "running") settle({ ok: true });
        else settle({ ok: false, error: `scope accepted but not active: ${stderr.trim()}` });
      }, 300);
    });
    unitActiveLoop();
  });

  if (!started.ok) {
    writeDetachedRun({ ...initial, status: "failed", endedAt: new Date().toISOString() }, undefined);
    throw new Error(started.error ?? "systemd-run failed");
  }

  unitProbeCache.set(unit, { active: true, ts: Date.now() });
  return initial;
}

/**
 * Stop a detached run: SIGTERM the whole scope (pi disposes orderly and the
 * session file stays resumable). The wrapper still writes its final record.
 */
export async function abortDetachedRun(sessionId: string, agentDir?: string): Promise<boolean> {
  const run = readDetachedRun(sessionId, agentDir);
  if (!run || run.status !== "running") return false;
  if (run.runner === "process" && typeof run.pid === "number") {
    // Container runner: the wrapper traps TERM and forwards it to pi, which
    // disposes orderly and leaves a resumable session file.
    try {
      process.kill(run.pid, "SIGTERM");
    } catch {
      // already gone — the wrapper still wrote its final record
    }
    unitProbeCache.delete(`pid:${run.pid}`);
  } else {
    const { execFile } = await import("node:child_process");
    await new Promise<void>((resolve) => {
      execFile(DEFAULTS.systemctlBin, ["--user", "stop", run.unit], { timeout: 15_000 }, () => resolve());
    });
    unitProbeCache.delete(run.unit);
  }
  writeDetachedRun({ ...run, status: "aborted", endedAt: new Date().toISOString() }, agentDir);
  return true;
}

// ── SSE for a detached session ──────────────────────────────────────────────

/**
 * Minimal keep-alive stream while a detached run is active: the browser gets
 * `detached_running` once (the client ignores unknown event types and keeps
 * rendering from the file), the stream closes when the run settles so the
 * client reconnects to the normal wrapper stream.
 */
export function createDetachedEventStream(req: Request, sessionId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(payload)); } catch { closed = true; }
      };
      send(`data: ${JSON.stringify({ type: "detached_running", sessionId })}\n\n`);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };
      const timer = setInterval(() => {
        if (closed) return;
        void isDetachedRunActive(sessionId).then((active) => {
          if (!active) close();
          else send(": ping\n\n");
        });
      }, 5_000);
      req.signal.addEventListener("abort", close);
    },
  });
}
