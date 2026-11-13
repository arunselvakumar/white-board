import { describe, expect, it } from "vitest";

import {
  monthBounds,
  monthOf,
  needsReassigning,
  targetFor,
  visitTarget,
} from "./team";

describe("Visit targets (ADR CM-0040 §4)", () => {
  it("takes a whole number or none", () => {
    expect(visitTarget(20)).toBe(20);
    expect(visitTarget(null)).toBeNull();
    expect(() => visitTarget(2.5)).toThrow(
      expect.objectContaining({ code: "VISIT_TARGET_INVALID" }),
    );
    expect(() => visitTarget(-1)).toThrow();
  });

  it("uses the latest target on or before the month, so past months keep theirs", () => {
    const rows = [
      { effectiveMonth: "2026-09", target: 15 },
      { effectiveMonth: "2026-11", target: 20 },
    ];
    expect(targetFor(rows, "2026-08")).toBeNull();
    expect(targetFor(rows, "2026-10")).toBe(15);
    expect(targetFor(rows, "2026-11")).toBe(20);
    expect(targetFor(rows, "2027-01")).toBe(20);
    expect(
      targetFor(
        [...rows, { effectiveMonth: "2026-12", target: null }],
        "2027-01",
      ),
    ).toBeNull();
  });

  it("knows a month's days", () => {
    expect(monthOf("2026-11-12")).toBe("2026-11");
    expect(monthBounds("2026-12")).toEqual({
      first: "2026-12-01",
      next: "2027-01-01",
    });
  });
});

describe("Needs reassigning", () => {
  it("is someone no longer an active Marketing Person", () => {
    const active = new Set(["member-1"]);
    expect(needsReassigning("member-1", active)).toBe(false);
    expect(needsReassigning("member-2", active)).toBe(true);
    expect(needsReassigning(null, active)).toBe(false);
  });
});
