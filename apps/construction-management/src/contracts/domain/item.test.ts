import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { isValidSacHsn, itemFields, itemInUse, type ItemInput } from "./item";
import {
  analysedRate,
  analysisLine,
  fixedDecimal,
  lineAmount,
  overheadPercent,
  rateAnalysis,
  rateGap,
  scaledDecimal,
} from "./item-analysis";

const UOM = "0199c0de-0000-7000-8000-000000000001";

const base: ItemInput = {
  code: " 5.1.1 ",
  shortDescription: "  PCC  1:4:8 ",
  uomId: UOM,
  adoptedRate: 6_123_45,
};

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

describe("Item fields (CM-1102, ADR CM-0023 §3)", () => {
  it("tidies the code and descriptions and keeps the rate in paise", () => {
    expect(
      itemFields({
        ...base,
        description: "  Providing and laying\nin foundations  ",
        sacHsn: " 9954 ",
        schedule: " CPWD  DSR 2023 ",
      }),
    ).toEqual({
      code: "5.1.1",
      shortDescription: "PCC 1:4:8",
      description: "Providing and laying\nin foundations",
      uomId: UOM,
      sacHsn: "9954",
      schedule: "CPWD DSR 2023",
      adoptedRate: 612345n,
    });
    expect(
      itemFields({ ...base, description: " ", schedule: "" }),
    ).toMatchObject({ description: null, schedule: null, sacHsn: null });
  });

  it("refuses each field that breaks a rule", () => {
    expect(codeOf(() => itemFields({ ...base, code: "  " }))).toBe(
      "ITEM_CODE_REQUIRED",
    );
    expect(codeOf(() => itemFields({ ...base, code: "X".repeat(33) }))).toBe(
      "ITEM_CODE_TOO_LONG",
    );
    expect(itemFields({ ...base, code: "X".repeat(32) }).code).toHaveLength(32);
    expect(codeOf(() => itemFields({ ...base, shortDescription: "" }))).toBe(
      "ITEM_SHORT_DESCRIPTION_REQUIRED",
    );
    expect(
      codeOf(() => itemFields({ ...base, shortDescription: "a".repeat(201) })),
    ).toBe("ITEM_SHORT_DESCRIPTION_TOO_LONG");
    expect(codeOf(() => itemFields({ ...base, uomId: " " }))).toBe(
      "ITEM_UOM_REQUIRED",
    );
    expect(
      codeOf(() => itemFields({ ...base, schedule: "s".repeat(81) })),
    ).toBe("ITEM_SCHEDULE_TOO_LONG");
    expect(codeOf(() => itemFields({ ...base, adoptedRate: -1 }))).toBe(
      "ITEM_RATE_INVALID",
    );
    expect(codeOf(() => itemFields({ ...base, adoptedRate: 1.5 }))).toBe(
      "ITEM_RATE_INVALID",
    );
  });

  it("takes a SAC or HSN code of 4 to 8 digits", () => {
    for (const ok of ["9954", "995411", "72142090"])
      expect(isValidSacHsn(ok), ok).toBe(true);
    for (const bad of ["995", "123456789", "99A4"]) {
      expect(isValidSacHsn(bad), bad).toBe(false);
      expect(codeOf(() => itemFields({ ...base, sacHsn: bad }))).toBe(
        "SAC_HSN_INVALID",
      );
    }
  });

  it("counts the BOQ items that keep it from being deleted", () => {
    expect(itemInUse(1).message).toMatch(/A BOQ item uses this Item/);
    expect(itemInUse(3)).toMatchObject({
      code: "ITEM_IN_USE",
      kind: "conflict",
      details: { count: 3 },
    });
  });
});

