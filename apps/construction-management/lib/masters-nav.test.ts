import { describe, expect, it } from "vitest";

import {
  MASTERS_GROUPS,
  MASTERS_SECTIONS,
  activeMastersSection,
} from "./masters-nav";

describe("MASTERS_GROUPS", () => {
  it("lists every master once, under /app/masters", () => {
    const hrefs = MASTERS_SECTIONS.map((section) => section.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href).toMatch(/^\/app\/masters\/[a-z-]+$/);
    expect(MASTERS_SECTIONS).toHaveLength(
      MASTERS_GROUPS.reduce((n, group) => n + group.sections.length, 0),
    );
  });

  it("finds the section a page belongs to", () => {
    expect(activeMastersSection("/app/masters/designations")?.label).toBe(
      "Designations",
    );
    expect(activeMastersSection("/app/masters/designations/d1")?.label).toBe(
      "Designations",
    );
    expect(activeMastersSection("/app/settings")).toBeUndefined();
    // Team Members moved to Users & Roles → Users (ADR CM-0030).
    expect(activeMastersSection("/app/masters/team-members")).toBeUndefined();
    expect(MASTERS_GROUPS[0]?.sections.map((section) => section.label)).toEqual(
      ["Designations"],
    );
    expect(activeMastersSection("/app/masters")).toBeUndefined();
    expect(activeMastersSection("/app/masters/designationsx")).toBeUndefined();
  });
});
