/**
 * Server-only reader (and one guarded writer) for the EXOHUMAN private
 * routes on loopback. The reads are the same guarded GET projections the
 * EXOHUMAN Web uses (Host 127.0.0.1:5173, same-origin reads); the one write
 * is Rodrigo's explicit act of choosing a proposal option
 * (postExoProposalChoice), posted to EXO's own choices ledger. A short
 * in-memory cache keeps the panel light; the payload stays small (captured
 * metadata, not transcripts).
 */

import { Agent, fetch as undiciFetch } from "undici";
import { randomUUID } from "crypto";
import type { ExoData } from "./exo-types";
import { mergeExoData } from "./exo-merge";

const DEFAULT_BASE = "http://127.0.0.1:5173";
const CACHE_MS = 30_000;
const FETCH_TIMEOUT_MS = 8_000;

/** The ledgers the local read parses. The env overrides are the same ones the
 *  rg-proposal CLI honors, so tests can point both sides at a temp copy. */
function proposalsLedgerPath(): string {
  return process.env.RG_PROPOSALS_LEDGER ?? join(homedir(), ".local/state/proposals/ledger.json");
}
function encargosLedgerPath(): string {
  return process.env.RG_ENCARGOS_LEDGER ?? join(homedir(), ".local/state/encargos/ledger.json");
}

/** "mtimeMs:size" of one ledger file, or "missing" when it does not exist.
 *  Any external write (rg-proposal, rg-encargo, another session) moves it. */
function ledgerStamp(path: string): string {
  try {
    const stat = statSync(path);
    return `${Math.trunc(stat.mtimeMs)}:${stat.size}`;
  } catch {
    return "missing";
  }
}

/** Identity of the on-disk ledgers the cached snapshot was parsed from. */
function ledgersFingerprint(): string {
  return `${ledgerStamp(proposalsLedgerPath())}|${ledgerStamp(encargosLedgerPath())}`;
}

type Row = Record<string, unknown>;

