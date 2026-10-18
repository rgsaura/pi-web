"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExoData } from "@/lib/exo-types";

/** One shared read of /api/exo/data for the sidebar button and the panel. */
interface ExoCache {
  data: ExoData | null;
  readAt: number;
}

const CACHE_MS = 30_000;
let cache: ExoCache = { data: null, readAt: 0 };
let inFlight: Promise<ExoData> | null = null;

async function fetchExoData(): Promise<ExoData> {
  if (!inFlight) {
    inFlight = fetch("/api/exo/data", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Exo data unavailable (${response.status})`);
        return response.json() as Promise<ExoData>;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface UseExoDataResult {
  data: ExoData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useExoData(): UseExoDataResult {
  const [data, setData] = useState<ExoData | null>(cache.data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    cache = { data: null, readAt: 0 };
    inFlight = null;
    setVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (cache.data && Date.now() - cache.readAt < CACHE_MS) {
      setData(cache.data);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchExoData()
      .then((result) => {
        if (cancelled) return;
        cache = { data: result, readAt: Date.now() };
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Exo data unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { data, loading, error, refresh };
}
