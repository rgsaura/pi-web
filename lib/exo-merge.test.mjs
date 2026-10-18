import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { mergeExoData, mergeProposals, mergeTasks, sessionsForTask } = await jiti.import("./exo-merge.ts");

const ROUTINE_ID = "4e8bc37e-8d06-5d3c-b03a-aceda0f2b77f";

function fixture() {
  return {
    routinesSnapshot: {
      source: "DSH Task Board",
      snapshotId: "snap-1",
      sourceRevision: 42,
      capturedAt: "2026-10-05T12:00:00.000Z",
      timeZone: "Europe/Madrid",
      coverage: { total: 1, returned: 1, omitted: 0 },
      routines: [{
        id: ROUTINE_ID,
        title: "EXO · Comunicaciones — triaje",
        status: "todo",
        enabled: true,
        cron: "30 6 * * *",
        nextRunAt: "2026-10-06T04:30:00.000Z",
        lastTriggeredAt: "2026-10-05T04:30:21.224Z",
        lastExecution: {
          id: "exec-1",
          startedAt: "2026-10-05T12:54:06.522Z",
          endedAt: "2026-10-05T12:58:31.704Z",
          result: "succeeded",
        },
      }],
    },
    sessionsSnapshot: {
      sessions: [
        { id: "session-a", title: "EXO · Comunicaciones — triaje", updatedAt: "2026-10-05T06:03:08.699Z", status: "completed", workspace: "Vida" },
        { id: "session-b", title: "EXO · Comunicaciones — triaje", updatedAt: "2026-10-05T04:30:21.672Z", status: "completed", workspace: "Vida" },
        { id: "session-other", title: "Otra rutina", updatedAt: "2026-10-05T05:00:00.000Z", status: "empty" },
      ],
    },
    casesSnapshot: {
      source: "DSH Cases",
      snapshotId: "cases-1",
      sourceRevision: 7,
      capturedAt: "2026-10-05T12:00:00.000Z",
      totalProposals: 1,
      cases: [{
        id: "case-1",
        title: "Responder en familia",
        category: "Comunicaciones",
        question: "¿Qué responder?",
        updatedAt: "2026-10-05T07:43:40.219Z",
        createdAt: "2026-10-05T06:13:16.582Z",
        decisionState: "open",
        attentionState: "seen",
        executionState: "prepared",
        sourceLabels: [ROUTINE_ID, "no-es-rutina"],
        options: [{ id: "v1", label: "V1" }],
      }],
    },
    assessmentRows: [{ caseId: "case-1", action: "prepare", reason: "Falta contexto" }],
    reviewRows: [{ caseId: "case-1", correctedTitle: "Título corregido" }],
  };
}

test("a decisión keeps only the labels naming a known routine", () => {
  const { casesSnapshot, assessmentRows, reviewRows } = fixture();
  const [proposal] = mergeProposals(casesSnapshot.cases, assessmentRows, reviewRows, new Set([ROUTINE_ID]));
  assert.deepEqual(proposal.routineIds, [ROUTINE_ID]);
  assert.deepEqual(proposal.sourceLabels, [ROUTINE_ID, "no-es-rutina"]);
  assert.equal(proposal.assessment.reason, "Falta contexto");
  assert.equal(proposal.review.correctedTitle, "Título corregido");
});

test("sessions attach to their routine by title, most recent first", () => {
  const { routinesSnapshot, sessionsSnapshot, casesSnapshot, assessmentRows, reviewRows } = fixture();
  const proposals = mergeProposals(casesSnapshot.cases, assessmentRows, reviewRows, new Set([ROUTINE_ID]));
  const [task] = mergeTasks(routinesSnapshot.routines, sessionsSnapshot.sessions, proposals);
  assert.deepEqual(task.sessions.map((session) => session.id), ["session-a", "session-b"]);
  assert.deepEqual(task.proposalIds, ["case-1"]);
  assert.equal(task.lastExecution.result, "succeeded");
});

test("session caps keep the list bounded", () => {
  const sessions = Array.from({ length: 12 }, (_, index) => ({
    id: `session-${index}`,
    title: "t",
    updatedAt: `2026-10-0${(index % 9) + 1}T00:00:00.000Z`,
  }));
  assert.equal(sessionsForTask(sessions, "t").length, 8);
});

test("the merged data reports both sections' snapshot metadata", () => {
  const { routinesSnapshot, sessionsSnapshot, casesSnapshot, assessmentRows, reviewRows } = fixture();
  const data = mergeExoData(routinesSnapshot, sessionsSnapshot, casesSnapshot, assessmentRows, reviewRows);
  assert.equal(data.tasks.total, 1);
  assert.equal(data.tasks.timeZone, "Europe/Madrid");
  assert.equal(data.proposals.sourceRevision, 7);
  assert.equal(data.proposals.proposals.length, 1);
});

test("an empty upstream degrades to empty sections, not invented rows", () => {
  const data = mergeExoData({}, {}, {}, [], []);
  assert.deepEqual(data.proposals.proposals, []);
  assert.deepEqual(data.tasks.tasks, []);
  assert.equal(data.proposals.total, 0);
});
