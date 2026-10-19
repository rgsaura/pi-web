import assert from "node:assert/strict";
import test from "node:test";

// Loaded through jiti so the module's own extensionless imports resolve the way
// the app resolves them (tsconfig moduleResolution: "bundler").
async function loadSubject() {
  const { createJiti } = await import("jiti");
  return createJiti(import.meta.url).import("./mountinfo.ts");
}

test("parseMountPoints takes the mount point of each line", async () => {
  const { parseMountPoints } = await loadSubject();
  const table = [
    "731 728 259:1 / / rw,relatime - ext4 /dev/sda1 rw",
    "740 731 0:63 / /home/rgsaura/remote/macbook-pro rw,nosuid,nodev,relatime - fuse.sshfs macbook-pro:/Users/rodrigogarcia rw",
    "garbage line without separator",
    "",
  ].join("\n");

  const points = parseMountPoints(table);
  assert.equal(points.size, 2);
  assert.ok(points.has("/"));
  assert.ok(points.has("/home/rgsaura/remote/macbook-pro"));
});

test("parseMountPoints decodes octal escapes (\\040 space)", async () => {
  const { parseMountPoints } = await loadSubject();
  const table = "800 731 0:70 / /mnt/my\\040docs rw - fuse.sshfs host:/data rw";

  assert.ok(parseMountPoints(table).has("/mnt/my docs"));
});

test("decodeMountPath passes plain paths through and decodes escapes", async () => {
  const { decodeMountPath } = await loadSubject();

  assert.equal(decodeMountPath("/home/user/remote"), "/home/user/remote");
  assert.equal(decodeMountPath("/a\\040b\\134c"), "/a b\\c");
  assert.equal(decodeMountPath("/caf\\303\\251"), "/café");
});
