import { describe, expect, it } from "vitest";

import {
  LABOUR_VENDORS_SECTIONS,
  activeLabourVendorsSection,
} from "./labour-vendors-nav";

describe("LABOUR_VENDORS_SECTIONS", () => {
  it("has Labours, Supervisors, then Vendors, at the root", () => {
    expect(LABOUR_VENDORS_SECTIONS.map((section) => section.href)).toEqual([
      "/app/labours",
      "/app/supervisors",
      "/app/vendors",
    ]);
  });

  it("finds the section a page belongs to", () => {
    expect(activeLabourVendorsSection("/app/labours")?.label).toBe("Labours");
    expect(activeLabourVendorsSection("/app/labours/new")?.label).toBe(
      "Labours",
    );
    expect(activeLabourVendorsSection("/app/vendors/v1")?.label).toBe(
      "Vendors",
    );
    expect(activeLabourVendorsSection("/app/supervisors")?.label).toBe(
      "Supervisors",
    );
    // Labour Categories are under Masters now (ADR CM-0035).
    expect(
      activeLabourVendorsSection("/app/masters/labour-categories"),
    ).toBeUndefined();
    expect(activeLabourVendorsSection("/app/laboursx")).toBeUndefined();
    expect(activeLabourVendorsSection("/app/masters/labours")).toBeUndefined();
  });
});
