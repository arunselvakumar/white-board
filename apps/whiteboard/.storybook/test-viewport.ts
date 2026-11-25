/**
 * Resizes the story test browser, which otherwise stays 414 × 896: the
 * Storybook viewport global does not reach it in this setup. Does nothing
 * outside story tests (in Storybook itself the toolbar sets the size).
 * Returns whether it resized.
 */
export async function setTestViewport(
  width: number,
  height: number,
): Promise<boolean> {
  if (!("__vitest_browser__" in globalThis)) return false;
  const browser = (await import("vitest/browser")) as unknown as {
    page?: { viewport: (width: number, height: number) => Promise<void> };
  };
  if (browser.page == null) return false;
  await browser.page.viewport(width, height);
  return true;
}

/** The test browser's own size, to put back after a story that changed it. */
export const DEFAULT_TEST_VIEWPORT = { width: 414, height: 896 } as const;
