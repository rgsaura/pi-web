/**
 * Keeps rg-archive-expiry's registry (~/.local/state/exo-expiry/registry.json)
 * in step with a panel's temporal expiry, so the EXISTING weekly watcher is
 * the one that proposes archiving a panel when its date nears ("caducidad:
 * panel:<slug>" tag, its usual Borrar/Prorrogar/Conservar options). A pinned
 * panel with an expiry keeps one entry; clearing the expiry or archiving the
 * panel removes it. Best-effort: a missing or unwritable registry never
 * blocks a visibility change.
 */

import { existsSync, mkdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { serializeByKey } from "./key-serializer";

const EXPIRY_REGISTRY_LOCK = Symbol.for("pi-web.expiry-registry");

export interface ExpiryRegistryEntry {
  id: string;
  path: string;
  kind: string;
  note: string;
  created: string;
  expires: string;
}

export interface ExpiryRegistry {
  version: number;
  entries: ExpiryRegistryEntry[];
}

export function expiryRegistryPath(): string {
  return process.env.EXO_EXPIRY_REGISTRY
    ? process.env.EXO_EXPIRY_REGISTRY
    : join(homedir(), ".local", "state", "exo-expiry", "registry.json");
}

/** The tag rg-archive-expiry deduplicates its proposals by. */
export function panelExpiryEntryId(slug: string): string {
  return `panel:${slug}`;
}

function isEntry(value: unknown): value is ExpiryRegistryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.path === "string" &&
    typeof entry.expires === "string"
  );
}

export function parseExpiryRegistry(raw: unknown): ExpiryRegistry {
  const data = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const entries = Array.isArray(data.entries) ? data.entries.filter(isEntry) : [];
  return {
    version: typeof data.version === "number" ? data.version : 1,
    entries: entries.map((entry) => ({
      id: entry.id,
      path: entry.path,
      kind: typeof entry.kind === "string" ? entry.kind : "panel",
      note: typeof entry.note === "string" ? entry.note : "",
      created: typeof entry.created === "string" ? entry.created : "",
      expires: entry.expires,
    })),
  };
}

/** One entry replaced (created kept) or appended. Pure. */
export function upsertExpiryEntry(
  entries: readonly ExpiryRegistryEntry[],
  entry: ExpiryRegistryEntry,
): ExpiryRegistryEntry[] {
  return [...entries.filter((other) => other.id !== entry.id), entry];
}

/** The id's entry gone. Pure. */
export function removeExpiryEntry(
  entries: readonly ExpiryRegistryEntry[],
  id: string,
): ExpiryRegistryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export interface PanelExpiryTarget {
  dir: string;
  titulo: string;
  expira: string;
}

/**
 * Upsert (`target`) or remove (`null`) one panel's entry under a lock.
 * Never throws: the caller's visibility change already happened.
 */
export function syncPanelExpiryRegistry(slug: string, target: PanelExpiryTarget | null): void {
  void serializeByKey(EXPIRY_REGISTRY_LOCK, "registry", () => {
    try {
      const path = expiryRegistryPath();
      let registry: ExpiryRegistry = { version: 1, entries: [] };
      if (existsSync(path)) {
        registry = parseExpiryRegistry(JSON.parse(readFileSync(path, "utf8")));
      }
      const id = panelExpiryEntryId(slug);
      registry.entries = target
        ? upsertExpiryEntry(registry.entries, {
            id,
            path: target.dir,
            kind: "panel",
            note: `Panel "${target.titulo}" fijado temporalmente hasta ${target.expira}`,
            created: registry.entries.find((entry) => entry.id === id)?.created ?? new Date().toISOString().slice(0, 10),
            expires: target.expira,
          })
        : removeExpiryEntry(registry.entries, id);
      mkdirSync(dirname(path), { recursive: true });
      writePrivateFileAtomicSync(path, `${JSON.stringify(registry, null, 2)}\n`);
    } catch {
      // Best-effort: the watcher simply misses this panel this week.
    }
    return null;
  }).catch(() => {
    // Best-effort, same as the write above.
  });
}
