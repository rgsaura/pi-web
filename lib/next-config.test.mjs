import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sizeLimitToBytes(value) {
  if (typeof value === "number") return value;
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i.exec(value.trim());
  assert.ok(match, `unparseable SizeLimit: ${value}`);
  const units = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * units[match[2].toLowerCase()];
}

test("scopes Next.js output file tracing to the pi-web package (widened only for a shared node_modules)", async () => {
  const config = await createJiti(import.meta.url).import("../next.config.ts", { default: true });
  const root = config.outputFileTracingRoot;

  // rg-worktree worktrees symlink the base tree's node_modules (routing.json
  // shareNodeModules); next.config.ts then widens the root to the common
  // ancestor so Turbopack resolves the shared modules (enc-a81dfe71).
  let shared = null;
  try { shared = fs.realpathSync(path.join(projectRoot, "node_modules")); } catch { /* none */ }
  const sharedOutside = shared !== null
    && shared !== projectRoot
    && !shared.startsWith(projectRoot + path.sep);

  if (sharedOutside) {
    assert.notEqual(root, projectRoot, "root widened for the shared node_modules");
    assert.ok(projectRoot.startsWith(root + path.sep), "root still contains the project");
    assert.ok(shared.startsWith(root + path.sep), "root covers the shared node_modules");
  } else {
    assert.equal(root, projectRoot);
  }
});

test("raises the proxy body buffer above the upload route's 100 MB request cap", async () => {
  const config = await createJiti(import.meta.url).import("../next.config.ts", { default: true });

  assert.ok(sizeLimitToBytes(config.experimental.proxyClientMaxBodySize) > 100 * 1024 * 1024);
});
