import { describe, expect, it, vi } from "vitest";

import {
  collapsedStorageKey,
  createCollapsedStore,
  parseCollapsed,
  type CollapsedStorage,
} from "./dashboard-collapsed";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  } satisfies CollapsedStorage & { items: Map<string, string> };
}

const blocked: CollapsedStorage = {
  getItem: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
  setItem: () => {
    throw new DOMException(
      "The quota has been exceeded.",
      "QuotaExceededError",
    );
  },
  removeItem: () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  },
};

const KEY = collapsedStorageKey("user_arun");

describe("collapsedStorageKey", () => {
  it("is one key per member", () => {
    expect(KEY).toBe("cm:dashboard-collapsed:user_arun");
  });
});

describe("parseCollapsed", () => {
  it("reads the stored section keys", () => {
    expect(parseCollapsed('["materials","booking"]')).toEqual([
      "materials",
      "booking",
    ]);
  });

  it("reads nothing stored as every section open", () => {
    expect(parseCollapsed(null)).toEqual([]);
  });

  it("reads junk as every section open", () => {
    expect(parseCollapsed("not json")).toEqual([]);
    expect(parseCollapsed('{"materials":true}')).toEqual([]);
    expect(parseCollapsed("42")).toEqual([]);
    expect(parseCollapsed("null")).toEqual([]);
  });

  it("drops unknown keys, other values and repeats", () => {
    expect(
      parseCollapsed('["materials",7,"todo",null,"materials","inquiry"]'),
    ).toEqual(["materials", "inquiry"]);
  });
});

describe("createCollapsedStore", () => {
  it("reads what the storage holds and writes it back", () => {
    const storage = memoryStorage({ [KEY]: '["task"]' });
    const store = createCollapsedStore(() => storage);
    expect(parseCollapsed(store.snapshot(KEY))).toEqual(["task"]);

    store.write(KEY, ["task", "materials"]);
    expect(storage.items.get(KEY)).toBe('["task","materials"]');
    expect(parseCollapsed(store.snapshot(KEY))).toEqual(["task", "materials"]);
  });

  it("removes the item when nothing is collapsed", () => {
    const storage = memoryStorage({ [KEY]: '["task"]' });
    const store = createCollapsedStore(() => storage);
    store.write(KEY, []);
    expect(storage.items.has(KEY)).toBe(false);
    expect(store.snapshot(KEY)).toBeNull();
  });

  it("keeps the same snapshot until a write, and tells subscribers", () => {
    const store = createCollapsedStore(() => memoryStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.write(KEY, ["booking"]);
    expect(store.snapshot(KEY)).toBe(store.snapshot(KEY));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.write(KEY, []);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps one member's sections apart from another's", () => {
    const storage = memoryStorage();
    const store = createCollapsedStore(() => storage);
    store.write(KEY, ["booking"]);
    expect(store.snapshot(collapsedStorageKey("user_karthik"))).toBeNull();
  });

  it("opens every section and still collapses for the visit when storage throws", () => {
    const store = createCollapsedStore(() => blocked);
    expect(store.snapshot(KEY)).toBeNull();
    expect(() => {
      store.write(KEY, ["materials"]);
    }).not.toThrow();
    expect(parseCollapsed(store.snapshot(KEY))).toEqual(["materials"]);
  });

  it("works in memory without a storage", () => {
    const store = createCollapsedStore(() => null);
    store.write(KEY, ["inquiry"]);
    expect(parseCollapsed(store.snapshot(KEY))).toEqual(["inquiry"]);
  });

  it("reads the storage again after another tab changed it", () => {
    const storage = memoryStorage();
    const store = createCollapsedStore(() => storage);
    expect(store.snapshot(KEY)).toBeNull();
    storage.items.set(KEY, '["payments"]');
    expect(parseCollapsed(store.snapshot(KEY))).toEqual(["payments"]);
  });
});
