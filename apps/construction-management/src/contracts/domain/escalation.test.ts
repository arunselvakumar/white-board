import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import type { EscalationComponent } from "./contract-terms";
import {
  addMonths,
  escalationClause,
  escalationPeriod,
  escalationRecoveryReason,
  escalationWorking,
  monthEnd,
  monthStart,
  periodsOverlap,
  priceIndexMonth,
  priceIndexValue,
  seriesName,
  workingSignature,
  type EscalationClauseTerms,
} from "./escalation";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

function details(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.details : null;
  }
}

/** Ten-thousandths: `ix(147)` = 1,470,000n. */
const ix = (value: number) => BigInt(Math.round(value * 10_000));
/** Rupees to paise. */
const rs = (value: number) => BigInt(Math.round(value * 100));

const TODAY = "2026-10-22";
const [M1, M2, M3] = ["2026-04-01", "2026-05-01", "2026-06-01"] as const;
const MONTHS = [M1, M2, M3];
const BASE = "2026-01-01";

/** A lookup over `{ series: { month: value } }`. */
function table(values: Record<string, Record<string, number>>) {
  return (series: string, month: string): bigint | null => {
    const value = values[series]?.[month];
    return value == null ? null : ix(value);
  };
}

function clause(
  components: EscalationClauseTerms["components"],
  nonEscalablePercent = 1500n,
): EscalationClauseTerms {
  return { baseMonth: BASE, nonEscalablePercent, components };
}

const weighted = (
  component: EscalationComponent,
  weight: number,
  series: string,
) => ({
  component,
  basis: "weighted" as const,
  weightPercent: BigInt(weight * 100),
  series,
  basePrice: null,
  materialId: null,
});

const R = [
  { id: "b1", number: "CB/1", billDate: "2026-04-30", gross: rs(4_00_000) },
  { id: "b2", number: "CB/2", billDate: "2026-06-15", gross: rs(6_00_000) },
];

describe("months", () => {
  it("reads YYYY-MM or the first of a month, and walks months", () => {
    expect(monthStart("2026-04")).toBe("2026-04-01");
    expect(monthStart("2026-04-01")).toBe("2026-04-01");
    expect(monthStart("2026-04-15")).toBeNull();
    expect(monthStart("2026-13")).toBeNull();
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
    expect(monthEnd("2026-04-01")).toBe("2026-04-30");
  });
});

describe("price indices (CM-1109)", () => {
  it("take a series name, a month and a value of more than 0 with four places", () => {
    expect(seriesName("  WPI –  Cement ")).toBe("WPI – Cement");
    expect(code(() => seriesName("  "))).toBe("PRICE_INDEX_SERIES_REQUIRED");
    expect(code(() => seriesName("x".repeat(81)))).toBe(
      "PRICE_INDEX_SERIES_TOO_LONG",
    );
    expect(priceIndexMonth("2026-04")).toBe("2026-04-01");
    expect(code(() => priceIndexMonth("April"))).toBe(
      "PRICE_INDEX_MONTH_INVALID",
    );
    expect(priceIndexValue("153.25")).toBe(ix(153.25));
    expect(priceIndexValue(140)).toBe(ix(140));
    expect(code(() => priceIndexValue("0"))).toBe("PRICE_INDEX_VALUE_INVALID");
    expect(code(() => priceIndexValue("1.23456"))).toBe(
      "PRICE_INDEX_VALUE_INVALID",
    );
    expect(code(() => priceIndexValue("100000000"))).toBe(
      "PRICE_INDEX_VALUE_INVALID",
    );
  });
});

