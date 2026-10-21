"use client";

import { createLiveStore, useLiveStore } from "./use-live-store";
import type { WorkspaceSummary } from "@/lib/workspaces-data";

/**
 * One shared live read of /api/workspaces for the sidebar's Workspaces badge
 * and the Workspaces view: the same single store, so the two can never
 * disagree, refreshed on the slower cadence of a directory-backed list.
 */

const workspacesStore = createLiveStore<WorkspaceSummary[]>("/api/workspaces", (body) => {
  const parsed = body as { workspaces?: WorkspaceSummary[] };
  return parsed.workspaces ?? [];
}, 45_000);

export interface UseWorkspacesResult {
  workspaces: WorkspaceSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useWorkspaces(): UseWorkspacesResult {
  const { data, loading, error, refresh } = useLiveStore(workspacesStore);
  return { workspaces: data ?? [], loading, error, refresh };
}
