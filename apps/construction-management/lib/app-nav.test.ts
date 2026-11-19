import { describe, expect, it } from "vitest";

import { APP_NAV, isAppNavActive } from "./app-nav";

describe("APP_NAV", () => {
  it("has the Company Dashboard, Projects, Departments, Workspace, Masters, then Settings (ADR CM-0034, CM-0046)", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Departments",
      "Workspace",
      "Masters",
      "Settings",
    ]);
  });

  it("keeps Human Resources and Marketing under Departments, not at the top", () => {
    const labels: readonly string[] = APP_NAV.map((item) => item.label);
    expect(labels).not.toContain("Human Resources");
    expect(labels).not.toContain("Marketing");
    expect(labels).not.toContain("HR");
  });

  it("marks an area active on its pages only", () => {
    expect(isAppNavActive("/app/projects", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projects/p1", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projectsx", "/app/projects")).toBe(false);
    expect(isAppNavActive("/app/masters", "/app/projects")).toBe(false);
  });
});