interface CacheEntry {
  data: ExoData;
  readAt: number;
  ledgers: string;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<ExoData> | null = null;

/** Direct loopback connection: a proxied request would carry `X-Forwarded-*`
 *  headers and the EXOHUMAN origin guard rejects proxy traffic. */
const directAgent = new Agent();

function baseUrl(): string {
  const configured = process.env.EXO_PRIVATE_BASE;
  return configured && /^https?:\/\//.test(configured) ? configured.replace(/\/$/, "") : DEFAULT_BASE;
}

async function readPrivate(route: string): Promise<Row | null> {
  // undici's fetch with a direct agent: the EXOHUMAN origin guard rejects the
  // proxy-added headers, and the loopback read must stay header-identical to a
  // local browser session.
  const response = await undiciFetch(`${baseUrl()}${route}`, {
    method: "GET",
    dispatcher: directAgent,
    headers: {
      Accept: "application/json",
      Origin: baseUrl(),
      "Sec-Fetch-Site": "same-origin",
    },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  // 404 = the snapshot is not installed yet; that section simply stays empty.
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`EXO read ${route} failed: ${response.status}`);
  const body: unknown = await response.json();
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Row) : null;
}

import { readFileSync, existsSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { optionImagesFor } from "./exo-media";

interface LocalLedgerProposal {
  id: string;
  category?: string;
  title: string;
  summary?: string;
  options?: string[];
  option_images?: unknown;
  source?: string;
  status?: string;
  session_id?: string;
  links?: string[];
  resolution?: { choice?: string; resolved_at?: string } | string;
  discard?: { reason?: string; details?: string; discarded_at?: string } | null;
  created_at?: string;
  expires_at?: string | null;
}

function loadLocalActiveProposals(): ExoData["proposals"]["proposals"] {
  try {
    const ledgerPath = proposalsLedgerPath();
    if (!existsSync(ledgerPath)) return [];
    const raw = readFileSync(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    const map = (parsed.proposals ?? {}) as Record<string, LocalLedgerProposal>;
    const now = Date.now();
    const result: ExoData["proposals"]["proposals"] = [];

    for (const [id, item] of Object.entries(map)) {
      const isExpired = item.expires_at ? Number.isFinite(Date.parse(item.expires_at)) && now > Date.parse(item.expires_at) : false;
      const status = isExpired ? "expired" : (item.status ?? "pending");
      
      result.push({
        id,
        title: item.title,
        category: item.category ?? "general",
        summary: item.summary ?? "",
        question: item.title,
        createdAt: item.created_at,
        updatedAt: item.created_at,
        expiresAt: item.expires_at ?? null,
        source: item.source ?? undefined,
        sourceSessionId: item.session_id || (item.source && /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.test(item.source)
          ? item.source.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1]
          : undefined),
links: item.links ?? [],
        // `status` is the ledger's authority (what rg-proposal shows as ⏳/✔):
        // a reopened proposal can still carry its old `resolution`/`discard`,
        // and that leftover must never hide a pending decision from the
        // badge — the counters follow the status, not stale sub-fields.
        decisionState: status === "pending" ? "open" : status === "resolved" ? "accepted" : status === "discarded" ? "rejected" : status,
        attentionState: "fresh",
        selectedOption: status === "resolved" && item.resolution ? { optionId: "resolved", label: typeof item.resolution === "object" && item.resolution ? item.resolution.choice : "Resuelta" } : null,
        discard: status === "discarded" ? (item.discard && typeof item.discard === "object" ? { reason: item.discard.reason ?? "Descartada", details: item.discard.details, discardedAt: item.discard.discarded_at } : null) : null,        options: (() => {
          const labels = (item.options ?? ["Aceptar", "Descartar"]) as string[];
          const images = optionImagesFor(labels.length, item.option_images);
          return labels.map((opt, idx) => ({
            id: `opt-${idx}`,
            label: opt,
            ...(images[idx] ? { image: images[idx] } : {}),
          }));
        })(),
        evidence: [],
        preparations: [],
        responses: [],
        inputs: [],
        contextLinks: [],
        sourceTags: item.source ? [item.source] : [],
        sourceLabels: item.source ? [item.source] : [],
        routineIds: [],
        assessment: undefined,
        review: undefined,
      });
    }
    // Ordenar de más reciente a más antigua
    return result.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } catch {
    return [];
  }
}

interface LocalLedgerEncargo {
  titulo?: string;
  descripcion?: string;
  categoria?: string;
  status?: string;
  progreso?: number | string;
  dificultad?: string;
  estado_detalle?: string;
  session_id?: string;
  sessionId?: string;
  creado?: string;
  actualizado?: string;
  resuelto?: string;
  nota?: string;
}

function loadLocalEncargos(): NonNullable<ExoData["encargos"]> {
  try {
    const ledgerPath = encargosLedgerPath();
    if (!existsSync(ledgerPath)) return { total: 0, pendingCount: 0, encargos: [] };
    const raw = readFileSync(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    const map = (parsed.encargos ?? {}) as Record<string, LocalLedgerEncargo>;
    const list: NonNullable<ExoData["encargos"]>["encargos"] = [];
    let pendingCount = 0;

    for (const [id, it] of Object.entries(map)) {
      const status = it.status === "done" ? "done" : "pending";
      if (status === "pending") pendingCount++;
      list.push({
        id,
        titulo: it.titulo || (it.descripcion ? it.descripcion.slice(0, 59) + (it.descripcion.length > 59 ? "…" : "") : "") || "Sin título",
        descripcion: it.descripcion ?? "",
        categoria: it.categoria ?? "general",
        status,
        progreso: typeof it.progreso === "number" ? it.progreso : (status === "done" ? 100 : 20),
        dificultad: it.dificultad === "Baja" || it.dificultad === "Alta" || it.dificultad === "Compleja" ? it.dificultad : "Media",
        estado_detalle: it.estado_detalle || "",
        sessionId: it.session_id || it.sessionId || undefined,
        creado: it.creado,
        actualizado: it.actualizado,
        resuelto: it.resuelto,
        nota: it.nota,
      });
    }
    list.sort((a, b) => (b.creado ?? "").localeCompare(a.creado ?? ""));
    return {
      total: list.length,
      pendingCount,
      encargos: list,
    };
  } catch {
    return { total: 0, pendingCount: 0, encargos: [] };
  }
}

async function readExoData(): Promise<ExoData> {
  const localProposals = loadLocalActiveProposals();
  const localEncargos = loadLocalEncargos();
  if (localProposals.length > 0) {
    return {
      proposals: {
        source: "EXOHUMAN Proposals Ledger",
        snapshotId: "local-proposals-ledger",
        capturedAt: new Date().toISOString(),
        total: localProposals.length,
        proposals: localProposals,
      },
      tasks: {
        total: 0,
        tasks: [],
      },
      encargos: localEncargos,
    };
  }

  const [routines, sessions, cases, assessments, reviews] = await Promise.all([
    readPrivate("/private/dsh-routines"),
    readPrivate("/private/dsh-sessions"),
    readPrivate("/private/dsh-cases"),
    readPrivate("/private/shadow-assessments"),
    readPrivate("/private/proposal-reviews"),
  ]);
  const merged = mergeExoData(routines ?? {}, sessions ?? {}, cases ?? {}, assessments?.assessments ?? [], reviews?.reviews ?? []);
  merged.encargos = localEncargos;
  return merged;
}

/** The panel's data: one bounded read of the five private collections.
 *  The cache serves reads only while both on-disk ledgers are unchanged —
 *  any external write (the CLIs, another session) is picked up at once, not
 *  when the TTL happens to lapse — and never longer than CACHE_MS, which
 *  bounds the upstream snapshot path (no local proposals) instead. */
export async function getExoData(): Promise<ExoData> {
  const fingerprint = ledgersFingerprint();
  if (cache && Date.now() - cache.readAt < CACHE_MS && cache.ledgers === fingerprint) return cache.data;
  if (!inFlight) {
    inFlight = readExoData().finally(() => {
      inFlight = null;
    });
  }
  const data = await inFlight;
  cache = { data, readAt: Date.now(), ledgers: fingerprint };
  return data;
}

/** Drops the cached read so the next getExoData goes to the source. */
export function invalidateExoData(): void {
  cache = null;
}

/** Why a proposal choice could not be recorded, as the resolve route reports it. */
export type ProposalChoiceFailure =
  | { kind: "changed"; code: string }
  | { kind: "unavailable"; code: string }
  | { kind: "invalid"; code: string }
  | { kind: "error"; code: string; status: number };

export class ProposalChoiceError extends Error {
  constructor(readonly failure: ProposalChoiceFailure) {
    super(failure.code);
  }
}

/** A recorded choice, as EXO's receipt confirms it. */
export interface ProposalChoiceReceipt {
  requestId: string;
  caseId: string;
  optionId?: string;
  /** True when the same request had already been recorded (a retry). */
  replayed: boolean;
}

interface ChoiceCaseRow {
  id: string;
  currentRevisionId?: string;
  updatedAt?: string;
  options: { id: string }[];
}

function failureOf(status: number, code: string): ProposalChoiceFailure {
  if (status === 409) return { kind: "changed", code };
  if (status === 403 || status === 502 || status === 503 || status === 504) return { kind: "unavailable", code };
  if (status === 400 || status === 413 || status === 415) return { kind: "invalid", code };
  return { kind: "error", code, status };
}

/** The choice request's shape, exactly EXO's contract (contracts/proposal-choices.ts). */
export interface ProposalChoiceRequestInput {
  caseId: string;
  optionId: string;
  /** Optional 1-4000 char note; blank is omitted, never sent. */
  text?: string;
}

/** Builds the request EXO validates, from the fresh case row. */
export function buildProposalChoiceRequest(
  item: ChoiceCaseRow,
  snapshotId: string,
  input: ProposalChoiceRequestInput,
): Record<string, unknown> | null {
  if (!item.currentRevisionId || !item.updatedAt) return null;
  if (!item.options.some((option) => option.id === input.optionId)) return null;
  // Text is literal (EXO's contract); trim only validates it is not blank.
  const text = input.text && input.text.trim() ? input.text : undefined;
  return {
    requestId: randomUUID(),
    caseId: item.id,
    sourceSnapshotId: snapshotId,
    sourceRevisionId: item.currentRevisionId,
    sourceCaseUpdatedAt: item.updatedAt,
    optionId: input.optionId,
    ...(text ? { text } : {}),
  };
}

/**
 * Records Rodrigo's choice of one option of one proposal in EXO
 * (POST /private/proposal-choices): reads the case snapshot fresh — never
 * the panel's cache — so the request quotes the revision EXO holds now, and
 * a proposal that changed in between fails as "changed" instead of writing.
 * On success the panel's cache is dropped: the next read shows the receipt.
 */

export function resolveLocalProposal(proposalId: string, choiceText: string): boolean {
  try {
    const ledgerPath = proposalsLedgerPath();
    if (!existsSync(ledgerPath)) return false;
    const raw = readFileSync(ledgerPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.proposals || !parsed.proposals[proposalId]) return false;
    parsed.proposals[proposalId].status = "resolved";
    parsed.proposals[proposalId].resolution = {
      choice: choiceText,
      resolved_at: new Date().toISOString(),
    };
    writeFileSync(ledgerPath, JSON.stringify(parsed, null, 2), "utf8");
    invalidateExoData();
    return true;
  } catch {
    return false;
  }
}

export function discardLocalProposal(proposalId: string, reason: string, details?: string): boolean {
  try {
    const cmd = `rg-proposal discard ${JSON.stringify(proposalId)} --reason ${JSON.stringify(reason)} --details ${JSON.stringify(details || "")}`;
    execSync(cmd, { encoding: "utf8" });
    invalidateExoData();
    return true;
  } catch (e) {
    try {
      const ledgerPath = proposalsLedgerPath();
      if (!existsSync(ledgerPath)) return false;
      const raw = readFileSync(ledgerPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed.proposals || !parsed.proposals[proposalId]) return false;
      parsed.proposals[proposalId].status = "discarded";
      parsed.proposals[proposalId].discard = {
        reason,
        details: details || "",
        discarded_at: new Date().toISOString(),
      };
      writeFileSync(ledgerPath, JSON.stringify(parsed, null, 2), "utf8");
      invalidateExoData();
      return true;
    } catch {
      return false;
    }
  }
}

export function undoLocalProposal(proposalId: string): boolean {
  try {
    const cmd = `rg-proposal undo ${JSON.stringify(proposalId)}`;
    execSync(cmd, { encoding: "utf8" });
    invalidateExoData();
    return true;
  } catch (e) {
    try {
      const ledgerPath = proposalsLedgerPath();
      if (!existsSync(ledgerPath)) return false;
      const raw = readFileSync(ledgerPath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed.proposals || !parsed.proposals[proposalId]) return false;
      parsed.proposals[proposalId].status = "pending";
      parsed.proposals[proposalId].resolution = null;
      if ("discard" in parsed.proposals[proposalId]) {
        delete parsed.proposals[proposalId].discard;
      }
      writeFileSync(ledgerPath, JSON.stringify(parsed, null, 2), "utf8");
      invalidateExoData();
      return true;
    } catch {
      return false;
    }
  }
}

export async function postExoProposalChoice(input: ProposalChoiceRequestInput): Promise<ProposalChoiceReceipt> {
  const cases = await readPrivate("/private/dsh-cases");
  const snapshotId = typeof cases?.snapshotId === "string" ? cases.snapshotId : "";
  const rows = Array.isArray(cases?.cases) ? cases.cases : [];
  const row = rows.find((candidate) => (candidate as Row)?.id === input.caseId) as Row | undefined;
  if (!row) throw new ProposalChoiceError({ kind: "changed", code: "PROPOSAL_CHOICE_STALE" });
  const options = Array.isArray(row.options) ? row.options : [];
  const item: ChoiceCaseRow = {
    id: String(row.id ?? ""),
    currentRevisionId: typeof row.currentRevisionId === "string" ? row.currentRevisionId : undefined,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
    options: options.flatMap((option) => {
      const id = (option as Row)?.id;
      return typeof id === "string" ? [{ id }] : [];
    }),
  };
  const request = buildProposalChoiceRequest(item, snapshotId, input);
  if (!request) throw new ProposalChoiceError({ kind: "changed", code: "PROPOSAL_CHOICE_OPTION_UNAVAILABLE" });
  const response = await undiciFetch(`${baseUrl()}/private/proposal-choices`, {
    method: "POST",
    dispatcher: directAgent,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: baseUrl(),
      "Sec-Fetch-Site": "same-origin",
    },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === "object" && !Array.isArray(body)
      && (body as Row).error && typeof (body as Row).error === "object"
      && typeof ((body as Row).error as Row).code === "string"
      ? ((body as Row).error as Row).code as string
      : `EXO_CHOICE_HTTP_${response.status}`;
    throw new ProposalChoiceError(failureOf(response.status, code));
  }
  invalidateExoData();
  const choice = body && typeof body === "object" && !Array.isArray(body) ? (body as Row).choice : null;
  const receipt = choice && typeof choice === "object" && !Array.isArray(choice) ? choice as Row : {};
  return {
    requestId: typeof receipt.requestId === "string" ? receipt.requestId : String(request.requestId),
    caseId: input.caseId,
    optionId: typeof receipt.optionId === "string" ? receipt.optionId : input.optionId,
    replayed: Boolean((body as Row | null)?.replayed),
  };
}
