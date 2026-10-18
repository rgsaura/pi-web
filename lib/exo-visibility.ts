/**
 * Client-safe relevance rules for the decisiones inbox: what still needs
 * attention in the sidebar strip and in the panel's "Pendientes" filter.
 * Pure functions over the captured snapshot; the display never changes it.
 *
 * A proposal is relevant only when every rule holds:
 *   1. Its decision is not resolved: `rejected` and `responded` are hidden.
 *   2. It is not stale: when `updatedAt` parses and a reference instant is
 *      available (the snapshot's `capturedAt`, or now), the update must be
 *      younger than `maxAgeDays`. Older items are antigua and hidden.
 *   3. A missing or unparseable `updatedAt`/`createdAt` never hides an item:
 *      only rule 1 can.
 */

import type { ExoProposal } from "./exo-types";

const DAY_MS = 86_400_000;

/** Whether this proposal still needs attention at `referenceMs`. */
export function isRelevantProposal(proposal: ExoProposal, referenceMs?: number, maxAgeDays = 30): boolean {
  const state = proposal.decisionState;
  if (state === "rejected" || state === "responded" || state === "resolved" || state === "expired") return false;
  const updatedMs = proposal.updatedAt ? Date.parse(proposal.updatedAt) : Number.NaN;
  if (!Number.isFinite(updatedMs)) return true;
  const reference = referenceMs ?? Date.now();
  if (!Number.isFinite(reference)) return true;
  return reference - updatedMs < maxAgeDays * DAY_MS;
}

/**
 * The relevant proposals, most recently updated first. Undated items come
 * last and equal updates keep their input order.
 */
export function relevantProposals(proposals: ExoProposal[], referenceMs?: number, maxAgeDays = 30): ExoProposal[] {
  return proposals
    .map((proposal, index) => ({
      proposal,
      index,
      updatedMs: proposal.updatedAt ? Date.parse(proposal.updatedAt) : Number.NaN,
    }))
    .filter((entry) => isRelevantProposal(entry.proposal, referenceMs, maxAgeDays))
    .sort((a, b) => {
      const aDated = Number.isFinite(a.updatedMs);
      const bDated = Number.isFinite(b.updatedMs);
      if (aDated !== bDated) return aDated ? -1 : 1;
      if (aDated && a.updatedMs !== b.updatedMs) return b.updatedMs - a.updatedMs;
      return a.index - b.index;
    })
    .map((entry) => entry.proposal);
}
