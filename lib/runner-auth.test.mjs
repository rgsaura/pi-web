import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidRunnerToken, isRunnerTokenConfigured } from "./runner-auth.ts";

test("runner token: valid only when it matches the configured secret", () => {
  assert.equal(isRunnerTokenConfigured(undefined), false);
  assert.equal(isValidRunnerToken("x", undefined), false);
  assert.equal(isValidRunnerToken(undefined, "secret"), false);
  assert.equal(isValidRunnerToken("wrong", "secret"), false);
  assert.equal(isValidRunnerToken("secret", "secret"), true);
});

test("runner token: length differences never throw (timing-safe compare)", () => {
  assert.equal(isValidRunnerToken("a-much-longer-guess", "s"), false);
  assert.equal(isValidRunnerToken("", "secret"), false);
});
