"use client";

import { useSyncExternalStore } from "react";

/**
 * How the main menu is shown (ADR CM-0039): beside every page in the
 * sidebar, or on a page of its own (Home) with a top bar on the other
 * pages. It is the User's choice on this device, kept in `localStorage`.
 */
export type MenuLayout = "sidebar" | "full";

export const MENU_LAYOUT_KEY = "construction-menu-layout";

const listeners = new Set<() => void>();
/** The choice when storage is blocked (a private window): it lasts until the tab closes. */
let unsaved: MenuLayout | null = null;

/**
 * The stored choice, for code that runs only in the browser. During
 * hydration `useMenuLayout` still says `sidebar`; this does not.
 */
export function readMenuLayout(): MenuLayout {
  if (unsaved != null) return unsaved;
  try {
    return window.localStorage.getItem(MENU_LAYOUT_KEY) === "full"
      ? "full"
      : "sidebar";
  } catch {
    return "sidebar";
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab changed it.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setMenuLayout(layout: MenuLayout): void {
  try {
    window.localStorage.setItem(MENU_LAYOUT_KEY, layout);
    unsaved = null;
  } catch {
    unsaved = layout;
  }
  for (const listener of listeners) listener();
}

/**
 * The User's menu layout. The server and the first client render say
 * `sidebar`, since the choice is only in the browser; a `full` choice
 * applies right after hydration.
 */
export function useMenuLayout(): MenuLayout {
  return useSyncExternalStore(subscribe, readMenuLayout, () => "sidebar");
}
