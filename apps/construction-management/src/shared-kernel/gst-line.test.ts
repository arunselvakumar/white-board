import { describe, expect, it } from "vitest";

import {
  defaultSupplyType,
  documentTotals,
  gstinStateCode,
  lineAmounts,
  splitGst,
} from "./gst-line";

describe("lineAmounts", () => {
  it("prices 120 bags of cement at ₹385 with 18% GST inside one state", () => {
    expect(
      lineAmounts(
        { quantity: "120", unitRate: 38_500n, gstRate: "18" },
        "intra_state",
      ),
    ).toEqual({
      subTotal: 4_620_000n,
      discountAmount: 0n,
      taxable: 4_620_000n,
      cgst: 415_800n,
      sgst: 415_800n,
      igst: 0n,
      total: 5_451_600n,
    });
  });

  it("puts all GST on IGST across states", () => {
    const line = lineAmounts(
      { quantity: "2.5", unitRate: 6_250_000n, gstRate: "18" },
      "inter_state",
    );
    expect(line.subTotal).toBe(15_625_000n);
    expect(line.igst).toBe(2_812_500n);
    expect(line.cgst + line.sgst).toBe(0n);
    expect(line.total).toBe(18_437_500n);
  });

  it("takes a percent discount before GST and rounds half up per line", () => {
    // 3.333 kg × ₹10.01 = ₹33.36333 → 3336 paise; 2.5% → 83.4 → 83.
    const line = lineAmounts(
      {
        quantity: "3.333",
        unitRate: 1_001n,
        discount: { type: "percent", percent: "2.5" },
        gstRate: "5",
      },
      "intra_state",
    );
    expect(line.subTotal).toBe(3_336n);
    expect(line.discountAmount).toBe(83n);
    expect(line.taxable).toBe(3_253n);
    // 5% of 3253 = 162.65 → 163; CGST takes the odd paisa.
    expect(line).toMatchObject({ cgst: 82n, sgst: 81n, total: 3_416n });
  });

  it("takes an amount discount as typed", () => {
    const line = lineAmounts(
      {
        quantity: "10",
        unitRate: 10_000n,
        discount: { type: "amount", paise: 5_000n },
        gstRate: "28",
      },
      "intra_state",
    );
    expect(line.taxable).toBe(95_000n);
    expect(line.total).toBe(121_600n);
  });

  it("refuses a discount larger than the line, and bad numbers", () => {
    const base = { quantity: "1", unitRate: 100n };
    expect(() =>
      lineAmounts(
        { ...base, discount: { type: "amount", paise: 101n } },
        "intra_state",
      ),
    ).toThrow(expect.objectContaining({ code: "DISCOUNT_TOO_LARGE" }));
    expect(() =>
      lineAmounts(
        { ...base, discount: { type: "percent", percent: "101" } },
        "intra_state",
      ),
    ).toThrow(expect.objectContaining({ code: "DISCOUNT_INVALID" }));
    expect(() =>
      lineAmounts({ ...base, gstRate: "18.005" }, "intra_state"),
    ).toThrow(expect.objectContaining({ code: "GST_RATE_INVALID" }));
    expect(() =>
      lineAmounts({ ...base, quantity: "0" }, "intra_state"),
    ).toThrow(expect.objectContaining({ code: "QUANTITY_INVALID" }));
    expect(() =>
      lineAmounts({ ...base, quantity: "1.0001" }, "intra_state"),
    ).toThrow(expect.objectContaining({ code: "QUANTITY_INVALID" }));
  });
});

describe("documentTotals", () => {
  it("adds charges and takes the deduction off the items total", () => {
    const lines = [
      lineAmounts(
        { quantity: "120", unitRate: 38_500n, gstRate: "18" },
        "intra_state",
      ),
      lineAmounts(
        { quantity: "1", unitRate: 99n, gstRate: "18" },
        "intra_state",
      ),
    ];
    const totals = documentTotals(lines, {
      additionalCharges: 250_000n,
      deductionAmount: 1_600n,
    });
    expect(totals.itemsTotal).toBe(5_451_600n + 117n);
    expect(totals.cgstTotal).toBe(415_800n + 9n);
    expect(totals.sgstTotal).toBe(415_800n + 9n);
    expect(totals.grandTotal).toBe(5_451_717n + 250_000n - 1_600n);
  });

  it("refuses a deduction larger than the total", () => {
    expect(() => documentTotals([], { deductionAmount: 1n })).toThrow(
      expect.objectContaining({ code: "DEDUCTION_TOO_LARGE" }),
    );
  });
});

describe("supply type", () => {
  it("splits on state, and is intra-state when a state is unknown", () => {
    expect(defaultSupplyType("33", "33")).toBe("intra_state");
    expect(defaultSupplyType("29", "33")).toBe("inter_state");
    expect(defaultSupplyType(null, "33")).toBe("intra_state");
    expect(gstinStateCode("33AABCU9603R1ZM")).toBe("33");
    expect(splitGst(5n, "intra_state")).toEqual({
      cgst: 3n,
      sgst: 2n,
      igst: 0n,
    });
  });
});
