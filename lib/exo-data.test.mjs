import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

// The ledgers are env-overridable (the same RG_PROPOSALS_LEDGER the CLI
// honors), so this test points the reader at a temp copy and proves the
// live-counter contract: a write from outside this process (mtime or size
// moves) invalidates the cached snapshot at once, without waiting for the
// 30 s TTL — while an unchanged ledger still serves the cached object.
const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});

const dir = mkdtempSync(join(tmpdir(), "exo-data-test-"));
const proposalsPath = join(dir, "proposals-ledger.json");
const encargosPath = join(dir, "encargos-ledger.json");

function writeLedger(path, body) {
  writeFileSync(path, JSON.stringify(body, null, 2), "utf8");
}

function proposalsLedger() {
  return {
    proposals: {
      "qa-1": {
        id: "qa-1",
        title: "Primera pendiente",
        summary: "s",
        status: "pending",
        created_at: "2026-10-05T10:00:00.000Z",
      },
      "qa-2": {
        id: "qa-2",
        title: "Segunda pendiente",
        summary: "s",
        status: "pending",
        created_at: "2026-10-05T11:00:00.000Z",
      },
      "qa-3": {
        id: "qa-3",
        title: "Ya resuelta",
        summary: "s",
        status: "resolved",
        created_at: "2026-10-04T10:00:00.000Z",
      },
      // A reopened decision keeps its old resolution: the ledger's status
      // (what the CLI shows) must win, not the stale sub-field.
      "qa-4": {
        id: "qa-4",
        title: "Reabierta con resolución vieja",
        summary: "s",
        status: "pending",
        resolution: { choice: "opt-1", resolved_at: "2026-10-01T10:00:00.000Z" },
        created_at: "2026-10-05T12:00:00.000Z",
      },
    },
  };
}

function encargosLedger() {
  return {
    encargos: {
      "enc-1": { titulo: "Uno", descripcion: "d", status: "pending", creado: "2026-10-05T10:00:00.000Z" },
      "enc-2": { titulo: "Dos", descripcion: "d", status: "pending", creado: "2026-10-05T09:00:00.000Z" },
      "enc-3": { titulo: "Tres", descripcion: "d", status: "done", creado: "2026-10-01T09:00:00.000Z" },
    },
  };
}

process.env.RG_PROPOSALS_LEDGER = proposalsPath;
process.env.RG_ENCARGOS_LEDGER = encargosPath;

test.after(() => {
  delete process.env.RG_PROPOSALS_LEDGER;
  delete process.env.RG_ENCARGOS_LEDGER;
  rmSync(dir, { recursive: true, force: true });
});

const { getExoData, invalidateExoData } = await jiti.import("./exo-data.ts");
const { relevantProposals } = await jiti.import("./exo-visibility.ts");

test("reads the ledgers: pending-first numbers from the real files", async () => {
  writeLedger(proposalsPath, proposalsLedger());
  writeLedger(encargosPath, encargosLedger());
  invalidateExoData();

  const data = await getExoData();
  assert.equal(data.proposals.proposals.length, 4);
  // The number the Decisiones badge shows: only the pending ones.
  assert.equal(relevantProposals(data.proposals.proposals, Date.parse(data.proposals.capturedAt)).length, 3);
  const reopened = data.proposals.proposals.find((p) => p.id === "qa-4");
  assert.equal(reopened.decisionState, "open");
  assert.equal(reopened.selectedOption, null, "a stale resolution never hides a reopened pending decision");
  assert.equal(data.encargos.pendingCount, 2);
  assert.equal(data.encargos.total, 3);
});

test("an external ledger write invalidates the cache at once, not on the TTL", async () => {
  writeLedger(proposalsPath, proposalsLedger());
  writeLedger(encargosPath, encargosLedger());
  invalidateExoData();
  const first = await getExoData();
  assert.equal(first.encargos.pendingCount, 2);

  // Another process resolves a decision and completes an encargo.
  const proposals = proposalsLedger();
  proposals.proposals["qa-1"].status = "resolved";
  proposals.proposals["qa-1"].resolution = { choice: "Sí", resolved_at: "2026-10-05T12:00:00.000Z" };
  writeLedger(proposalsPath, proposals);
  const encargos = encargosLedger();
  encargos.encargos["enc-2"].status = "done";
  encargos.encargos["enc-2"].resuelto = "2026-10-05T12:00:00.000Z";
  writeLedger(encargosPath, encargos);

  // Well inside the 30 s TTL the next read must reflect the files.
  const second = await getExoData();
  const pending = relevantProposals(second.proposals.proposals, Date.parse(second.proposals.capturedAt));
  assert.equal(pending.length, 2, "the resolved decision leaves the pending count");
  assert.ok(pending.every((p) => p.id !== "qa-1"));
  assert.equal(second.encargos.pendingCount, 1);
  assert.equal(second.encargos.total, 3);
});

test("an unchanged ledger still serves the cached snapshot", async () => {
  writeLedger(proposalsPath, proposalsLedger());
  writeLedger(encargosPath, encargosLedger());
  invalidateExoData();
  const first = await getExoData();
  const second = await getExoData();
  assert.equal(second, first, "no ledger change, no re-read");
});
