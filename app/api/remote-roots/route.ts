import { NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { getRemoteRoot } from "@/lib/allowed-roots";
import { parseMountPoints } from "@/lib/mountinfo";
import { projectIdentityKey } from "@/lib/project-identity";

// GET /api/remote-roots: the remote hosts mounted under the remote root
// (~/remote, SSHFS per-host mounts) that the sidebar offers as projects for
// new sessions. Read-only: directory names plus whether each is mounted,
// read from /proc/self/mountinfo so the check itself never triggers an
// on-demand mount.

async function readMountPoints(): Promise<Set<string>> {
  try {
    return parseMountPoints(await readFile("/proc/self/mountinfo", "utf8"));
  } catch {
    // Not Linux (or no mountinfo): hosts still list, mounted state unknown.
    return new Set();
  }
}

export async function GET() {
  try {
    const root = getRemoteRoot();
    const hosts: Array<{ name: string; path: string; key: string; mounted: boolean }> = [];

    let entries;
    try {
      // readdir reports each child's type without stat()ing it, so listing
      // never wakes an unmounted (on-demand) host.
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return NextResponse.json({ root, hosts });
    }

    let mountPoints: Set<string> | null = null;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const hostPath = join(root, entry.name);
      mountPoints ??= await readMountPoints();
      hosts.push({
        name: entry.name,
        path: hostPath,
        key: projectIdentityKey(hostPath),
        mounted: mountPoints.has(hostPath),
      });
    }

    hosts.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ root, hosts });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
