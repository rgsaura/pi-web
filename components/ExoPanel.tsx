"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useExoData } from "@/hooks/useExoData";
import { useIsMobile } from "@/hooks/useIsMobile";
import { focusModalPanel, listenForPanelEscape } from "@/lib/stacked-dialog";
import {
  attentionStateLabel,
  decisionStateColor,
  decisionStateLabel,
  executionResultColor,
  executionResultLabel,
  executionStateLabel,
  formatCronEs,
  formatDateTimeEs,
  formatDurationEs,
  formatElapsedEs,
  formatRelativeEs,
  routineStatusLabel,
  sessionStatusLabel,
} from "@/lib/exo-format";
import type { ExoProposal, ExoTask } from "@/lib/exo-types";
import { isRelevantProposal } from "@/lib/exo-visibility";
import { MarkdownBody } from "./MarkdownBody";

/**
 * Exo — the useful slice of the DSH Web UI kept inside Pi Web: one split view
 * where the decisiones inbox and the scheduled tasks sit side by side (stacked
 * on mobile), both visible at once. Every element carries its full decision
 * context up front — title, context, states, time in progress and its action
 * options — and one click selects it and opens its complete record. Read-only
 * observation of the local EXOHUMAN snapshots: choosing an option records the
 * local pick and shows the prepared draft, it never sends or executes anything.
 */

type Layout = "encargos" | "proposals" | "both" | "tasks";

const DECISION_FILTERS = ["pending", "all", "open", "accepted", "responded", "rejected"] as const;

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function Badge({ label, color, title }: { label: string; color?: string; title?: string }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        color: color ?? "var(--text-muted)",
        fontSize: 11,
        lineHeight: "16px",
      }}
    >
      {label}
    </span>
  );
}

function StateDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }}
    />
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="exo-subheading">{children}</h3>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.7 }}>
      <span style={{ color: "var(--text-dim)", flexShrink: 0, minWidth: 128 }}>{label}</span>
      <span style={{ color: "var(--text)", overflowWrap: "anywhere" }}>{value}</span>
    </div>
  );
}

/** Letter index of an action option, "A", "B", … as the decision inbox reads them. */
function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

/** Moves card-header focus inside a pane; the pane is a `data-exo-pane` region. */
function focusSiblingCard(event: React.KeyboardEvent<HTMLButtonElement>) {
  const key = event.key;
  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
  const pane = event.currentTarget.closest("[data-exo-pane]");
  if (!pane) return;
  const headers = Array.from(pane.querySelectorAll<HTMLButtonElement>("[data-exo-card]"));
  const index = headers.indexOf(event.currentTarget);
  if (index < 0) return;
  const target =
    key === "ArrowDown" ? headers[Math.min(headers.length - 1, index + 1)]
      : key === "ArrowUp" ? headers[Math.max(0, index - 1)]
        : key === "Home" ? headers[0]
          : headers[headers.length - 1];
  if (target && target !== event.currentTarget) {
    event.preventDefault();
    target.focus();
  }
}

// — Local option pick (browser-only; the same storage key the Decisiones view uses) —

function choiceStorageKey(proposalId: string): string {
  return `pi-web:exo-proposal-choice:${proposalId}`;
}

function loadLocalOption(proposalId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(choiceStorageKey(proposalId));
    if (raw) {
      const parsed = JSON.parse(raw) as { selectedOptionId?: string | null };
      return parsed.selectedOptionId ?? null;
    }
  } catch {
    // fallback
  }
  return null;
}

