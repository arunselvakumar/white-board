import { describe, expect, it } from "vitest";

import {
  programmeFields,
  programmeNameKey,
  reorderProgrammes,
} from "./programme";

const base = {
  name: "  Toddler   Group ",
  minAgeMonths: 18,
  maxAgeMonths: 30,
  isDaycare: false,
};

describe("programmeFields", () => {
  it("trims the name and keeps the age range", () => {
    expect(programmeFields(base)).toEqual({ ...base, name: "Toddler Group" });
  });

  it("allows an open age range", () => {
    expect(
      programmeFields({ ...base, minAgeMonths: null, maxAgeMonths: null }),
    ).toMatchObject({ minAgeMonths: null, maxAgeMonths: null });
  });

  it("refuses an empty name", () => {
    expect(() => programmeFields({ ...base, name: "  " })).toThrow(
      expect.objectContaining({ code: "PROGRAMME_NAME_REQUIRED" }),
    );
  });

  it("refuses a youngest age above the oldest", () => {
    expect(() =>
      programmeFields({ ...base, minAgeMonths: 40, maxAgeMonths: 30 }),
    ).toThrow(expect.objectContaining({ code: "PROGRAMME_AGE_RANGE_INVALID" }));
  });

  it("refuses a negative or fractional age", () => {
    expect(() => programmeFields({ ...base, minAgeMonths: -1 })).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
    expect(() => programmeFields({ ...base, maxAgeMonths: 30.5 })).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });
});

describe("programmeNameKey", () => {
  it("ignores case and repeated spaces", () => {
    expect(programmeNameKey(" Nursery  (Pre-KG)")).toBe(
      programmeNameKey("nursery (pre-kg)"),
    );
  });
});

describe("reorderProgrammes", () => {
  const current = [
    { id: "a", archived: false },
    { id: "x", archived: true },
    { id: "b", archived: false },
    { id: "c", archived: false },
  ];

  it("puts the listed Programmes first and archived ones after", () => {
    expect(reorderProgrammes(current, ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
      "x",
    ]);
  });

  it("refuses a list that misses, repeats, or adds a Programme", () => {
    for (const ids of [
      ["a", "b"],
      ["a", "b", "b"],
      ["a", "b", "c", "x"],
      ["a", "b", "z"],
    ])
      expect(() => reorderProgrammes(current, ids)).toThrow(
        expect.objectContaining({ code: "PROGRAMME_ORDER_INVALID" }),
      );
  });
});