describe("the escalation clause (CM-1109)", () => {
  const input = {
    baseMonth: "2026-01",
    components: [
      { component: "material", weightPercent: "50", series: "WPI" },
      { component: "labour", weightPercent: "30.00", series: "CPI-IW" },
      { component: "pol", weightPercent: 20, series: "WPI – HSD (POL)" },
    ],
  };

  it("defaults the non-escalable share to 15 % and orders the components", () => {
    const terms = escalationClause(input, { today: TODAY });
    expect(terms.baseMonth).toBe("2026-01-01");
    expect(terms.nonEscalablePercent).toBe(1500n);
    expect(terms.components.map((row) => row.component)).toEqual([
      "labour",
      "material",
      "pol",
    ]);
  });

  it("needs the weights to add up to 100", () => {
    const short = {
      ...input,
      components: input.components.slice(0, 2),
    };
    expect(code(() => escalationClause(short, { today: TODAY }))).toBe(
      "ESCALATION_WEIGHTS_NOT_100",
    );
    expect(details(() => escalationClause(short, { today: TODAY }))).toEqual({
      field: "components",
      total: "80.00",
    });
  });

  it("refuses duplicates, bad weights, a future base month and 10CA outside cement and steel", () => {
    const today = { today: TODAY };
    expect(
      code(() =>
        escalationClause(
          {
            ...input,
            components: [
              ...input.components,
              { component: "labour", weightPercent: "10", series: "X" },
            ],
          },
          today,
        ),
      ),
    ).toBe("ESCALATION_COMPONENT_DUPLICATE");
    expect(
      code(() =>
        escalationClause(
          {
            ...input,
            components: [
              { component: "labour", weightPercent: "0", series: "X" },
            ],
          },
          today,
        ),
      ),
    ).toBe("ESCALATION_WEIGHT_INVALID");
    expect(
      code(() => escalationClause({ ...input, baseMonth: "2026-11" }, today)),
    ).toBe("ESCALATION_BASE_MONTH_IN_FUTURE");
    expect(
      code(() =>
        escalationClause({ ...input, nonEscalablePercent: "100" }, today),
      ),
    ).toBe("ESCALATION_NON_ESCALABLE_INVALID");
    expect(
      code(() =>
        escalationClause(
          {
            ...input,
            components: [
              ...input.components,
              {
                component: "bitumen",
                basis: "quantity",
                basePrice: 100,
                series: "B",
              },
            ],
          },
          today,
        ),
      ),
    ).toBe("ESCALATION_BASIS_INVALID");
  });

  it("takes cement or steel on quantity with a base price and no weight", () => {
    const terms = escalationClause(
      {
        ...input,
        components: [
          ...input.components,
          {
            component: "cement",
            basis: "quantity",
            basePrice: 7_000_00,
            series: "WPI – Cement",
            weightPercent: "10",
          },
        ],
      },
      { today: TODAY },
    );
    expect(terms.components.find((row) => row.component === "cement")).toEqual({
      component: "cement",
      basis: "quantity",
      weightPercent: 0n,
      series: "WPI – Cement",
      basePrice: 7_000_00n,
      materialId: null,
    });
    expect(
      code(() =>
        escalationClause(
          {
            ...input,
            components: [
              ...input.components,
              { component: "steel", basis: "quantity", series: "WPI – Steel" },
            ],
          },
          { today: TODAY },
        ),
      ),
    ).toBe("ESCALATION_BASE_PRICE_INVALID");
  });
});

describe("the escalation period (CM-1109)", () => {
  const context = { baseMonth: BASE, billDate: "2026-07-05" };

  it("is whole months after the base month, ending by the bill date", () => {
    expect(
      escalationPeriod({ fromMonth: "2026-04", toMonth: "2026-06" }, context),
    ).toEqual({ from: "2026-04-01", to: "2026-06-30", months: MONTHS });
    expect(
      code(() =>
        escalationPeriod({ fromMonth: "2026-01", toMonth: "2026-02" }, context),
      ),
    ).toBe("ESCALATION_PERIOD_BEFORE_BASE");
    expect(
      code(() =>
        escalationPeriod({ fromMonth: "2026-06", toMonth: "2026-07" }, context),
      ),
    ).toBe("ESCALATION_PERIOD_AFTER_BILL_DATE");
    expect(
      code(() =>
        escalationPeriod({ fromMonth: "2026-05", toMonth: "2026-04" }, context),
      ),
    ).toBe("ESCALATION_PERIOD_INVALID");
    expect(
      code(() =>
        escalationPeriod(
          { fromMonth: "2026-02", toMonth: "2027-02" },
          { ...context, billDate: "2027-03-01" },
        ),
      ),
    ).toBe("ESCALATION_PERIOD_TOO_LONG");
  });

  it("overlaps when each starts by the other's end", () => {
    const q2 = { from: "2026-04-01", to: "2026-06-30" };
    expect(periodsOverlap(q2, { from: "2026-06-01", to: "2026-08-31" })).toBe(
      true,
    );
    expect(periodsOverlap(q2, { from: "2026-07-01", to: "2026-09-30" })).toBe(
      false,
    );
  });
});

