/**
 * Client-safe types for the EXOHUMAN observation data the Exo panel shows.
 *
 * The values come from the private snapshot routes of the local EXOHUMAN App
 * (DSH Task Board, decisiones, sesiones). They are read-only observations:
 * nothing here authorizes or performs personal effects.
 */

export interface ExoProposalOption {
  id: string;
  label: string;
  description?: string;
  reasoning?: string;
  kind?: string;
  /** Renderable image src (media route or https) for visual decisions. */
  image?: string;
  /** Same-origin /api/paneles src of the option's live preview panel
   *  (embedded comparative previews), when the ledger links one. */
  previewUrl?: string;
}

export interface ExoProposalEvidence {
  label: string;
  note?: string;
  observedAt?: string;
}

export interface ExoProposalPreparation {
  id: string;
  status?: string;
  createdAt?: string;
  /** Prepared private response, Markdown. Never sent anywhere by this panel. */
  text?: string;
}

export interface ExoProposalResponse {
  id: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  inputOrigin?: string;
  resultSummary?: string;
  resultText?: string;
  verification?: string;
  externalEffect?: boolean;
}

export interface ExoProposalInput {
  id: string;
  createdAt?: string;
  intent?: string;
  hasText?: boolean;
  hasAudio?: boolean;
  responseJobIds?: string[];
}

export interface ExoProposalAssessment {
  action?: string;
  when?: string;
  reason?: string;
  missingEvidence?: string;
  effect?: string;
}

export interface ExoProposalReview {
  reportedAt?: string;
  contextCorrection?: string;
  correctedTitle?: string;
  correctedQuestion?: string;
  optionsStatus?: string;
}

export interface ExoSelectedOption {
  optionId: string;
  label?: string;
  selectedAt?: string;
}

export interface ExoContextLink {
  label?: string;
  url?: string;
  note?: string;
}

export interface ExoProposal {
  id: string;
  title: string;
  category?: string;
  question?: string;
  summary?: string;
  context?: string;
  designNote?: string;
  responseMode?: string;
  createdAt?: string;
  updatedAt?: string;
  /** The case's revision this observation was captured from; a choice must quote it. */
  currentRevisionId?: string;
  attentionState?: string;
  decisionState?: string;
  executionState?: string;
  selectedOption?: ExoSelectedOption | null;
  expiresAt?: string | null;
  source?: string;
  sourceSessionId?: string;
  links?: string[];
  discard?: { reason: string; details?: string; discardedAt?: string } | null;
  options: ExoProposalOption[];
  evidence: ExoProposalEvidence[];
  preparations: ExoProposalPreparation[];
  responses: ExoProposalResponse[];
  inputs: ExoProposalInput[];
  contextLinks: ExoContextLink[];
  sourceTags: string[];
  /** Raw labels as captured; `routineIds` keeps the ones naming a known routine. */
  sourceLabels: string[];
  routineIds: string[];
  assessment?: ExoProposalAssessment | null;
  review?: ExoProposalReview | null;
}

export interface ExoSession {
  id: string;
  title: string;
  updatedAt?: string;
  status?: string;
  workspace?: string;
}

export interface ExoTaskExecution {
  id?: string;
  startedAt?: string;
  endedAt?: string;
  result?: string | null;
}

export interface ExoTask {
  id: string;
  title: string;
  status?: string;
  enabled: boolean;
  cron: string;
  nextRunAt?: string | null;
  lastTriggeredAt?: string | null;
  lastExecution?: ExoTaskExecution | null;
  /** Latest captured DSH sessions of this routine, most recent first. */
  sessions: ExoSession[];
  proposalIds: string[];
}

export interface ExoProposalsData {
  source?: string;
  snapshotId?: string;
  sourceRevision?: number;
  capturedAt?: string;
  total: number;
  proposals: ExoProposal[];
}

export interface ExoTasksData {
  source?: string;
  snapshotId?: string;
  capturedAt?: string;
  timeZone?: string;
  schedulerLastTickAt?: string;
  total: number;
  tasks: ExoTask[];
}

export interface ExoEncargo {
  id: string;
  titulo?: string;
  descripcion: string;
  categoria: string;
  status: "pending" | "done";
  progreso?: number;
  dificultad?: "Baja" | "Media" | "Alta" | "Compleja";
  estado_detalle?: string;
  sessionId?: string;
  creado?: string;
  actualizado?: string;
  resuelto?: string | null;
  nota?: string | null;
}

export interface ExoData {
  proposals: ExoProposalsData;
  tasks: ExoTasksData;
  encargos?: {
    total: number;
    pendingCount: number;
    encargos: ExoEncargo[];
  };
}
