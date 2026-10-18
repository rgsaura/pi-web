import { NextResponse } from "next/server";
import { postExoProposalChoice, resolveLocalProposal, discardLocalProposal, ProposalChoiceError } from "@/lib/exo-data";

export const dynamic = "force-dynamic";

/**
 * POST /api/exo/resolve — records Rodrigo's choice of one proposal option.
 * Tries local proposals ledger first (rg-proposal format); if not found,
 * tries upstream EXO / private routes.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { kind: "invalid", code: "EXO_RESOLVE_BAD_BODY" } }, { status: 400 });
  }
  const input = body !== null && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const proposalId = typeof input.proposalId === "string" ? input.proposalId : "";
  const optionId = typeof input.optionId === "string" ? input.optionId : "";
  const text = typeof input.text === "string" ? input.text : undefined;
  const action = typeof input.action === "string" ? input.action : "resolve";
  const reason = typeof input.reason === "string" ? input.reason : "irrelevant";
  const details = typeof input.details === "string" ? input.details : undefined;

  if (!proposalId) {
    return NextResponse.json({ ok: false, error: { kind: "invalid", code: "EXO_RESOLVE_MISSING_FIELDS" } }, { status: 400 });
  }

  // Handle discard action specifically
  if (action === "discard") {
    if (proposalId.startsWith("prop-")) {
      const success = discardLocalProposal(proposalId, reason, details);
      if (success) {
        return NextResponse.json({ ok: true, receipt: { requestId: proposalId, caseId: proposalId, action: "discard", reason, replayed: false } }, { headers: { "Cache-Control": "no-store" } });
      }
    }
  }

  if (!optionId && action !== "discard") {
    return NextResponse.json({ ok: false, error: { kind: "invalid", code: "EXO_RESOLVE_MISSING_FIELDS" } }, { status: 400 });
  }

  // Check if it's a local proposal in ~/.local/state/proposals/ledger.json
  if (proposalId.startsWith("prop-")) {
    const choiceValue = text && text.trim() ? `${optionId}: ${text.trim()}` : optionId;
    const success = resolveLocalProposal(proposalId, choiceValue);
    if (success) {
      return NextResponse.json({ ok: true, receipt: { requestId: proposalId, caseId: proposalId, optionId, text, replayed: false } }, { headers: { "Cache-Control": "no-store" } });
    }
  }

  try {
    const receipt = await postExoProposalChoice({ caseId: proposalId, optionId, text });
    return NextResponse.json({ ok: true, receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof ProposalChoiceError) {
      const status = cause.failure.kind === "changed" ? 409 : cause.failure.kind === "unavailable" ? 502 : 400;
      return NextResponse.json(
        { ok: false, error: cause.failure },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: { kind: "unavailable", code: "EXO_RESOLVE_UPSTREAM" } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