function saveLocalOption(proposalId: string, optionId: string | null) {
  try {
    const raw = window.sessionStorage.getItem(choiceStorageKey(proposalId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.sessionStorage.setItem(
      choiceStorageKey(proposalId),
      JSON.stringify({ ...parsed, selectedOptionId: optionId }),
    );
  } catch {
    // fallback
  }
}

// — Complete records (the expanded depth of each element) —

function ProposalRecord({ proposal }: { proposal: ExoProposal }) {
  return (
    <div>
      {proposal.context && (
        <>
          <SectionHeading>Contexto completo</SectionHeading>
          <div className="exo-markdown" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text)" }}>
            <MarkdownBody>{proposal.context}</MarkdownBody>
          </div>
        </>
      )}

      {proposal.selectedOption && (
        <>
          <SectionHeading>Decisión registrada</SectionHeading>
          <Field label="Opción elegida" value={proposal.selectedOption.label ?? proposal.selectedOption.optionId} />
          {proposal.selectedOption.selectedAt && (
            <Field
              label="Elegida"
              value={`${formatRelativeEs(proposal.selectedOption.selectedAt)} · ${formatDateTimeEs(proposal.selectedOption.selectedAt)}`}
            />
          )}
        </>
      )}

      {proposal.preparations.filter((prep) => prep.text).length > 0 && (
        <>
          <SectionHeading>Borradores preparados (privados, no enviados)</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {proposal.preparations.filter((prep) => prep.text).map((prep) => (
              <div key={prep.id} style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-panel)" }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                  {prep.status ? `${prep.status} · ` : ""}{prep.createdAt ? formatDateTimeEs(prep.createdAt) : ""}
                </div>
                <div className="exo-markdown" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text)" }}>
                  <MarkdownBody>{prep.text ?? ""}</MarkdownBody>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {proposal.responses.length > 0 && (
        <>
          <SectionHeading>Respuestas registradas</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {proposal.responses.map((response) => (
              <div key={response.id} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-panel)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                  {response.status && <Badge label={response.status} />}
                  {response.verification && <Badge label={`verificación: ${response.verification}`} />}
                  <Badge label={response.externalEffect ? "efecto externo: sí" : "efecto externo: no"} />
                  {response.createdAt && <Badge label={formatDateTimeEs(response.createdAt)} />}
                </div>
                {(response.resultSummary || response.resultText) && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {response.resultSummary || response.resultText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {proposal.assessment && (
        <>
          <SectionHeading>Evaluación asistida</SectionHeading>
          {proposal.assessment.action && <Field label="Acción" value={proposal.assessment.action} />}
          {proposal.assessment.when && <Field label="Cuándo" value={proposal.assessment.when} />}
          {proposal.assessment.reason && <Field label="Motivo" value={proposal.assessment.reason} />}
          {proposal.assessment.missingEvidence && <Field label="Evidencia que falta" value={proposal.assessment.missingEvidence} />}
          {proposal.assessment.effect && <Field label="Efecto" value={proposal.assessment.effect} />}
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            Revisión asistida de la captura; no acredita verificación independiente.
          </div>
        </>
      )}

      {proposal.review && (
        <>
          <SectionHeading>Corrección de contexto</SectionHeading>
          {proposal.review.correctedTitle && <Field label="Título corregido" value={proposal.review.correctedTitle} />}
          {proposal.review.correctedQuestion && <Field label="Pregunta corregida" value={proposal.review.correctedQuestion} />}
          {proposal.review.optionsStatus && <Field label="Opciones" value={proposal.review.optionsStatus} />}
          {proposal.review.contextCorrection && (
            <div className="exo-markdown" style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text)", marginTop: 4 }}>
              <MarkdownBody>{proposal.review.contextCorrection}</MarkdownBody>
            </div>
          )}
        </>
      )}

      {proposal.evidence.length > 0 && (
        <>
          <SectionHeading>Evidencia</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {proposal.evidence.map((item, index) => (
              <div key={`${item.label}-${index}`} style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                <div style={{ color: "var(--text)", overflowWrap: "anywhere" }}>
                  {item.label}
                  {item.observedAt && (
                    <span style={{ color: "var(--text-dim)", marginLeft: 8, fontSize: 11 }}>
                      {formatDateTimeEs(item.observedAt)}
                    </span>
                  )}
                </div>
                {item.note && <div style={{ color: "var(--text-muted)", overflowWrap: "anywhere" }}>{item.note}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {proposal.sourceTags.length > 0 && (
        <>
          <SectionHeading>Origen</SectionHeading>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {proposal.sourceTags.map((tag) => <Badge key={tag} label={tag} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TaskRecord({ task, timeZone }: { task: ExoTask; timeZone?: string }) {
  return (
    <div>
      <SectionHeading>Programación</SectionHeading>
      <Field label="Expresión cron" value={<code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{task.cron}</code>} />
      <Field label="Lectura" value={formatCronEs(task.cron)} />
      {timeZone && <Field label="Zona horaria" value={timeZone} />}
      <Field
        label="Próxima ejecución"
        value={task.nextRunAt ? `${formatRelativeEs(task.nextRunAt)} · ${formatDateTimeEs(task.nextRunAt, timeZone)}` : "—"}
      />
      <Field
        label="Última activación"
        value={task.lastTriggeredAt ? `${formatRelativeEs(task.lastTriggeredAt)} · ${formatDateTimeEs(task.lastTriggeredAt, timeZone)}` : "—"}
      />

      <SectionHeading>Última ejecución</SectionHeading>
      {task.lastExecution ? (
        <>
          <Field
            label="Resultado"
            value={<span style={{ color: executionResultColor(task.lastExecution.result) }}>{executionResultLabel(task.lastExecution.result)}</span>}
          />
          <Field label="Inicio" value={formatDateTimeEs(task.lastExecution.startedAt, timeZone)} />
          <Field label="Fin" value={task.lastExecution.endedAt ? formatDateTimeEs(task.lastExecution.endedAt, timeZone) : "—"} />
          <Field label="Duración" value={formatDurationEs(task.lastExecution.startedAt, task.lastExecution.endedAt)} />
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Sin ejecución registrada en la captura.</div>
      )}

      <SectionHeading>Últimas sesiones ({task.sessions.length})</SectionHeading>
      {task.sessions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {task.sessions.map((session) => (
            <div
              key={session.id}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-panel)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--text)" }}>
                {formatRelativeEs(session.updatedAt)} · {formatDateTimeEs(session.updatedAt, timeZone)}
              </span>
              <Badge label={sessionStatusLabel(session.status)} />
              {session.workspace && <Badge label={session.workspace} />}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-dim)" }}>
                {session.id}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Sin sesiones capturadas con este título. La captura sólo enlaza sesión y rutina por el título.
        </div>
      )}
    </div>
  );
}

// — Element cards: complete information, one click to select and open —

function ProposalCard({
  proposal,
  tasks,
  referenceMs,
  referenceIso,
  expanded,
  optionId,
  onToggle,
  onSelectOption,
  onOpenTask,
  registerRef,
}: {
  proposal: ExoProposal;
  tasks: ExoTask[];
  referenceMs?: number;
  referenceIso?: string;
  expanded: boolean;
  optionId: string | null;
  onToggle: () => void;
  onSelectOption: (optionId: string | null) => void;
  onOpenTask: (taskId: string) => void;
  registerRef: (key: string, el: HTMLElement | null) => void;
}) {
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const registeredOptionId = proposal.selectedOption?.optionId ?? null;
  const chosenOptionId = optionId ?? registeredOptionId;
  const resolvedAt = proposal.selectedOption?.selectedAt
    ?? (proposal.decisionState && proposal.decisionState !== "open" ? proposal.updatedAt : undefined);
  const spanLabel = !proposal.createdAt
    ? resolvedAt ? "Resuelta" : "En curso"
    : resolvedAt
      ? `Resuelta en ${formatElapsedEs(proposal.createdAt, resolvedAt)}`
      : `En curso hace ${formatElapsedEs(proposal.createdAt, referenceIso)}`;

  return (
    <article
      ref={(el) => registerRef(`proposal:${proposal.id}`, el)}
      className={expanded ? "exo-card is-open" : "exo-card"}
    >
      <button
        type="button"
        data-exo-card
        aria-expanded={expanded}
        className="exo-card-head"
        onClick={onToggle}
        onKeyDown={focusSiblingCard}
      >
        <span style={{ display: "flex", gap: 8 }}>
          <StateDot color={decisionStateColor(proposal.decisionState)} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 600, overflowWrap: "anywhere" }}>
            {proposal.title}
          </span>
        </span>

        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 16 }}>
          {proposal.category && <Badge label={proposal.category} />}
          <Badge label={`Decisión: ${decisionStateLabel(proposal.decisionState)}`} color={decisionStateColor(proposal.decisionState)} />
          <Badge label={`Atención: ${attentionStateLabel(proposal.attentionState)}`} />
          <Badge label={`Ejecución: ${executionStateLabel(proposal.executionState)}`} />
        </span>

        {(proposal.question || proposal.summary) && (
          <span style={{ display: "block", marginTop: 8, marginLeft: 16 }}>
            <span className="exo-subheading" style={{ display: "block" }}>Contexto</span>
            {proposal.question && (
              <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", fontWeight: 500, overflowWrap: "anywhere" }}>
                {proposal.question}
              </span>
            )}
            {proposal.summary && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12.5, lineHeight: 1.65, color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                {proposal.summary}
              </span>
            )}
          </span>
        )}

        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10, marginLeft: 16, fontSize: 11, color: "var(--text-dim)" }}>
          <ClockIcon />
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{spanLabel}</span>
          {proposal.updatedAt && <span>· act. {formatRelativeEs(proposal.updatedAt, referenceMs)}</span>}
          {proposal.createdAt && <span>· creada {formatDateTimeEs(proposal.createdAt)}</span>}
          <span style={{ marginLeft: "auto", color: expanded ? "var(--accent)" : "var(--text-dim)", fontWeight: 500 }}>
            {expanded ? "▴ Ocultar el registro" : "▾ Ver el registro"}
          </span>
        </span>
      </button>

      <div style={{ padding: "0 14px 14px" }}>
        {proposal.options.length > 0 ? (
          <div style={{ marginLeft: 16 }}>
            <div className="exo-subheading">Opciones de acción ({proposal.options.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {proposal.options.map((option, index) => {
                const chosen = chosenOptionId === option.id;
                const registered = registeredOptionId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={chosen}
                    className={chosen ? "exo-option is-chosen" : "exo-option"}
                    onClick={() => onSelectOption(chosen ? null : option.id)}
                  >
                    <span className="exo-option-letter" aria-hidden="true">{optionLetter(index)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.55, fontWeight: 600, overflowWrap: "anywhere" }}>
                        {option.label || option.id}
                      </span>
                      {option.description && (
                        <span style={{ display: "block", marginTop: 2, fontSize: 12, lineHeight: 1.6, color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {option.description}
                        </span>
                      )}
                      {chosen && (
                        <span style={{ display: "block", marginTop: 3, fontSize: 11, color: "var(--accent)" }}>
                          ✓ {registered ? "elección registrada" : "tu elección (local, no enviada)"}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="exo-note">Elegir sólo guarda tu selección en este navegador: nada se envía ni se ejecuta.</div>
          </div>
        ) : (
          <div className="exo-note" style={{ marginLeft: 16 }}>Sin opciones de acción registradas en la captura.</div>
        )}

        {proposal.routineIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, marginLeft: 16 }}>
            {proposal.routineIds.map((routineId) => {
              const task = taskById.get(routineId);
              return (
                <button
                  key={routineId}
                  type="button"
                  className="exo-chip"
                  onClick={() => onOpenTask(routineId)}
                  title={task ? `Ver la tarea programada «${task.title}»` : routineId}
                >
                  ↗ Tarea: {task ? task.title : routineId}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ margin: "0 14px 14px", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <ProposalRecord proposal={proposal} />
        </div>
      )}
    </article>
  );
}

function TaskCard({
  task,
  proposals,
  timeZone,
  referenceMs,
  referenceIso,
  expanded,
  onToggle,
  onOpenProposal,
  registerRef,
}: {
  task: ExoTask;
  proposals: ExoProposal[];
  timeZone?: string;
  referenceMs?: number;
  referenceIso?: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenProposal: (proposalId: string) => void;
  registerRef: (key: string, el: HTMLElement | null) => void;
}) {
  const proposalById = useMemo(() => new Map(proposals.map((proposal) => [proposal.id, proposal])), [proposals]);
  const execution = task.lastExecution ?? null;
  const running = Boolean(execution?.startedAt && !execution?.endedAt);
  const timeParts: string[] = [];
  if (running && execution?.startedAt) timeParts.push(`En curso hace ${formatElapsedEs(execution.startedAt, referenceIso)}`);
  if (task.nextRunAt) timeParts.push(`próxima ${formatRelativeEs(task.nextRunAt, referenceMs)}`);
  if (execution?.startedAt && !running) {
    timeParts.push(`última ${formatRelativeEs(execution.startedAt, referenceMs)} · ${formatDurationEs(execution.startedAt, execution.endedAt)}`);
  }

  return (
    <article
      ref={(el) => registerRef(`task:${task.id}`, el)}
      className={expanded ? "exo-card is-open" : "exo-card"}
    >
      <button
        type="button"
        data-exo-card
        aria-expanded={expanded}
        className="exo-card-head"
        onClick={onToggle}
        onKeyDown={focusSiblingCard}
      >
        <span style={{ display: "flex", gap: 8 }}>
          <StateDot color={task.enabled ? (execution?.result === "failed" ? "#dc2626" : "#16a34a") : "var(--text-dim)"} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, fontWeight: 600, overflowWrap: "anywhere" }}>
            {task.title}
          </span>
        </span>

        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginLeft: 16 }}>
          <Badge label={`Estado: ${routineStatusLabel(task.status)}`} />
          <Badge label={task.enabled ? "Habilitada" : "Pausada"} color={task.enabled ? "#16a34a" : "var(--text-dim)"} />
          {execution?.result && (
            <Badge label={`Última: ${executionResultLabel(execution.result)}`} color={executionResultColor(execution.result)} />
          )}
        </span>

        <span style={{ display: "block", marginTop: 8, marginLeft: 16 }}>
          <span className="exo-subheading" style={{ display: "block" }}>Contexto</span>
          <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.65, color: "var(--text)", overflowWrap: "anywhere" }}>
            {formatCronEs(task.cron)}
          </span>
        </span>

        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 10, marginLeft: 16, fontSize: 11, color: "var(--text-dim)" }}>
          <ClockIcon />
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
            {timeParts.length > 0 ? timeParts.join(" · ") : "Sin ejecuciones ni próximas fechas"}
          </span>
          <span style={{ marginLeft: "auto", color: expanded ? "var(--accent)" : "var(--text-dim)", fontWeight: 500 }}>
            {expanded ? "▴ Ocultar el registro" : "▾ Ver el registro"}
          </span>
        </span>
      </button>

      <div style={{ padding: "0 14px 14px", marginLeft: 16 }}>
        <div className="exo-subheading">Opciones de acción</div>
        {task.proposalIds.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {task.proposalIds.map((id) => {
              const proposal = proposalById.get(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="exo-chip"
                  style={{ width: "100%" }}
                  onClick={() => onOpenProposal(id)}
                >
                  <StateDot color={decisionStateColor(proposal?.decisionState)} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                    ↗ Decisión: {proposal ? proposal.title : id}
                  </span>
                  <span style={{ color: "var(--text-dim)", flexShrink: 0 }}>
                    {decisionStateLabel(proposal?.decisionState)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="exo-note" style={{ marginTop: 0 }}>
            Sin decisiones vinculadas. La tarea se observa en sólo lectura.
          </div>
        )}
      </div>

      {expanded && (
        <div style={{ margin: "0 14px 14px", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <TaskRecord task={task} timeZone={timeZone} />
        </div>
      )}
    </article>
  );
}

// — Panes and the split layout —

function ExoPane({
  label,
  header,
  children,
  bordered,
  isMobile,
}: {
  label: string;
  header: React.ReactNode;
  children: React.ReactNode;
  bordered: boolean;
  isMobile: boolean;
}) {
  return (
    <section
      data-exo-pane
      aria-label={label}
      style={{
        flex: "1 1 50%",
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderLeft: bordered && !isMobile ? "1px solid var(--border)" : undefined,
        borderTop: bordered && isMobile ? "1px solid var(--border)" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-panel)",
          flexShrink: 0,
        }}
      >
        {header}
      </div>
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

export function ExoPanel({ onClose, initialProposalId }: { onClose: () => void; initialProposalId?: string | null }) {
  const { data, loading, error, refresh } = useExoData();
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<Layout>("both");
  const [query, setQuery] = useState("");
  const [taskQuery, setTaskQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<(typeof DECISION_FILTERS)[number]>("pending");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [openProposalId, setOpenProposalId] = useState<string | null>(initialProposalId ?? null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [localChoices, setLocalChoices] = useState<Record<string, string | null>>({});
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const registerCardRef = useCallback((key: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(key, el);
    else cardRefs.current.delete(key);
  }, []);

  useEffect(() => listenForPanelEscape(document, onClose), [onClose]);
  useLayoutEffect(() => focusModalPanel(document, dialogRef.current, {
    restoreTextEntry: !window.matchMedia?.("(pointer: coarse)").matches,
  }), []);

  const proposals = useMemo(() => data?.proposals.proposals ?? [], [data]);
  const tasks = useMemo(() => data?.tasks.tasks ?? [], [data]);
  const timeZone = data?.tasks.timeZone;
  // The snapshot's capture time is the reference for elapsed spans and for the
  // "Pendientes" filter, the same one the sidebar strip uses: old snapshots do
  // not look stale.
  const referenceMs = useMemo(() => {
    const capturedAt = data?.proposals.capturedAt;
    if (!capturedAt) return undefined;
    const parsed = Date.parse(capturedAt);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, [data]);
  const referenceIso = useMemo(
    () => (referenceMs === undefined ? undefined : new Date(referenceMs).toISOString()),
    [referenceMs],
  );

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const proposal of proposals) if (proposal.category) names.add(proposal.category);
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return proposals.filter((proposal) => {
      if (decisionFilter === "pending") return isRelevantProposal(proposal, referenceMs, 30);
      if (decisionFilter !== "all" && proposal.decisionState !== decisionFilter) return false;
      if (categoryFilter !== "all" && proposal.category !== categoryFilter) return false;
      if (!needle) return true;
      return [proposal.title, proposal.question, proposal.summary, proposal.category]
        .some((value) => (value ?? "").toLowerCase().includes(needle));
    });
  }, [proposals, query, decisionFilter, categoryFilter, referenceMs]);

  const filteredTasks = useMemo(() => {
    const needle = taskQuery.trim().toLowerCase();
    if (!needle) return tasks;
    return tasks.filter((task) => task.title.toLowerCase().includes(needle));
  }, [tasks, taskQuery]);

  const openCount = useMemo(
    () => proposals.filter((proposal) => proposal.decisionState === "open").length,
    [proposals],
  );
  const failedTasks = tasks.filter((task) => task.lastExecution?.result === "failed" || task.status === "failed").length;
  const sessionCount = tasks.reduce((count, task) => count + task.sessions.length, 0);

  /** Selects and opens one element, scrolling its card into view. */
  const openProposal = useCallback((id: string) => {
    setLayout("both");
    setQuery("");
    setCategoryFilter("all");
    setDecisionFilter("all");
    setOpenProposalId(id);
  }, []);

  const openTask = useCallback((id: string) => {
    setLayout("both");
    setTaskQuery("");
    setOpenTaskId(id);
  }, []);

  // The sidebar strip (or AppShell's Exo button) points the panel at one
  // proposal while it is open.
  useEffect(() => {
    if (initialProposalId == null) return;
    setLayout("both");
    setOpenProposalId(initialProposalId);
  }, [initialProposalId]);

  useEffect(() => {
    if (!openProposalId) return;
    cardRefs.current.get(`proposal:${openProposalId}`)?.scrollIntoView({ block: "nearest" });
  }, [openProposalId, layout]);
  useEffect(() => {
    if (!openTaskId) return;
    cardRefs.current.get(`task:${openTaskId}`)?.scrollIntoView({ block: "nearest" });
  }, [openTaskId, layout]);

  const toggleProposal = useCallback((id: string) => {
    setOpenProposalId((current) => (current === id ? null : id));
  }, []);

  const toggleTask = useCallback((id: string) => {
    setOpenTaskId((current) => (current === id ? null : id));
  }, []);

  const selectOption = useCallback((proposalId: string, optionId: string | null) => {
    saveLocalOption(proposalId, optionId);
    setLocalChoices((current) => ({ ...current, [proposalId]: optionId }));
    // Picking an option opens the record so the prepared draft is right there.
    setOpenProposalId(proposalId);
  }, []);

  const localOptionFor = useCallback((proposal: ExoProposal): string | null => {
    const local = localChoices[proposal.id];
    if (local !== undefined) return local;
    return loadLocalOption(proposal.id);
  }, [localChoices]);

  const proposalHeader = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Decisiones</h3>
        <span className="exo-pill">{proposals.length} · {openCount} abiertas</span>
        {filteredProposals.length !== proposals.length && (
          <span className="exo-pill">{filteredProposals.length} con este filtro</span>
        )}
      </div>
      <input
        type="search"
        value={query}
        maxLength={200}
        placeholder="Buscar decisiones…"
        aria-label="Buscar decisiones"
        onChange={(event) => setQuery(event.target.value)}
        style={{
          width: "100%", padding: "6px 10px", borderRadius: 6,
          border: "1px solid var(--border)", background: "var(--bg)",
          color: "var(--text)", fontSize: 12.5,
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select
          aria-label="Filtrar por decisión"
          value={decisionFilter}
          onChange={(event) => setDecisionFilter(event.target.value as (typeof DECISION_FILTERS)[number])}
          style={{ flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
        >
          {DECISION_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "all" ? "Todas las decisiones" : value === "pending" ? "Pendientes" : decisionStateLabel(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por categoría"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          style={{ flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}
        >
          <option value="all">Todas las categorías</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </div>
    </>
  );

  const taskHeader = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Tareas programadas</h3>
        <span className="exo-pill">{tasks.length} rutinas · {sessionCount} sesiones</span>
        {failedTasks > 0 && <span className="exo-pill exo-pill-alert">{failedTasks} con fallo</span>}
        {filteredTasks.length !== tasks.length && (
          <span className="exo-pill">{filteredTasks.length} con este filtro</span>
        )}
      </div>
      <input
        type="search"
        value={taskQuery}
        maxLength={200}
        placeholder="Buscar tareas…"
        aria-label="Buscar tareas"
        onChange={(event) => setTaskQuery(event.target.value)}
        style={{
          width: "100%", padding: "6px 10px", borderRadius: 6,
          border: "1px solid var(--border)", background: "var(--bg)",
          color: "var(--text)", fontSize: 12.5,
        }}
      />
    </>
  );

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Exo · Decisiones y tareas"
      tabIndex={-1}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="settings-dialog-backdrop"
    >
      <div className="settings-dialog-surface">
        <div className="settings-dialog-header" style={{ flexWrap: "wrap", rowGap: 4 }}>
          <strong className="settings-dialog-title">Exohuman UI · Centro de Control</strong>
          <nav
            aria-label="Distribución de la vista"
            className="exo-layout-tabs"
            style={{
              marginLeft: isMobile ? 0 : 18,
              marginTop: isMobile ? 4 : 0,
              width: isMobile ? "100%" : undefined,
              justifyContent: isMobile ? "space-between" : undefined,
            }}
          >
            <button
              type="button"
              className="exo-layout-tab"
              style={{ flex: isMobile ? 1 : undefined }}
              aria-current={layout === "encargos" ? "page" : undefined}
              onClick={() => setLayout("encargos")}
            >
              <span>Encargos{isMobile ? "" : ` (${data?.encargos?.pendingCount ?? 0})`}</span>
            </button>
            <button
              type="button"
              className="exo-layout-tab"
              style={{ flex: isMobile ? 1 : undefined }}
              aria-current={layout === "proposals" ? "page" : undefined}
              onClick={() => setLayout("proposals")}
            >
              <span>Decisiones{isMobile ? "" : ` (${proposals.length})`}</span>
            </button>
            <button
              type="button"
              className="exo-layout-tab"
              style={{ flex: isMobile ? 1 : undefined }}
              aria-current={layout === "both" ? "page" : undefined}
              onClick={() => setLayout("both")}
            >
              <span>Ambas</span>
            </button>
            <button
              type="button"
              className="exo-layout-tab"
              style={{ flex: isMobile ? 1 : undefined }}
              aria-current={layout === "tasks" ? "page" : undefined}
              onClick={() => setLayout("tasks")}
            >
              <span>Rutinas{isMobile ? "" : ` (${tasks.length})`}</span>
            </button>
          </nav>
          <span
            title={data ? `Captura ${data.proposals.snapshotId ?? ""} · rev ${data.proposals.sourceRevision ?? "—"}` : undefined}
            style={{
              marginLeft: "auto",
              marginRight: 10,
              fontSize: 11,
              color: "var(--text-dim)",
              whiteSpace: "nowrap",
              display: isMobile ? "none" : undefined,
            }}
          >
            {data?.proposals.capturedAt
              ? `Captura ${formatRelativeEs(data.proposals.capturedAt)}`
              : loading ? "Leyendo…" : ""}
          </span>
          <button
            type="button"
            onClick={refresh}
            title="Volver a leer la captura instalada"
            aria-label="Actualizar"
            className="config-close-button"
            style={{ right: 52 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
            </svg>
          </button>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar" className="config-close-button settings-dialog-close">×</button>
        </div>

        <main className="settings-dialog-main">
          {error ? (
            <div role="alert" style={{ margin: "auto", padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              <div style={{ color: "var(--text)", marginBottom: 8 }}>No se pueden leer las capturas de EXOHUMAN.</div>
              <div style={{ marginBottom: 14 }}>{error}</div>
              <button type="button" onClick={refresh} className="config-button config-button-small config-button-secondary">
                Reintentar
              </button>
            </div>
          ) : loading && !data ? (
            <div role="status" style={{ margin: "auto", padding: 24, color: "var(--text-muted)", fontSize: 13 }}>
              Leyendo las capturas de EXOHUMAN…
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", width: "100%", height: "100%", minHeight: 0 }}>
              {layout === "encargos" && (
                <ExoPane
                  label="Encargos y Tareas de Rodrigo"
                  header={
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "4px 0" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {data?.encargos?.pendingCount ?? 0} pendientes · {data?.encargos?.total ?? 0} registrados
                      </span>
                      <button
                        type="button"
                        onClick={refresh}
                        className="config-button config-button-small config-button-secondary"
                        style={{ fontSize: 11 }}
                      >
                        Actualizar
                      </button>
                    </div>
                  }
                  bordered={false}
                  isMobile={isMobile}
                >
                  {(!data?.encargos || data.encargos.encargos.length === 0) && (
                    <div style={{ padding: 18, fontSize: 12, color: "var(--text-dim)" }}>
                      No hay encargos registrados en el sistema.
                    </div>
                  )}
                  {data?.encargos?.encargos.map((enc) => {
                    const isPending = enc.status === "pending";
                    const progress = typeof enc.progreso === "number" ? enc.progreso : (isPending ? 25 : 100);
                    return (
                      <article
                        key={enc.id}
                        className="exo-card"
                        style={{
                          marginBottom: 10,
                          padding: "14px 16px",
                          borderRadius: 10,
                          border: `1px solid ${isPending ? "var(--border)" : "var(--border)"}`,
                          background: isPending ? "var(--bg-panel)" : "var(--bg-card)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 11 }}>
                          <Badge
                            label={isPending ? "EN CURSO" : "COMPLETADO"}
                            color={isPending ? "#eab308" : "#22c55e"}
                          />
                          <Badge label={enc.categoria.toUpperCase()} />
                          <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontWeight: 600 }}>
                            {enc.dificultad || "Media"}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "monospace" }}>{enc.id}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)" }}>
                            {(enc.creado ?? "").slice(0, 16).replace("T", " ")}
                          </span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, marginBottom: 8 }}>
                          {enc.titulo || enc.descripcion?.slice(0, 60)}
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-muted)", marginBottom: 4 }}>
                            <span>{enc.estado_detalle || (isPending ? "Investigando..." : "Completado")}</span>
                            <span style={{ fontWeight: 700, color: isPending ? "var(--accent)" : "#22c55e" }}>{progress}%</span>
                          </div>
                          <div style={{ height: 4, width: "100%", background: "rgba(255, 255, 255, 0.06)", borderRadius: 999, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                width: `${progress}%`,
                                background: isPending ? "var(--accent)" : "#22c55e",
                                borderRadius: 999,
                              }}
                            />
                          </div>
                        </div>
                        {enc.nota && (
                          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, borderLeft: "2px solid #22c55e", paddingLeft: 8 }}>
                            {enc.nota}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </ExoPane>
              )}

              {layout !== "tasks" && layout !== "encargos" && (
                <ExoPane label="Decisiones" header={proposalHeader} bordered={layout === "both"} isMobile={isMobile}>
                  {filteredProposals.length === 0 && (
                    <div style={{ padding: 18, fontSize: 12, color: "var(--text-dim)" }}>
                      Ninguna decisión con este filtro. Prueba «Todas las decisiones».
                    </div>
                  )}
                  {filteredProposals.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      tasks={tasks}
                      referenceMs={referenceMs}
                      referenceIso={referenceIso}
                      expanded={openProposalId === proposal.id}
                      optionId={localOptionFor(proposal)}
                      onToggle={() => toggleProposal(proposal.id)}
                      onSelectOption={(optionId) => selectOption(proposal.id, optionId)}
                      onOpenTask={openTask}
                      registerRef={registerCardRef}
                    />
                  ))}
                </ExoPane>
              )}

              {layout !== "proposals" && layout !== "encargos" && (
                <ExoPane label="Tareas programadas" header={taskHeader} bordered={layout === "both"} isMobile={isMobile}>
                  {filteredTasks.length === 0 && (
                    <div style={{ padding: 18, fontSize: 12, color: "var(--text-dim)" }}>
                      No hay rutinas con este filtro.
                    </div>
                  )}
                  {filteredTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      proposals={proposals}
                      timeZone={timeZone}
                      referenceMs={referenceMs}
                      referenceIso={referenceIso}
                      expanded={openTaskId === task.id}
                      onToggle={() => toggleTask(task.id)}
                      onOpenProposal={openProposal}
                      registerRef={registerCardRef}
                    />
                  ))}
                </ExoPane>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
