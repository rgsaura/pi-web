"use client";

import { createLiveStore, useLiveStore } from "./use-live-store";
import type { ExoData } from "@/lib/exo-types";

/**
 * One shared live read of /api/exo/data for the sidebar's Decisiones and
 * Encargos badges and the views behind them. Every counter derived from it
 * (relevantProposals for pending decisions, encargos.pendingCount) is live
 * while the tab is visible: the server cache is dropped the moment either
 * ledger file changes on disk, and this store polls and refetches on
 * foreground, so a decision created or resolved anywhere is reflected here
 * without reopening anything.
 */

const exoStore = createLiveStore<ExoData>("/api/exo/data", (body) => body as ExoData, 15_000);

export interface UseExoDataResult {
  data: ExoData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useExoData(): UseExoDataResult {
  return useLiveStore(exoStore);
}
