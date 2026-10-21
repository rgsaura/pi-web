"use client";

import { useCallback, useEffect, useState } from "react";
import {
  NATIVE_PANELS,
  nativePanelState,
  type NativePanelState,
} from "@/lib/panel-catalog";
import { loadNativePanelStates, saveNativePanelState } from "@/lib/sidebar-prefs";

/**
 * Native panels' visibility state (they have no panel.json): one module
 * store over the browser's sidebar prefs, so the catalog and the sidebar's
 * pinned strip see the same state live. Restored after mount, like every
 * sidebar memory (never in a state initializer).
 */

export type NativePanelStates = Readonly<Record<string, NativePanelState>>;

const listeners = new Set<() => void>();
let loaded = false;
let states: NativePanelStates = {};

function readStates(): NativePanelStates {
  const saved = loadNativePanelStates();
  const result: Record<string, NativePanelState> = {};
  for (const def of NATIVE_PANELS) {
    result[def.id] = nativePanelState(def, saved[def.id]);
  }
  return result;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export interface UseNativePanelStatesResult {
  states: NativePanelStates;
  setNativePanelState: (id: string, state: NativePanelState) => void;
}

export function useNativePanelStates(): UseNativePanelStatesResult {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!loaded) {
      loaded = true;
      states = readStates();
    }
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setNativePanelState = useCallback((id: string, state: NativePanelState) => {
    saveNativePanelState(id, state);
    states = { ...states, [id]: state };
    notify();
  }, []);

  return { states, setNativePanelState };
}

/** Test seam: forget the module store (jsdom-less tests reload the module). */
export function resetNativePanelStatesForTests(): void {
  loaded = false;
  states = {};
}
