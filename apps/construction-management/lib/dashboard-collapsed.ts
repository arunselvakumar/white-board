import {
  isDashboardSectionKey,
  type DashboardSectionKey,
} from "@/src/projects/domain/dashboard-sections";

/*
 * Which Project Dashboard sections a member has collapsed (ADR CM-0025):
 * in the browser's localStorage only, one key per member, for every
 * Project. Storage that throws (private mode, blocked site data) or holds
 * junk reads as every section open; it never fails the dashboard.
 */

export function collapsedStorageKey(userId: string): string {
  return `cm:dashboard-collapsed:${userId}`;
}

/**
 * The collapsed section keys in a stored value. Anything unreadable reads
 * as none; unknown keys and repeats are dropped.
 */
export function parseCollapsed(raw: string | null): DashboardSectionKey[] {
  if (raw == null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const keys: DashboardSectionKey[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "string" || !isDashboardSectionKey(entry)) continue;
    if (!keys.includes(entry)) keys.push(entry);
  }
  return keys;
}

export type CollapsedStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type CollapsedStore = {
  /**
   * The raw stored value for `key` (null: nothing collapsed). A string,
   * so `useSyncExternalStore` sees no change until a write.
   */
  snapshot: (key: string) => string | null;
  /** Stores `keys` as collapsed; an empty list removes the item. */
  write: (key: string, keys: readonly DashboardSectionKey[]) => void;
  subscribe: (listener: () => void) => () => void;
};

/**
 * A store over `storage()`, read on every snapshot so another tab's change
 * shows. A write the storage refuses is kept in memory instead, so
 * collapsing still works for the visit; a storage that throws on read
 * reads as every section open.
 */
export function createCollapsedStore(
  storage: () => CollapsedStorage | null,
): CollapsedStore {
  const refused = new Map<string, string | null>();
  const listeners = new Set<() => void>();
  return {
    snapshot(key) {
      if (refused.has(key)) return refused.get(key) ?? null;
      try {
        return storage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    write(key, keys) {
      const raw = keys.length === 0 ? null : JSON.stringify([...keys]);
      try {
        const target = storage();
        if (target == null) throw new Error("No storage");
        if (raw == null) target.removeItem(key);
        else target.setItem(key, raw);
        refused.delete(key);
      } catch {
        refused.set(key, raw);
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
