import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

// Loaded through jiti so the module's own extensionless imports resolve the way
// the app resolves them (tsconfig moduleResolution: "bundler").
async function loadSubject() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import("./allowed-roots.ts");
}

test("resolveRemoteRoot expands ~ and ~/ against the home dir", async () => {
  const { resolveRemoteRoot } = await loadSubject();
  const home = path.join(path.sep, "home", "user");

  assert.equal(resolveRemoteRoot(undefined, home, "/fallback"), "/fallback");
  assert.equal(resolveRemoteRoot("", home, "/fallback"), "/fallback");
  assert.equal(resolveRemoteRoot("   ", home, "/fallback"), "/fallback");
  assert.equal(resolveRemoteRoot("~", home, "/fallback"), home);
  assert.equal(resolveRemoteRoot("~/remote", home, "/fallback"), path.join(home, "remote"));
  assert.equal(resolveRemoteRoot("  ~/x/y  ", home, "/fallback"), path.join(home, "x", "y"));
});

test("resolveRemoteRoot keeps absolute paths and refuses relative ones", async () => {
  const { resolveRemoteRoot } = await loadSubject();
  const home = path.join(path.sep, "home", "user");

  assert.equal(resolveRemoteRoot("/srv/remote", home, "/fallback"), "/srv/remote");
  assert.equal(resolveRemoteRoot("/srv/remote/", home, "/fallback"), "/srv/remote/");
  // A relative root would shift with the process cwd: fall back instead.
  assert.equal(resolveRemoteRoot("remote", home, "/fallback"), "/fallback");
  assert.equal(resolveRemoteRoot("./remote", home, "/fallback"), "/fallback");
});
