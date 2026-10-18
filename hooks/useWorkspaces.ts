"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkspaceSummary } from "@/lib/workspaces-data";

/** One shared read of /api/workspaces for the sidebar's Workspaces tab. */
interface WorkspacesCache {
  workspaces: WorkspaceSummary[];
  readAt: number;
}

const CACHE_MS = 30_000;
let cache: WorkspacesCache = { workspaces: [], readAt: 0 };
let inFlight: Promise<WorkspaceSummary[]> | null = null;

async function fetchWorkspaces(): Promise<WorkspaceSummary[]> {
  if (!inFlight) {
    inFlight = fetch("/api/workspaces", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Workspaces unavailable (${response.status})`);
        return response.json() as Promise<{ workspaces: WorkspaceSummary[] }>;
      })
      .then((data) => data.workspaces ?? [])
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface UseWorkspacesResult {
  workspaces: WorkspaceSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useWorkspaces(): UseWorkspacesResult {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(cache.workspaces);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    cache = { workspaces: [], readAt: 0 };
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (cache.readAt && Date.now() - cache.readAt < CACHE_MS) {
      setWorkspaces(cache.workspaces);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchWorkspaces()
      .then((result) => {
        if (cancelled) return;
        cache = { workspaces: result, readAt: Date.now() };
        setWorkspaces(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { workspaces, loading, error, refresh };
}
