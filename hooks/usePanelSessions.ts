"use client";

import { useEffect, useState } from "react";
import type { PanelSessionLink } from "@/lib/paneles-sessions";

/**
 * One shared read of /api/paneles/sessions?slug=<dir> for the visor strip and
 * the grid cards. Same shape as usePaneles: a short module cache dedupes
 * concurrent readers, in-flight promises included, so opening a card and its
 * viewer costs one scan.
 */

export interface PanelSessionsResponse {
  slug: string;
  sessions: PanelSessionLink[];
  missing: string[];
  truncated: boolean;
}

const CACHE_MS = 30_000;
const cache = new Map<string, { data: PanelSessionsResponse; at: number }>();
const inflight = new Map<string, Promise<PanelSessionsResponse>>();

async function fetchPanelSessions(slug: string): Promise<PanelSessionsResponse> {
  let pending = inflight.get(slug);
  if (!pending) {
    pending = fetch(`/api/paneles/sessions?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Panel sessions unavailable (${response.status})`);
        return response.json() as Promise<PanelSessionsResponse>;
      })
      .finally(() => {
        inflight.delete(slug);
      });
    inflight.set(slug, pending);
  }
  return pending;
}

export interface UsePanelSessionsResult {
  data: PanelSessionsResponse | null;
  sessions: PanelSessionLink[];
  missing: string[];
  truncated: boolean;
  loading: boolean;
  error: string | null;
}

export function usePanelSessions(slug: string | null): UsePanelSessionsResult {
  const [data, setData] = useState<PanelSessionsResponse | null>(() =>
    slug ? cache.get(slug)?.data ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(slug);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setData(cached.data);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPanelSessions(slug)
      .then((result) => {
        if (cancelled) return;
        cache.set(slug, { data: result, at: Date.now() });
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Panel sessions unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return {
    data,
    sessions: data?.sessions ?? [],
    missing: data?.missing ?? [],
    truncated: data?.truncated ?? false,
    loading,
    error,
  };
}
