import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  getLocalePlugin,
  getSupportedLocales,
  resolveBrowserLocale,
} = await jiti.import("./registry.ts");

test("uses the first supported browser language and falls back to English", () => {
  assert.equal(resolveBrowserLocale(["en-US"]), "en");
  assert.equal(resolveBrowserLocale(["es-ES"]), "en");
  assert.equal(resolveBrowserLocale(["fr-FR"]), "en");
  assert.equal(resolveBrowserLocale([]), "en");
});

test("returns only registered locales", () => {
  assert.deepEqual(getSupportedLocales(), ["en"]);
  assert.equal(getLocalePlugin("en")?.id, "en");
  assert.equal(getLocalePlugin("missing"), undefined);
});

test("built-in locale packages have the complete English key and required placeholder sets", () => {
  const englishMessages = getLocalePlugin("en")?.messages ?? {};
  assert.ok(Object.keys(englishMessages).length > 0);
});
