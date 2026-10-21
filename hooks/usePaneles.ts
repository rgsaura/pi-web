"use client";

import { useCallback, useEffect, useState } from "react";
import type { PanelMeta } from "@/lib/paneles";

/**
 * One shared read of /api/paneles for the sidebar button and the view.
 * Same shape as useExoData: a short module cache dedupes concurrent readers.
 */

interface PanelesResponse {
  generatedAt: string;
  paneles: PanelMeta[];
}

const CACHE_MS = 30_000;
let cache: { data: PanelesResponse | null; readAt: number } = { data: null, readAt: 0 };
let inFlight: Promise<PanelesResponse> | null = null;

async function fetchPaneles(): Promise<PanelesResponse> {
  if (!inFlight) {
    inFlight = fetch("/api/paneles", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Paneles unavailable (${response.status})`);
        return response.json() as Promise<PanelesResponse>;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface UsePanelesResult {
  data: PanelesResponse | null;
  paneles: PanelMeta[];
  activeCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function usePaneles(): UsePanelesResult {
  const [data, setData] = useState<PanelesResponse | null>(cache.data);
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
    fetchPaneles()
      .then((result) => {
        if (cancelled) return;
        cache = { data: result, readAt: Date.now() };
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Paneles unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const paneles = data?.paneles ?? [];
  const activeCount = paneles.filter((p) => p.estado !== "archivado").length;
  return { data, paneles, activeCount, loading, error, refresh };
}
