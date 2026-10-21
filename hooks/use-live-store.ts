"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One shared live read of a JSON endpoint, the single source behind every
 * number the interface shows. All readers subscribe to the same store, so
 * the badges and the views can never disagree: one reader's `refresh()`
 * (after a resolve, a discard, an undo) updates every subscriber at once.
 *
 * While any reader is mounted and the tab is visible the store polls — the
 * data changes underneath from other sessions (the CLIs, other agents) —
 * and a tab brought back to the foreground refetches instead of showing a
 * number from while it was hidden. With no readers, everything is idle.
 */

export interface LiveStoreState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface LiveStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => LiveStoreState<T>;
  /** Forces a fresh read now, notifying every subscriber. */
  refresh: () => void;
}

export function createLiveStore<T>(url: string, parse: (body: unknown) => T, pollMs: number): LiveStore<T> {
  let state: LiveStoreState<T> = { data: null, loading: false, error: null };
  let lastReadAt = 0;
  let inFlight: Promise<void> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function read(force: boolean): void {
    if (inFlight) return;
    if (!force && state.data !== null && Date.now() - lastReadAt < pollMs) return;
    state = { ...state, loading: true };
    emit();
    inFlight = (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body: unknown = await response.json();
        state = { data: parse(body), loading: false, error: null };
        lastReadAt = Date.now();
      } catch (cause: unknown) {
        // A failed read keeps the last good data: the numbers stay, only the
        // spinners and the error slot say it is retrying.
        state = { ...state, loading: false, error: cause instanceof Error ? cause.message : "read failed" };
      } finally {
        inFlight = null;
        emit();
      }
    })();
  }

  function tick(): void {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    read(false);
  }

  function onVisibility(): void {
    if (document.visibilityState === "visible" && (!state.data || Date.now() - lastReadAt >= pollMs)) {
      read(false);
    }
  }

  function start(): void {
    read(false);
    pollTimer = setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", onVisibility);
  }

  function stop(): void {
    if (pollTimer !== null) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function subscribe(listener: () => void): () => void {
    if (listeners.size === 0) start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }

  return {
    subscribe,
    getSnapshot: () => state,
    refresh: () => read(true),
  };
}

/** Subscribes a component to a live store; `refresh` forces every reader of
 *  it to re-read at once. */
export function useLiveStore<T>(store: LiveStore<T>): LiveStoreState<T> & { refresh: () => void } {
  const current = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const refresh = useCallback(() => store.refresh(), [store]);
  return { ...current, refresh };
}
