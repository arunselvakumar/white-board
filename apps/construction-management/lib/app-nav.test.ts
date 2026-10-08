import { describe, expect, it } from "vitest";

import { APP_NAV, isAppNavActive } from "./app-nav";

describe("APP_NAV", () => {
  it("has the three top-level areas", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Projects",
      "Workspace",
      "Masters",
    ]);
  });

  it("marks an area active on its pages only", () => {
    expect(isAppNavActive("/app/projects", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projects/p1", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projectsx", "/app/projects")).toBe(false);
    expect(isAppNavActive("/app/masters", "/app/projects")).toBe(false);
  });
});
