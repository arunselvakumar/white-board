import { describe, expect, it } from "vitest";

import { APP_NAV, isAppNavActive } from "./app-nav";

describe("APP_NAV", () => {
  it("has the Company Dashboard, Projects, Marketing, Human Resources, Workspace, Masters, then Settings (ADR CM-0034, CM-0040)", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Marketing",
      "Human Resources",
      "Workspace",
      "Masters",
      "Settings",
    ]);
  });

  it("keys Human Resources on the Staff area, written out and never shortened", () => {
    const area = APP_NAV.find((item) => item.label === "Human Resources");
    expect(area?.href).toBe("/app/staff");
    const labels: readonly string[] = APP_NAV.map((item) => item.label);
    expect(labels).not.toContain("HR");
  });

  it("marks an area active on its pages only", () => {
    expect(isAppNavActive("/app/projects", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projects/p1", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projectsx", "/app/projects")).toBe(false);
    expect(isAppNavActive("/app/masters", "/app/projects")).toBe(false);
  });
});
