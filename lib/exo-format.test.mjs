import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  decisionStateLabel,
  executionResultLabel,
  formatCronEs,
  formatDurationEs,
  formatElapsedEs,
  sessionStatusLabel,
} = await jiti.import("./exo-format.ts");

test("cron expressions get a short Spanish reading", () => {
  assert.equal(formatCronEs("30 6 * * *"), "Todos los días a las 06:30");
  assert.equal(formatCronEs("0 4 * * 1"), "Los lunes a las 04:00");
  assert.equal(formatCronEs("15 5 * * 1,3"), "Los lunes y miércoles a las 05:15");
  assert.equal(formatCronEs("*/15 * * * *"), "Cada 15 minutos");
  assert.equal(formatCronEs("7 * * * *"), "Cada hora a las :07");
  assert.equal(formatCronEs("0 9 5 * *"), "El día 5 de cada mes a las 09:00");
  assert.equal(formatCronEs("0 9 5 11 *"), "El 5 de noviembre a las 09:00");
});

test("unusual expressions keep the literal source value", () => {
  assert.equal(formatCronEs("not a cron"), "not a cron");
  assert.equal(formatCronEs("0 9 * * MON-FRI"), "0 9 * * MON-FRI");
});

test("durations read in minutes and hours", () => {
  assert.equal(formatDurationEs("2026-10-05T12:00:00Z", "2026-10-05T12:04:30Z"), "5 min");
  assert.equal(formatDurationEs("2026-10-05T12:00:00Z", "2026-10-05T13:23:00Z"), "1 h 23 min");
  assert.equal(formatDurationEs("2026-10-05T12:00:00Z", "2026-10-05T12:00:20Z"), "< 1 min");
  assert.equal(formatDurationEs(undefined, "2026-10-05T12:00:20Z"), "—");
});

test("elapsed spans read as the time an item stays in progress", () => {
  assert.equal(formatElapsedEs("2026-10-05T12:00:00Z", "2026-10-05T12:00:20Z"), "< 1 min");
  assert.equal(formatElapsedEs("2026-10-05T12:00:00Z", "2026-10-05T12:20:00Z"), "20 min");
  assert.equal(formatElapsedEs("2026-10-05T12:00:00Z", "2026-10-05T17:00:00Z"), "5 h");
  assert.equal(formatElapsedEs("2026-10-05T12:00:00Z", "2026-10-05T17:20:00Z"), "5 h 20 min");
  assert.equal(formatElapsedEs("2026-10-03T12:00:00Z", "2026-10-05T12:00:00Z"), "2 d");
  assert.equal(formatElapsedEs("2026-10-03T12:00:00Z", "2026-10-05T16:00:00Z"), "2 d 4 h");
  assert.equal(formatElapsedEs(undefined, "2026-10-05T12:00:20Z"), "—");
  assert.equal(formatElapsedEs("2026-10-05T12:00:00Z", "2026-10-04T12:00:00Z"), "—");
});

test("observed states have Spanish labels and unknown ones pass through", () => {
  assert.equal(decisionStateLabel("open"), "Por decidir");
  assert.equal(decisionStateLabel("responded"), "Respondida");
  assert.equal(decisionStateLabel("custom"), "custom");
  assert.equal(executionResultLabel(null), "Sin resultado");
  assert.equal(executionResultLabel("succeeded"), "Correcta");
  assert.equal(sessionStatusLabel("empty"), "Vacía");
});
