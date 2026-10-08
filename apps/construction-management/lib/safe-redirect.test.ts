import { describe, expect, it } from "vitest";

import { APP_HOME, continuePath, safeAppPath } from "./safe-redirect";

describe("safeAppPath", () => {
  it("keeps in-app paths", () => {
    expect(safeAppPath("/app/masters")).toBe("/app/masters");
    expect(safeAppPath("/app/masters?tab=1")).toBe("/app/masters?tab=1");
  });

  it("drops anything outside /app", () => {
    for (const value of [
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/sign-in",
      "/application",
    ])
      expect(safeAppPath(value)).toBe(APP_HOME);
  });

  it("carries the target through /continue", () => {
    expect(continuePath(null)).toBe("/continue");
    expect(continuePath("/app/masters")).toBe(
      "/continue?redirect_url=%2Fapp%2Fmasters",
    );
  });
});
