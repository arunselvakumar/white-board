import { describe, expect, it } from "vitest";

import {
  payeeKindOf,
  rateInForce,
  suggestTds,
  tdsOn,
  type TdsRate,
  type TdsSuggestionInput,
} from "./tds";

const rupees = (value: number) => BigInt(Math.round(value * 100));

const rate = (payeeKind: TdsRate["payeeKind"], percent: string): TdsRate => ({
  section: "194C",
  label: "194C",
  payeeKind,
  rate: percent,
  singleThreshold: rupees(30_000),
  aggregateThreshold: rupees(100_000),
  effectiveFrom: "2016-06-01",
});

const input = (over: Partial<TdsSuggestionInput>): TdsSuggestionInput => ({
  applicable: true,
  lowerRate: null,
  rate: rate("individual_huf", "1.00"),
  settled: rupees(10_000),
  gstShare: 0n,
  priorSettledInYear: 0n,
  priorUndeductedBaseInYear: 0n,
  ...over,
});

describe("payeeKindOf", () => {
  it("reads the PAN's fourth letter", () => {
    expect(payeeKindOf("ABCPE1234F")).toBe("individual_huf");
    expect(payeeKindOf("ABCHE1234F")).toBe("individual_huf");
    expect(payeeKindOf("ABCFE1234F")).toBe("other");
    expect(payeeKindOf("ABCCE1234F")).toBe("other");
  });

  it("treats no PAN as section 206AA", () => {
    expect(payeeKindOf(null)).toBe("no_pan");
    expect(payeeKindOf("  ")).toBe("no_pan");
  });
});

describe("rateInForce", () => {
  const rows: TdsRate[] = [
    rate("other", "2.00"),
    {
      ...rate("other", "2.00"),
      label: "393 (194C)",
      effectiveFrom: "2026-04-01",
    },
  ];

  it("takes the latest row on or before the date", () => {
    expect(rateInForce(rows, "194C", "other", "2026-03-31")?.label).toBe(
      "194C",
    );
    expect(rateInForce(rows, "194C", "other", "2026-04-01")?.label).toBe(
      "393 (194C)",
    );
    expect(rateInForce(rows, "194C", "other", "2015-01-01")).toBeNull();
  });
});

describe("tdsOn", () => {
  it("rounds half up to the rupee", () => {
    expect(tdsOn(rupees(31_050), "1.00")).toBe(rupees(311)); // 310.50 → 311
    expect(tdsOn(rupees(31_049), "1.00")).toBe(rupees(310)); // 310.49 → 310
    expect(tdsOn(rupees(50_000), "2.00")).toBe(rupees(1_000));
    expect(tdsOn(0n, "2.00")).toBe(0n);
  });
});

describe("suggestTds", () => {
  it("suggests nothing when TDS does not apply", () => {
    const result = suggestTds(
      input({ applicable: false, settled: rupees(50_000) }),
    );
    expect(result.amount).toBe(0n);
    expect(result.reason).toBe("not_applicable");
  });

  it("suggests nothing below both thresholds", () => {
    const result = suggestTds(input({ settled: rupees(30_000) }));
    expect(result.amount).toBe(0n);
    expect(result.reason).toBe("below_threshold");
  });

  it("deducts on a single payment above ₹30,000", () => {
    const result = suggestTds(input({ settled: rupees(30_001) }));
    expect(result.reason).toBe("single");
    expect(result.base).toBe(rupees(30_001));
    expect(result.amount).toBe(rupees(300));
  });

  it("catches up earlier payments when the year first passes ₹1,00,000", () => {
    const result = suggestTds(
      input({
        settled: rupees(20_000),
        priorSettledInYear: rupees(90_000),
        priorUndeductedBaseInYear: rupees(90_000),
      }),
    );
    expect(result.reason).toBe("aggregate_crossed");
    expect(result.catchUpBase).toBe(rupees(90_000));
    expect(result.base).toBe(rupees(110_000));
    expect(result.amount).toBe(rupees(1_100));
  });

  it("deducts on every payment once the year is past the aggregate", () => {
    const result = suggestTds(
      input({
        settled: rupees(5_000),
        priorSettledInYear: rupees(120_000),
        priorUndeductedBaseInYear: rupees(10_000),
      }),
    );
    expect(result.reason).toBe("aggregate");
    expect(result.catchUpBase).toBe(0n);
    expect(result.amount).toBe(rupees(50));
  });

  it("uses 20% without a PAN", () => {
    const result = suggestTds(
      input({ rate: rate("no_pan", "20.00"), settled: rupees(40_000) }),
    );
    expect(result.amount).toBe(rupees(8_000));
  });

  it("uses a lower-deduction certificate's rate", () => {
    const result = suggestTds(
      input({
        rate: rate("other", "2.00"),
        lowerRate: "0.50",
        settled: rupees(40_000),
      }),
    );
    expect(result.rate).toBe("0.50");
    expect(result.amount).toBe(rupees(200));
  });

  it("leaves the GST share out of the base", () => {
    const result = suggestTds(
      input({ settled: rupees(118_000), gstShare: rupees(18_000) }),
    );
    expect(result.reason).toBe("aggregate_crossed");
    expect(result.base).toBe(rupees(100_000));
    expect(result.amount).toBe(rupees(1_000));
  });

  it("never suggests more than the payment settles", () => {
    const result = suggestTds(
      input({
        rate: rate("no_pan", "20.00"),
        settled: rupees(20_000),
        priorSettledInYear: rupees(99_000),
        priorUndeductedBaseInYear: rupees(99_000),
      }),
    );
    expect(result.amount).toBe(rupees(20_000));
  });
});
