/**
 * Reading this process's mount table (/proc/self/mountinfo) without touching
 * the mounted paths: stat()ing or readdir()ing an on-demand mount point
 * triggers its mount, so /api/remote-roots answers "is this host mounted"
 * from the table alone. Pure and server-only.
 */

/** Decode mountinfo's octal escapes (\040 for a space). */
export function decodeMountPath(encoded: string): string {
  if (!encoded.includes("\\")) return encoded;
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const match = /^\\([0-7]{1,3})/.exec(encoded.slice(i));
    if (match) {
      bytes.push(Number.parseInt(match[1], 8));
      i += match[0].length - 1;
    } else {
      bytes.push(encoded.charCodeAt(i) & 0xff);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * The mount points of a mountinfo table. A line is
 * "id parent maj:min root MOUNTPOINT options - fstype source extras"; the
 * separator splits the optional fields, and the mount point is the fifth
 * field of the mandatory part.
 */
export function parseMountPoints(mountinfo: string): Set<string> {
  const points = new Set<string>();
  for (const line of mountinfo.split("\n")) {
    const separator = line.lastIndexOf(" - ");
    if (separator === -1) continue;
    const mountPoint = line.slice(0, separator).split(" ")[4];
    if (mountPoint) points.add(decodeMountPath(mountPoint));
  }
  return points;
}
