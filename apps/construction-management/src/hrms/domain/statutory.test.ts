import { describe, expect, it } from "vitest";

import { ptFor, rateInForce, type PtSlab } from "./statutory";

function slab(input: Partial<PtSlab> & Pick<PtSlab, "grossFrom">): PtSlab {
  return {
    stateCode: "27",
    effectiveFrom: "2023-04-01",
    appliesTo: "everyone",
    grossTo: null,
    monthlyAmount: 20_000,
    specialMonth: null,
    specialMonthAmount: null,
    source: "test",
    ...input,
  };
}

describe("rateInForce (ADR CM-0008)", () => {
  const rows = [
    { effectiveFrom: "2014-09-01", wageCeiling: 1_500_000 },
    { effectiveFrom: "2026-11-15", wageCeiling: 2_100_000 },
  ];

  it("takes the latest row on or before the month's last day", () => {
    expect(rateInForce(rows, "2026-10")?.wageCeiling).toBe(1_500_000);
    // A row from the 15th applies to the whole of that month.
    expect(rateInForce(rows, "2026-11")?.wageCeiling).toBe(2_100_000);
    expect(rateInForce(rows, "2014-09")?.wageCeiling).toBe(1_500_000);
  });

  it("has nothing before the first row", () => {
    expect(rateInForce(rows, "2014-08")).toBeNull();
  });
});

describe("ptFor (ADR CM-0008)", () => {
  const maharashtra = [
    slab({
      appliesTo: "men",
      grossFrom: 750_001,
      grossTo: 1_000_000,
      monthlyAmount: 17_500,
    }),
    slab({
      appliesTo: "men",
      grossFrom: 1_000_001,
      specialMonth: 2,
      specialMonthAmount: 30_000,
    }),
    slab({
      appliesTo: "women",
      grossFrom: 2_500_001,
      specialMonth: 2,
      specialMonthAmount: 30_000,
    }),
  ];

  it("finds the slab holding the gross, bounds inclusive", () => {
    const at = (gross: number) =>
      ptFor(maharashtra, {
        stateCode: "27",
        month: "2026-10",
        gross,
        gender: "male",
      }).amount;
    expect(at(750_000)).toBe(0);
    expect(at(750_001)).toBe(17_500);
    expect(at(1_000_000)).toBe(17_500);
    expect(at(1_000_001)).toBe(20_000);
  });

  it("charges the special month its own amount", () => {
    const february = ptFor(maharashtra, {
      stateCode: "27",
      month: "2027-02",
      gross: 5_000_000,
      gender: "male",
    });
    expect(february.amount).toBe(30_000);
    expect(february.slab?.grossFrom).toBe(1_000_001);
  });

  it("uses the women's slabs only for women, the general ones otherwise", () => {
    const input = { stateCode: "27", month: "2026-10", gross: 2_000_000 };
    expect(ptFor(maharashtra, { ...input, gender: "female" }).amount).toBe(0);
    expect(ptFor(maharashtra, { ...input, gender: "male" }).amount).toBe(
      20_000,
    );
    expect(ptFor(maharashtra, { ...input, gender: null }).amount).toBe(20_000);
    expect(ptFor(maharashtra, input).amount).toBe(20_000);
  });

  it("has no PT for a state without rows, or before its first slabs", () => {
    expect(
      ptFor(maharashtra, {
        stateCode: "33",
        month: "2026-10",
        gross: 9_000_000,
      }),
    ).toEqual({ amount: 0, slab: null });
    expect(
      ptFor(maharashtra, {
        stateCode: "27",
        month: "2023-03",
        gross: 9_000_000,
      }).amount,
    ).toBe(0);
  });

  it("uses only the latest set of slabs in force", () => {
    const revised = [
      ...maharashtra,
      slab({
        effectiveFrom: "2026-11-01",
        grossFrom: 3_000_001,
        monthlyAmount: 25_000,
      }),
    ];
    const input = {
      stateCode: "27",
      gross: 2_000_000,
      gender: "male" as const,
    };
    expect(ptFor(revised, { ...input, month: "2026-10" }).amount).toBe(20_000);
    // From November only the revised slab exists: 20,000 is below it.
    expect(ptFor(revised, { ...input, month: "2026-11" }).amount).toBe(0);
  });
});
