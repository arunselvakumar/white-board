import { afterEach, describe, expect, it, vi } from "vitest";

describe("theme preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("starts in light mode and restores a saved dark choice", async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });

    const { useThemeStore } = await import("./theme-store");
    expect(useThemeStore.getState().theme).toBe("light");

    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(entries.get("whiteboard-theme")).toContain('"theme":"dark"');

    vi.resetModules();
    const reloaded = await import("./theme-store");
    expect(reloaded.useThemeStore.getState().theme).toBe("dark");
  });
});
