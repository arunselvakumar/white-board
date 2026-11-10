"use client";

import { useCompanyAuthSnapshot } from "@repo/auth/construction/react";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  collapsedStorageKey,
  createCollapsedStore,
  parseCollapsed,
} from "@/lib/dashboard-collapsed";
import type { DashboardSectionKey } from "@/src/projects/domain/dashboard-sections";

/*
 * Which dashboard sections the member has collapsed (ADR CM-0025), from
 * localStorage. The server render and hydration read every section open;
 * the stored choice applies right after.
 */

const store = createCollapsedStore(() =>
  typeof window === "undefined" ? null : window.localStorage,
);

/** Another tab's change shows here too. */
function subscribe(listener: () => void): () => void {
  const unsubscribe = store.subscribe(listener);
  window.addEventListener("storage", listener);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", listener);
  };
}

const noKey = () => null;

type SectionCollapse = {
  isCollapsed: (key: DashboardSectionKey) => boolean;
  /**
   * Collapses or opens `keys`. With `focus`, that section's toggle takes
   * focus when it mounts again: a collapsed section is a different card
   * from the open one (it skips its data), so the button is replaced.
   */
  setCollapsed: (
    keys: readonly DashboardSectionKey[],
    collapsed: boolean,
    focus?: DashboardSectionKey,
  ) => void;
  /** True once for the section `setCollapsed` asked to focus. */
  takeFocus: (key: DashboardSectionKey) => boolean;
};

const SectionCollapseContext = createContext<SectionCollapse | null>(null);

export function SectionCollapseProvider({ children }: { children: ReactNode }) {
  const { userId } = useCompanyAuthSnapshot();
  const key = userId == null ? null : collapsedStorageKey(userId);
  const stored = useSyncExternalStore(
    subscribe,
    key == null ? noKey : () => store.snapshot(key),
    noKey,
  );
  // Without a signed-in member (stories) the choice lasts while mounted.
  const [unsaved, setUnsaved] = useState<string | null>(null);
  const raw = key == null ? unsaved : stored;
  const focus = useRef<DashboardSectionKey | null>(null);
  const value = useMemo<SectionCollapse>(() => {
    const collapsed = parseCollapsed(raw);
    return {
      isCollapsed: (section) => collapsed.includes(section),
      setCollapsed: (keys, collapse, focusKey) => {
        focus.current = focusKey ?? null;
        const rest = collapsed.filter((section) => !keys.includes(section));
        const next = collapse ? [...rest, ...keys] : rest;
        if (key == null)
          setUnsaved(next.length === 0 ? null : JSON.stringify(next));
        else store.write(key, next);
      },
      takeFocus: (section) => {
        if (focus.current !== section) return false;
        focus.current = null;
        return true;
      },
    };
  }, [key, raw]);
  return (
    <SectionCollapseContext.Provider value={value}>
      {children}
    </SectionCollapseContext.Provider>
  );
}

/** The dashboard's collapse state; null outside the dashboard (stories). */
export function useSectionCollapse(): SectionCollapse | null {
  return useContext(SectionCollapseContext);
}
