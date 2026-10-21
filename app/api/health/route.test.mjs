import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() }, interopDefault: true, moduleCache: false,
});
const { GET } = await jiti.import("./route.ts");

test("GET /api/health returns ok with role and version", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.role, "string");
  assert.equal(typeof body.version, "string");
  assert.equal(typeof body.time, "string");
  assert.equal(res.headers.get("cache-control"), "no-store");
});