describe("the 10CC working (CM-1109)", () => {
  const indices = table({
    "CPI-IW": {
      [BASE]: 140,
      [M1]: 147,
      [M2]: 147,
      [M3]: 147,
    },
    WPI: {
      [BASE]: 150,
      [M1]: 153,
      [M2]: 156,
      [M3]: 159,
    },
    "WPI – HSD (POL)": {
      [BASE]: 120,
      [M1]: 113,
      [M2]: 114,
      [M3]: 115,
    },
  });

  it("works the ticket's example: R ₹10,00,000, NE 15 % → gross ₹21,250", () => {
    const working = escalationWorking({
      clauseId: "c1",
      clause: clause([
        weighted("labour", 30, "CPI-IW"),
        weighted("material", 50, "WPI"),
        weighted("pol", 20, "WPI – HSD (POL)"),
      ]),
      bills: R,
      months: MONTHS,
      index: indices,
      quantities: new Map(),
    });
    expect(working.valueOfWork).toBe(rs(10_00_000));
    expect(working.escalableValue).toBe(rs(10_00_000));
    const [labour, material, pol] = working.components;
    // 85 % × 30 % × R × (147 − 140) / 140 = 85 % × 30 % × R × 5 %
    expect(labour).toMatchObject({
      baseIndex: ix(140),
      averageIndex: ix(147),
      factor: "0.050000",
      amount: rs(12_750),
    });
    // avg(153, 156, 159) = 156; (156 − 150) / 150 = 4 %
    expect(material).toMatchObject({
      averageIndex: ix(156),
      factor: "0.040000",
      amount: rs(17_000),
    });
    expect(material?.indices.map((row) => row.value)).toEqual([
      ix(153),
      ix(156),
      ix(159),
    ]);
    // avg(113, 114, 115) = 114; (114 − 120) / 120 = −5 %
    expect(pol).toMatchObject({
      averageIndex: ix(114),
      factor: "-0.050000",
      amount: -rs(8_500),
    });
    expect(working.gross).toBe(rs(21_250));
  });

  it("comes out negative when the indices fell", () => {
    const working = escalationWorking({
      clauseId: "c1",
      clause: clause([weighted("pol", 100, "WPI – HSD (POL)")]),
      bills: R,
      months: MONTHS,
      index: indices,
      quantities: new Map(),
    });
    // 85 % × 100 % × ₹10,00,000 × −5 % = −₹42,500
    expect(working.gross).toBe(-rs(42_500));
  });

  it("refuses a missing index, naming the series and the month", () => {
    const run = () =>
      escalationWorking({
        clauseId: "c1",
        clause: clause([weighted("labour", 100, "CPI-IW")]),
        bills: R,
        months: [...MONTHS, "2026-07-01"],
        index: indices,
        quantities: new Map(),
      });
    expect(code(run)).toBe("PRICE_INDEX_MISSING");
    expect(details(run)).toEqual({ series: "CPI-IW", month: "2026-07-01" });
  });

  it("rounds each component half away from zero, from the exact average", () => {
    // R = ₹1, NE 0, 100 % on 3 → avg(3, 3, 4) = 10/3: factor 1/9.
    const working = escalationWorking({
      clauseId: "c1",
      clause: clause([weighted("other", 100, "S")], 0n),
      bills: [{ id: "b", number: null, billDate: "2026-04-01", gross: 100n }],
      months: MONTHS,
      index: table({
        S: { [BASE]: 3, [M1]: 3, [M2]: 3, [M3]: 4 },
      }),
      quantities: new Map(),
    });
    // 100 paise × 1/9 = 11.11 → 11 paise; Ī shows 3.3333.
    expect(working.components[0]).toMatchObject({
      averageIndex: ix(3.3333),
      factor: "0.111111",
      amount: 11n,
    });
  });

  it("works cement on quantity (10CA) and takes its value out of R first", () => {
    const working = escalationWorking({
      clauseId: "c1",
      clause: clause([
        weighted("labour", 100, "CPI-IW"),
        {
          component: "cement",
          basis: "quantity",
          weightPercent: 0n,
          series: "WPI – Cement",
          basePrice: rs(7_000),
          materialId: null,
        },
      ]),
      bills: R,
      months: MONTHS,
      index: table({
        "CPI-IW": {
          [BASE]: 140,
          [M1]: 147,
          [M2]: 147,
          [M3]: 147,
        },
        "WPI – Cement": {
          [BASE]: 100,
          [M1]: 108,
          [M2]: 110,
          [M3]: 112,
        },
      }),
      quantities: new Map([["cement", 120_0000n]]),
    });
    // 120 × ₹7,000 = ₹8,40,000 of cement at base price; R' = ₹1,60,000.
    expect(working.quantityValue).toBe(rs(8_40_000));
    expect(working.escalableValue).toBe(rs(1_60_000));
    const [labour, cement] = working.components;
    // 85 % × 100 % × ₹1,60,000 × 5 % = ₹6,800
    expect(labour?.amount).toBe(rs(6_800));
    // 120 × ₹7,000 × (110 − 100) / 100 = ₹84,000
    expect(cement).toMatchObject({
      basis: "quantity",
      weightPercent: null,
      quantity: 120_0000n,
      basePrice: rs(7_000),
      averageIndex: ix(110),
      factor: "0.100000",
      amount: rs(84_000),
    });
    expect(working.gross).toBe(rs(90_800));
  });

  it("signs what must not move between drafting and approval", () => {
    const run = (gross: bigint) =>
      escalationWorking({
        clauseId: "c1",
        clause: clause([weighted("labour", 100, "CPI-IW")]),
        bills: [{ id: "b", number: null, billDate: "2026-04-01", gross }],
        months: MONTHS,
        index: indices,
        quantities: new Map(),
      });
    expect(workingSignature(run(100n))).toBe(workingSignature(run(100n)));
    expect(workingSignature(run(100n))).not.toBe(workingSignature(run(200n)));
  });

  it("names a recovery by the bill and its months", () => {
    expect(
      escalationRecoveryReason("CB/26-27/00004", "2026-04-01", "2026-06-30"),
    ).toBe("Escalation recovery on CB/26-27/00004 (Apr 2026 – Jun 2026)");
  });
});
