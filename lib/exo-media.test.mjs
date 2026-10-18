import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { resolveOptionImageSrc, optionImagesFor, isAllowedOptionImageName } = await jiti.import("./exo-media.ts");

test("media entries resolve to the exo media route", () => {
  assert.equal(resolveOptionImageSrc("media/prop-abcd1234-opt0-9f2c1e.png"), "/api/exo/media/prop-abcd1234-opt0-9f2c1e.png");
  assert.equal(resolveOptionImageSrc("media/Mock.Up-2.jpeg"), "/api/exo/media/Mock.Up-2.jpeg");
});

test("http(s) and data URIs pass through untouched", () => {
  assert.equal(resolveOptionImageSrc("https://ejemplo.com/preview.png"), "https://ejemplo.com/preview.png");
  assert.equal(
    resolveOptionImageSrc("data:image/png;base64,iVBORw0KGgoAAAANS"),
    "data:image/png;base64,iVBORw0KGgoAAAANS",
  );
});

test("dangerous or malformed entries are rejected", () => {
  assert.equal(resolveOptionImageSrc("media/../ledger.json"), null, "traversal is refused");
  assert.equal(resolveOptionImageSrc("media/a/b.png"), null, "subdirectories are refused");
  assert.equal(resolveOptionImageSrc("media/mock.svg"), null, "svg is not a served image type");
  assert.equal(resolveOptionImageSrc("media/README"), null, "extensionless names are refused");
  assert.equal(resolveOptionImageSrc("javascript:alert(1)"), null);
  assert.equal(resolveOptionImageSrc("http://insecure.example/x.png"), null, "plain http is refused");
  assert.equal(resolveOptionImageSrc(""), null);
  assert.equal(resolveOptionImageSrc(null), null);
  assert.equal(resolveOptionImageSrc(42), null);
});

test("optionImagesFor aligns images with options and pads with nulls", () => {
  const images = optionImagesFor(3, ["media/a.png", "https://x/b.png"]);
  assert.deepEqual(images, ["/api/exo/media/a.png", "https://x/b.png", null]);
  assert.deepEqual(optionImagesFor(1, undefined), [null]);
  assert.deepEqual(optionImagesFor(2, "media/bad.svg"), [null, null], "bad entries do not shift alignment");
});

test("extension allowlist matches the media route", () => {
  assert.equal(isAllowedOptionImageName("a.png"), true);
  assert.equal(isAllowedOptionImageName("a.webp"), true);
  assert.equal(isAllowedOptionImageName("a.svg"), false);
});
