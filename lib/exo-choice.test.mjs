import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { buildProposalChoiceRequest } = await jiti.import("./exo-data.ts");

const item = () => ({
  id: "case-1",
  currentRevisionId: "rev-1",
  updatedAt: "2026-10-15T12:00:00.000Z",
  options: [{ id: "opt-a" }, { id: "opt-b" }],
});

test("builds the request quoting the fresh snapshot and revision", () => {
  const request = buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "opt-b" });
  assert.deepEqual(
    { ...request, requestId: "<uuid>" },
    {
      requestId: "<uuid>",
      caseId: "case-1",
      sourceSnapshotId: "snap-1",
      sourceRevisionId: "rev-1",
      sourceCaseUpdatedAt: "2026-10-15T12:00:00.000Z",
      optionId: "opt-b",
    },
  );
  assert.match(request.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  // No text key when none was given: EXO's schema omits, never sends blank.
  assert.ok(!("text" in request));
});

test("two requests get fresh request ids", () => {
  const a = buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "opt-a" });
  const b = buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "opt-a" });
  assert.notEqual(a.requestId, b.requestId);
});

test("a blank note is omitted; a real note is passed through", () => {
  const blank = buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "opt-a", text: "   " });
  assert.ok(!("text" in blank));
  const noted = buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "opt-a", text: " matiz" });
  assert.equal(noted.text, " matiz");
});

test("rejects an option the case no longer has, and a case without revision or date", () => {
  assert.equal(buildProposalChoiceRequest(item(), "snap-1", { caseId: "case-1", optionId: "gone" }), null);
  assert.equal(
    buildProposalChoiceRequest({ ...item(), currentRevisionId: undefined }, "snap-1", { caseId: "case-1", optionId: "opt-a" }),
    null,
  );
  assert.equal(
    buildProposalChoiceRequest({ ...item(), updatedAt: undefined }, "snap-1", { caseId: "case-1", optionId: "opt-a" }),
    null,
  );
});
