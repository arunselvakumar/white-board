import { describe, expect, it } from "vitest";

import {
  LABOUR_VENDORS_SECTIONS,
  activeLabourVendorsSection,
} from "./labour-vendors-nav";

describe("LABOUR_VENDORS_SECTIONS", () => {
  it("has Labours, Vendors, Labour Categories, then Supervisors, at the root", () => {
    expect(LABOUR_VENDORS_SECTIONS.map((section) => section.href)).toEqual([
      "/app/labours",
      "/app/vendors",
      "/app/labour-categories",
      "/app/supervisors",
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
    expect(activeLabourVendorsSection("/app/labour-categories")?.label).toBe(
      "Labour Categories",
    );
    expect(activeLabourVendorsSection("/app/laboursx")).toBeUndefined();
    expect(activeLabourVendorsSection("/app/masters/labours")).toBeUndefined();
  });
});
