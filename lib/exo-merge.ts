/**
 * Pure assembly of the Exo panel's models from the captured DSH observations.
 * The merge is tolerant and read-only: a field missing in the source becomes
 * absent here, never invented. Session titles name the routine that produced
 * them (the task board's title), and a decisión carries its routine in
 * `sourceLabels`; those are the only links the snapshots record.
 */

import type {
  ExoData,
  ExoProposal,
  ExoProposalAssessment,
  ExoProposalOption,
  ExoProposalResponse,
  ExoProposalReview,
  ExoSession,
  ExoTask,
} from "./exo-types";

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow).filter((row): row is Row => row !== null) : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeOption(row: Row): ExoProposalOption {
  return {
    id: str(row.id) ?? "",
    label: str(row.label) ?? "",
    description: str(row.description),
    kind: str(row.kind),
  };
}

function normalizeResponse(row: Row): ExoProposalResponse {
  return {
    id: str(row.id) ?? "",
    status: str(row.status),
    createdAt: str(row.createdAt),
    updatedAt: str(row.updatedAt),
    inputOrigin: str(row.inputOrigin),
    resultSummary: str(row.resultSummary),
    resultText: str(row.resultText),
    verification: str(row.verification),
    externalEffect: typeof row.externalEffect === "boolean" ? row.externalEffect : undefined,
  };
}

function normalizeAssessment(row: Row | null): ExoProposalAssessment | null {
  if (!row) return null;
  return {
    action: str(row.action),
    when: str(row.when),
    reason: str(row.reason),
    missingEvidence: str(row.missingEvidence),
    effect: str(row.effect),
  };
}

function normalizeReview(row: Row | null): ExoProposalReview | null {
  if (!row) return null;
  return {
    reportedAt: str(row.reportedAt),
    contextCorrection: str(row.contextCorrection),
    correctedTitle: str(row.correctedTitle),
    correctedQuestion: str(row.correctedQuestion),
    optionsStatus: str(row.optionsStatus),
  };
}

/** One decisión, with its assessment and context review attached by case id. */
export function mergeProposal(
  raw: Row,
  assessments: Map<string, Row>,
  reviews: Map<string, Row>,
  routineIds: Set<string>,
): ExoProposal {
  const id = str(raw.id) ?? "";
  const labels = strList(raw.sourceLabels);
  return {
    id,
    title: str(raw.title) ?? id,
    category: str(raw.category),
    question: str(raw.question),
    summary: str(raw.summary),
    context: str(raw.context),
    designNote: str(raw.designNote),
    responseMode: str(raw.responseMode),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    currentRevisionId: str(raw.currentRevisionId),
    attentionState: str(raw.attentionState),
    decisionState: str(raw.decisionState),
    executionState: str(raw.executionState),
    selectedOption: asRow(raw.selectedOption)
      ? {
          optionId: str(asRow(raw.selectedOption)!.optionId) ?? "",
          label: str(asRow(raw.selectedOption)!.label),
          selectedAt: str(asRow(raw.selectedOption)!.selectedAt),
        }
      : null,
    options: asRows(raw.options).map(normalizeOption),
    evidence: asRows(raw.evidence).map((row) => ({
      label: str(row.label) ?? "",
      note: str(row.note),
      observedAt: str(row.observedAt),
    })),
    preparations: asRows(raw.preparations).map((row) => ({
      id: str(row.id) ?? "",
      status: str(row.status),
      createdAt: str(row.createdAt),
      text: str(row.text),
    })),
    responses: asRows(raw.responses).map(normalizeResponse),
    inputs: asRows(raw.inputs).map((row) => ({
      id: str(row.id) ?? "",
      createdAt: str(row.createdAt),
      intent: str(row.intent),
      hasText: typeof row.hasText === "boolean" ? row.hasText : undefined,
      hasAudio: typeof row.hasAudio === "boolean" ? row.hasAudio : undefined,
      responseJobIds: strList(row.responseJobIds),
    })),
    contextLinks: asRows(raw.contextLinks).map((row) => ({
      label: str(row.label),
      url: str(row.url),
      note: str(row.note),
    })),
    sourceTags: strList(raw.sourceTags),
    sourceLabels: labels,
    routineIds: labels.filter((label) => routineIds.has(label)),
    assessment: normalizeAssessment(assessments.get(id) ?? null),
    review: normalizeReview(reviews.get(id) ?? null),
  };
}