describe("Rate analysis (CM-1102, ADR CM-0023 §3)", () => {
  it("reads decimals at a fixed scale and writes them back", () => {
    expect(scaledDecimal("0.45", 4)).toBe(4500n);
    expect(scaledDecimal(0.0525, 4)).toBe(525n);
    expect(scaledDecimal("12", 4)).toBe(120000n);
    expect(scaledDecimal("1,250.5", 2)).toBe(125050n);
    expect(scaledDecimal("0.45000", 4)).toBe(4500n);
    expect(scaledDecimal("0.00001", 4)).toBeNull();
    expect(scaledDecimal("abc", 4)).toBeNull();
    expect(fixedDecimal(4500n, 4)).toBe("0.4500");
    expect(fixedDecimal(1500n, 2)).toBe("15.00");
    expect(fixedDecimal(7n, 2)).toBe("0.07");
  });

  it("rounds a line's amount half up", () => {
    // 0.0001 × ₹0.50 = 0.005 paise → 0; 1.5 × 1 paisa = 1.5 → 2.
    expect(lineAmount(1n, 50n)).toBe(0n);
    expect(lineAmount(15000n, 1n)).toBe(2n);
    expect(lineAmount(14999n, 1n)).toBe(1n);
    // 0.45 bag × ₹415.50 = ₹186.975 → ₹186.98.
    expect(lineAmount(4500n, 41550n)).toBe(18698n);
  });

  it("adds overhead and profit to the sum and rounds once", () => {
    expect(analysedRate([], 1500n)).toBeNull();
    expect(analysedRate([10000n, 333n], null)).toBe(10333n);
    // 10,333 × 1.15 = 11,882.95 → 11,883.
    expect(analysedRate([10000n, 333n], 1500n)).toBe(11883n);
    // 101 × 1.005 = 101.505 → 102 (half up).
    expect(analysedRate([101n], 50n)).toBe(102n);
  });

  it("sums in bigint beyond ₹21.47 crore and beyond 2^53 paise exactly", () => {
    const crore = 1_00_00_000_00n; // ₹1 crore in paise
    const lines = [15n * crore, 9n * crore, 7n * crore]; // ₹31 crore
    expect(analysedRate(lines, null)).toBe(31n * crore);
    expect(analysedRate(lines, 1000n)).toBe((341n * crore) / 10n); // ₹34.1 crore
    const huge = 2n ** 53n + 1n;
    expect(analysedRate([huge, huge], null)).toBe(2n ** 54n + 2n);
    // Over a line too: 12.5 × ₹2 crore = ₹25 crore.
    expect(lineAmount(125000n, 2n * crore)).toBe(25n * crore);
  });

  it("keeps the reference a line's kind needs and forces a lump sum to 1", () => {
    expect(
      analysisLine(
        {
          kind: "material",
          materialId: "m1",
          labourCategoryId: "l1",
          coefficient: "0.45",
          resourceUomId: "bag",
          rate: 41550,
        },
        0,
      ),
    ).toEqual({
      kind: "material",
      materialId: "m1",
      labourCategoryId: null,
      equipmentId: null,
      description: null,
      coefficient: 4500n,
      resourceUomId: "bag",
      rate: 41550n,
      amount: 18698n,
    });
    expect(
      analysisLine(
        {
          kind: "lump_sum",
          materialId: "m1",
          description: " Water  charges ",
          coefficient: "3",
          resourceUomId: "bag",
          rate: 2500,
        },
        2,
      ),
    ).toMatchObject({
      materialId: null,
      description: "Water charges",
      coefficient: 10000n,
      resourceUomId: null,
      amount: 2500n,
    });
  });

  it("refuses a line without its resource, a bad coefficient or rate, with the line number", () => {
    const failed = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        if (error instanceof DomainError) return error;
      }
      throw new Error("Expected a DomainError");
    };
    expect(
      failed(() =>
        analysisLine({ kind: "material", coefficient: 1, rate: 1 }, 3),
      ),
    ).toMatchObject({
      code: "ANALYSIS_MATERIAL_REQUIRED",
      details: { line: 3, field: "lines.3.materialId" },
    });
    expect(
      codeOf(() =>
        analysisLine({ kind: "labour", coefficient: 1, rate: 1 }, 0),
      ),
    ).toBe("ANALYSIS_LABOUR_CATEGORY_REQUIRED");
    expect(
      codeOf(() =>
        analysisLine({ kind: "equipment", coefficient: 1, rate: 1 }, 0),
      ),
    ).toBe("ANALYSIS_EQUIPMENT_REQUIRED");
    expect(codeOf(() => analysisLine({ kind: "lump_sum", rate: 1 }, 0))).toBe(
      "ANALYSIS_DESCRIPTION_REQUIRED",
    );
    for (const coefficient of [0, "-1", "0.00001", "abc", null, "1000000.0001"])
      expect(
        codeOf(() =>
          analysisLine(
            { kind: "labour", labourCategoryId: "l", coefficient, rate: 1 },
            0,
          ),
        ),
        String(coefficient),
      ).toBe("ANALYSIS_COEFFICIENT_INVALID");
    expect(
      codeOf(() =>
        analysisLine(
          { kind: "labour", labourCategoryId: "l", coefficient: 1, rate: -5 },
          0,
        ),
      ),
    ).toBe("ANALYSIS_RATE_INVALID");
    expect(
      codeOf(() =>
        analysisLine(
          {
            kind: "labour",
            labourCategoryId: "l",
            coefficient: 1_000_000,
            rate: 10_000_000_000_000,
          },
          0,
        ),
      ),
    ).toBe("ANALYSIS_AMOUNT_TOO_LARGE");
  });

  it("checks the overhead and works out the analysed rate in order", () => {
    expect(overheadPercent(null)).toBeNull();
    expect(overheadPercent(" ")).toBeNull();
    expect(overheadPercent("15")).toBe(1500n);
    expect(overheadPercent(12.75)).toBe(1275n);
    for (const bad of ["-1", "100.01", "15.125", "x"])
      expect(
        codeOf(() => overheadPercent(bad)),
        bad,
      ).toBe("OVERHEAD_PERCENT_INVALID");
    const analysis = rateAnalysis(
      [
        {
          kind: "material",
          materialId: "cement",
          coefficient: "0.45",
          rate: 41550,
        },
        {
          kind: "labour",
          labourCategoryId: "mason",
          coefficient: "0.1",
          rate: 95000,
        },
        { kind: "lump_sum", description: "Sundries", rate: 1000 },
      ],
      "15",
    );
    expect(analysis.lines.map((line) => line.amount)).toEqual([
      18698n,
      9500n,
      1000n,
    ]);
    // (18,698 + 9,500 + 1,000) × 1.15 = 33,577.7 → 33,578.
    expect(analysis.analysedRate).toBe(33578n);
    expect(rateAnalysis([], "15")).toEqual({
      lines: [],
      overheadPercent: 1500n,
      analysedRate: null,
    });
    expect(
      codeOf(() =>
        rateAnalysis(
          Array.from({ length: 101 }, () => ({
            kind: "lump_sum" as const,
            description: "x",
            rate: 1,
          })),
          null,
        ),
      ),
    ).toBe("ANALYSIS_TOO_MANY_LINES");
  });

  it("shows the gap between the adopted and the analysed rate", () => {
    expect(rateGap(100n, null)).toBeNull();
    expect(rateGap(11500n, 10000n)).toEqual({ paise: 1500n, percent: 15 });
    expect(rateGap(9000n, 12000n)).toEqual({ paise: -3000n, percent: -25 });
    expect(rateGap(10001n, 30000n)).toEqual({
      paise: -19999n,
      percent: -66.66,
    });
    expect(rateGap(500n, 0n)).toEqual({ paise: 500n, percent: null });
  });
});
