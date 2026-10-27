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
    expect(activeMastersSection("/app/masters/contractors")?.label).toBe(
      "Contractors",
    );
    expect(activeMastersSection("/app/masters/contractors/c1")?.label).toBe(
      "Contractors",
    );
    expect(activeMastersSection("/app/settings")).toBeUndefined();
    // Team Members moved to Staff & Roles → Staff (ADR CM-0030), and
    // Designations are gone (ADR CM-0033).
    expect(activeMastersSection("/app/masters/team-members")).toBeUndefined();
    expect(activeMastersSection("/app/masters/designations")).toBeUndefined();
    // Labours, Vendors and their lists are their own area, Labour & Vendors.
    expect(activeMastersSection("/app/labours")).toBeUndefined();
    expect(MASTERS_GROUPS.map((group) => group.label)).not.toContain(
      "Labour & Vendors",
    );
    expect(MASTERS_GROUPS[0]?.label).toBe("Parties");
    expect(activeMastersSection("/app/masters")).toBeUndefined();
    expect(activeMastersSection("/app/masters/contractorsx")).toBeUndefined();
  });
});
