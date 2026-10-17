import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  parseSystemctlState,
  parsePiSessions,
  parseHerdrAgents,
  parseTimers,
  microsToIso,
  formatCountdownEs,
} = await jiti.import("./activity-data.ts");

test("systemctl states map to the three dots", () => {
  assert.equal(parseSystemctlState("active\n"), "active");
  assert.equal(parseSystemctlState("inactive"), "inactive");
  assert.equal(parseSystemctlState("failed"), "failed");
  assert.equal(parseSystemctlState(""), "unknown");
  assert.equal(parseSystemctlState("activating"), "unknown");
});

test("pi sessions are read from ps aux lines with profile or session flags", () => {
  const ps = [
    "USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
    "rgsaura  12345 12.4  1.0 100000 20000 ?        Sl   10:00   0:10 pi --profile infra --session-id abc-def",
    "rgsaura  12346  0.5  1.0 100000 20000 ?        Sl   10:00   0:01 PI_PROFILE=scout pi --session xyz",
    "rgsaura  12347  3.0  1.0 100000 20000 ?        Sl   10:00   0:02 /usr/local/bin/pi --session-id qrs",
    "rgsaura  12348  3.0  1.0 100000 20000 ?        Sl   10:00   0:02 grep --profile artifact",
  ].join("\n");
  const rows = parsePiSessions(ps);
  assert.deepEqual(rows, [
    { pid: "12345", cpu: "12.4", profile: "infra", sessionId: "abc-def" },
    { pid: "12346", cpu: "0.5", profile: "scout", sessionId: "xyz" },
    { pid: "12347", cpu: "3.0", profile: "default", sessionId: "qrs" },
  ]);
});

test("herdr agents read name, status and cwd from the cli json", () => {
  const agents = parseHerdrAgents({
    id: "cli:agent:list",
    result: {
      agents: [
        { agent: "pi", agent_status: "working", cwd: "/home/rgsaura/workspaces/exohuman", terminal_title_stripped: "π - exohuman" },
        { agent: "pi", agent_status: "idle", cwd: "/home/rgsaura", terminal_title_stripped: "" },
      ],
    },
  });
  assert.deepEqual(agents, [
    { name: "π - exohuman", status: "working", cwd: "/home/rgsaura/workspaces/exohuman" },
    { name: "pi", status: "idle", cwd: "/home/rgsaura" },
  ]);
  assert.deepEqual(parseHerdrAgents(null), []);
  assert.deepEqual(parseHerdrAgents({ result: { agents: "nope" } }), []);
});

test("timers keep only rg-/rot- units, soonest first, with µs dates", () => {
  const soon = Date.UTC(2026, 9, 15, 14, 27, 51) * 1000;
  const later = Date.UTC(2026, 9, 15, 15, 0, 0) * 1000;
  const past = Date.UTC(2026, 9, 15, 13, 0, 0) * 1000;
  const timers = parseTimers([
    { unit: "rg-watch-wallapop.timer", activates: "rg-watch-wallapop.service", next: later, last: past },
    { unit: "systemd-tmpfiles-clean.timer", activates: "x.service", next: soon, last: past },
    { unit: "rot-assistant.timer", activates: "rot-assistant.service", next: soon, last: 0 },
    { unit: "rg-other.timer", activates: "rg-other.service", next: null, last: past },
  ]);
  assert.deepEqual(timers.map((timer) => timer.unit), ["rot-assistant.timer", "rg-watch-wallapop.timer", "rg-other.timer"]);
  assert.equal(timers[0].next, new Date(soon / 1000).toISOString());
  assert.equal(timers[0].last, null);
  assert.equal(microsToIso(0), null);
  assert.equal(microsToIso("nope"), null);
});

test("countdowns in spanish, future and past", () => {
  const now = Date.UTC(2026, 9, 15, 14, 0, 0);
  assert.equal(formatCountdownEs(new Date(now + 30_000).toISOString(), now), "en 30 s");
  assert.equal(formatCountdownEs(new Date(now + 3 * 60_000).toISOString(), now), "en 3 min");
  assert.equal(formatCountdownEs(new Date(now - 2 * 3600_000).toISOString(), now), "hace 2 h");
  assert.equal(formatCountdownEs(null, now), null);
});
