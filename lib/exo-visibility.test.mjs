import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { isRelevantProposal, relevantProposals } = await jiti.import("./exo-visibility.ts");

const REFERENCE = Date.parse("2026-10-05T12:00:00.000Z");
const DAY_MS = 86_400_000;

function proposal(overrides = {}) {
  return {
    id: "p1",
    title: "Decisión",
    options: [],
    evidence: [],
    preparations: [],
    responses: [],
    inputs: [],
    contextLinks: [],
    sourceTags: [],
    sourceLabels: [],
    routineIds: [],
    ...overrides,
  };
}

test("open proposals stay relevant while recent; decided ones never", () => {
  assert.equal(isRelevantProposal(proposal({ decisionState: "open", updatedAt: "2026-10-05T10:00:00.000Z" }), REFERENCE), true);
  // `accepted` is the local ledger's resolved state (exo-data maps resolved → accepted).
  assert.equal(isRelevantProposal(proposal({ decisionState: "accepted", updatedAt: "2026-10-01T00:00:00.000Z" }), REFERENCE), false);
  assert.equal(isRelevantProposal(proposal({ decisionState: "open", discard: { reason: "no" }, updatedAt: "2026-10-05T10:00:00.000Z" }), REFERENCE), false);
  assert.equal(isRelevantProposal(proposal({ decisionState: "open", selectedOption: { optionId: "a" }, updatedAt: "2026-10-05T10:00:00.000Z" }), REFERENCE), false);
});

test("resolved decisions are never relevant", () => {
  assert.equal(isRelevantProposal(proposal({ decisionState: "rejected", updatedAt: "2026-10-05T10:00:00.000Z" }), REFERENCE), false);
  assert.equal(isRelevantProposal(proposal({ decisionState: "responded", updatedAt: "2026-10-05T10:00:00.000Z" }), REFERENCE), false);
});

test("updates older than maxAgeDays are antigua and hidden", () => {
  const stale = proposal({ decisionState: "open", updatedAt: "2026-08-01T00:00:00.000Z" });
  assert.equal(isRelevantProposal(stale, REFERENCE), false);
  assert.equal(isRelevantProposal(stale, REFERENCE, 90), true);
  const justInside = proposal({ decisionState: "open", updatedAt: new Date(REFERENCE - 29 * DAY_MS).toISOString() });
  assert.equal(isRelevantProposal(justInside, REFERENCE), true);
  const justOutside = proposal({ decisionState: "open", updatedAt: new Date(REFERENCE - 31 * DAY_MS).toISOString() });
  assert.equal(isRelevantProposal(justOutside, REFERENCE), false);
});

test("missing or unparseable dates never hide a proposal", () => {
  assert.equal(isRelevantProposal(proposal({ decisionState: "open" }), REFERENCE), true);
  assert.equal(isRelevantProposal(proposal({ decisionState: "open", updatedAt: "not a date" }), REFERENCE), true);
  assert.equal(isRelevantProposal(proposal({ decisionState: "open", createdAt: "not a date", updatedAt: "" }), REFERENCE), true);
});

test("relevantProposals filters and sorts by update, undated last", () => {
  const older = proposal({ id: "older", decisionState: "open", updatedAt: "2026-10-01T00:00:00.000Z" });
  const undatedA = proposal({ id: "undated-a", decisionState: "open" });
  const newer = proposal({ id: "newer", decisionState: "accepted", updatedAt: "2026-10-04T00:00:00.000Z" });
  const undatedB = proposal({ id: "undated-b", decisionState: "open", updatedAt: "not a date" });
  const rejected = proposal({ id: "rejected", decisionState: "rejected", updatedAt: "2026-10-05T00:00:00.000Z" });
  const stale = proposal({ id: "stale", decisionState: "open", updatedAt: "2026-01-01T00:00:00.000Z" });
  const tiedFirst = proposal({ id: "tied-first", decisionState: "open", updatedAt: "2026-10-02T00:00:00.000Z" });
  const tiedSecond = proposal({ id: "tied-second", decisionState: "open", updatedAt: "2026-10-02T00:00:00.000Z" });

  const visible = relevantProposals(
    [older, undatedA, newer, undatedB, rejected, stale, tiedFirst, tiedSecond],
    REFERENCE,
  );
  // `newer` is accepted (decided): hidden even though it is the most recent update.
  assert.deepEqual(
    visible.map((item) => item.id),
    ["tied-first", "tied-second", "older", "undated-a", "undated-b"],
  );
});