export function mergeProposals(
  cases: unknown,
  assessmentRows: unknown,
  reviewRows: unknown,
  routineIds: Set<string> = new Set(),
): ExoProposal[] {
  const assessments = new Map<string, Row>();
  for (const row of asRows(assessmentRows)) {
    const id = str(row.caseId);
    if (id) assessments.set(id, row);
  }
  const reviews = new Map<string, Row>();
  for (const row of asRows(reviewRows)) {
    const id = str(row.caseId);
    if (id) reviews.set(id, row);
  }
  const proposals = asRows(cases).map((row) => mergeProposal(row, assessments, reviews, routineIds));
  proposals.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return proposals;
}

export function normalizeSession(row: Row): ExoSession {
  return {
    id: str(row.id) ?? "",
    title: str(row.title) ?? "",
    updatedAt: str(row.updatedAt),
    status: str(row.status),
    workspace: str(row.workspace),
  };
}

/** Most recent sessions of one routine: the snapshots only link them by title. */
export function sessionsForTask(sessions: ExoSession[], title: string, limit = 8): ExoSession[] {
  return sessions
    .filter((session) => session.title === title)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);
}

export function mergeTasks(routines: unknown, sessionRows: unknown, proposals: ExoProposal[] = []): ExoTask[] {
  const sessions = asRows(sessionRows).map(normalizeSession).filter((session) => session.id);
  const proposalsByRoutine = new Map<string, string[]>();
  for (const proposal of proposals) {
    for (const routineId of proposal.routineIds) {
      const list = proposalsByRoutine.get(routineId) ?? [];
      list.push(proposal.id);
      proposalsByRoutine.set(routineId, list);
    }
  }
  const tasks = asRows(routines).map((row) => {
    const id = str(row.id) ?? "";
    const title = str(row.title) ?? id;
    const execution = asRow(row.lastExecution);
    return {
      id,
      title,
      status: str(row.status),
      enabled: bool(row.enabled, true),
      cron: str(row.cron) ?? "",
      nextRunAt: str(row.nextRunAt) ?? null,
      lastTriggeredAt: str(row.lastTriggeredAt) ?? null,
      lastExecution: execution
        ? {
            id: str(execution.id),
            startedAt: str(execution.startedAt),
            endedAt: str(execution.endedAt),
            result: str(execution.result) ?? null,
          }
        : null,
      sessions: sessionsForTask(sessions, title),
      proposalIds: proposalsByRoutine.get(id) ?? [],
    };
  });
  tasks.sort((a, b) => a.title.localeCompare(b.title, "es"));
  return tasks;
}

/** The two sections' data as the panel consumes it. */
export function mergeExoData(
  routinesSnapshot: Row,
  sessionsSnapshot: Row,
  casesSnapshot: Row,
  assessmentRows: unknown,
  reviewRows: unknown,
): ExoData {
  const routineRows = asRows(routinesSnapshot.routines);
  const routineIds = new Set(routineRows.map((row) => str(row.id)).filter((id): id is string => Boolean(id)));
  const proposals = mergeProposals(casesSnapshot.cases, assessmentRows, reviewRows, routineIds);
  return {
    proposals: {
      source: str(casesSnapshot.source),
      snapshotId: str(casesSnapshot.snapshotId),
      sourceRevision: typeof casesSnapshot.sourceRevision === "number" ? casesSnapshot.sourceRevision : undefined,
      capturedAt: str(casesSnapshot.capturedAt),
      total: typeof casesSnapshot.totalProposals === "number" ? casesSnapshot.totalProposals : proposals.length,
      proposals,
    },
    tasks: {
      source: str(routinesSnapshot.source),
      snapshotId: str(routinesSnapshot.snapshotId),
      capturedAt: str(routinesSnapshot.capturedAt),
      timeZone: str(routinesSnapshot.timeZone),
      schedulerLastTickAt: str(routinesSnapshot.schedulerLastTickAt),
      total: routinesSnapshot.coverage && asRow(routinesSnapshot.coverage) && typeof asRow(routinesSnapshot.coverage)!.total === "number"
        ? asRow(routinesSnapshot.coverage)!.total as number
        : routineRows.length,
      tasks: mergeTasks(routineRows, sessionsSnapshot.sessions, proposals),
    },
  };
}
