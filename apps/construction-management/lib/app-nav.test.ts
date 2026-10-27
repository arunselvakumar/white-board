import { describe, expect, it } from "vitest";

import { APP_NAV, isAppNavActive } from "./app-nav";

describe("APP_NAV", () => {
  it("has the Company Dashboard, the three top-level areas, Labour & Vendors, Staff & Roles, then Settings", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Workspace",
      "Masters",
      "Labour & Vendors",
      "Staff & Roles",
      "Settings",
    ]);
  });

  it("marks an area active on its pages only", () => {
    expect(isAppNavActive("/app/projects", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projects/p1", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projectsx", "/app/projects")).toBe(false);
    expect(isAppNavActive("/app/masters", "/app/projects")).toBe(false);
  });
});
