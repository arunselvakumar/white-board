import { describe, expect, it } from "vitest";

import { APP_NAV, isAppNavActive } from "./app-nav";

describe("APP_NAV", () => {
  it("has the Company Dashboard, Projects, Human Resources, Workspace, Masters, then Settings (ADR CM-0034)", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Projects",
      "Human Resources",
      "Workspace",
      "Masters",
      "Settings",
    ]);
  });

  it("opens Human Resources on Staff, written out and never shortened", () => {
    const area = APP_NAV.find((item) => item.label === "Human Resources");
    expect(area?.href).toBe("/app/staff");
    expect(APP_NAV.some((item) => item.label === "HR")).toBe(false);
  });

  it("marks an area active on its pages only", () => {
    expect(isAppNavActive("/app/projects", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projects/p1", "/app/projects")).toBe(true);
    expect(isAppNavActive("/app/projectsx", "/app/projects")).toBe(false);
    expect(isAppNavActive("/app/masters", "/app/projects")).toBe(false);
  });
});
