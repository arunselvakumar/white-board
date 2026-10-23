import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertBillAction,
  assertDeductions,
  assertWithinWorkOrder,
  billActions,
  billDeductions,
  billGst,
  billHeader,
  billLine,
  billNet,
  billValues,
  retentionSuggestion,
  rupees,
  unbilledLines,
} from "./contractor-bill";

/** Ten-thousandths. */
const q = (value: number) => BigInt(Math.round(value * 10_000));

function errorOf(run: () => unknown): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const line = (overrides: Partial<Parameters<typeof billLine>[0]> = {}) =>
  billLine({
    workOrderLineId: "line-1",
    itemNo: "1.1",
    description: "Excavation",
    uomId: "cum",
    rate: 333_33n,
    workOrderQuantity: q(100),
    previousQuantity: 0n,
    quantity: q(10),
    ...overrides,
  });

describe("bill lines: cumulative − previous", () => {
  it("bills a first bill at round(quantity × rate)", () => {
    const first = line({ quantity: q(10.5) });
    expect(first.cumulativeQuantity).toBe(q(10.5));
    expect(first.previousAmount).toBe(0n);
    // 10.5 × 333.33 = 3,499.965 → 3,499.97 (half up)
    expect(first.amount).toBe(3_499_97n);
  });

  it("bills a second bill as round(cumulative × rate) − round(previous × rate)", () => {
    const first = line({ quantity: q(10.5) });
    const second = line({ previousQuantity: q(10.5), quantity: q(10.5) });
    expect(second.cumulativeQuantity).toBe(q(21));
    // 21 × 333.33 = 6,999.93; previous 3,499.97 → 3,499.96
    expect(second.cumulativeAmount).toBe(6_999_93n);
    expect(second.amount).toBe(3_499_96n);
    // The two bills add up to the cumulative value exactly: no paisa drifts.
    expect(first.amount + second.amount).toBe(second.cumulativeAmount);
    const values = billValues([second]);
    expect(values).toEqual({
      cumulativeValue: 6_999_93n,
      previousValue: 3_499_97n,
      gross: 3_499_96n,
    });
  });

  it("re-values the previous quantity at the rate an amendment set", () => {
    const second = line({
      rate: 350_00n,
      previousQuantity: q(10),
      quantity: q(5),
    });
    expect(second.amount).toBe(1_750_00n);
  });

  it("refuses more than the Work Order line holds (WORK_ORDER_QUANTITY_EXCEEDED)", () => {
    const over = line({ previousQuantity: q(95), quantity: q(5.5) });
    const error = errorOf(() => {
      assertWithinWorkOrder([over]);
    });
    expect(error.code).toBe("WORK_ORDER_QUANTITY_EXCEEDED");
    expect(error.details).toEqual({
      lineId: "line-1",
      cumulative: "100.5000",
      workOrderQuantity: "100.0000",
    });
    expect(() => {
      assertWithinWorkOrder([
        line({ previousQuantity: q(95), quantity: q(5) }),
      ]);
    }).not.toThrow();
  });

  it("treats a removed Work Order line as holding nothing", () => {
    const error = errorOf(() => {
      assertWithinWorkOrder([line({ workOrderQuantity: null })]);
    });
    expect(error.code).toBe("WORK_ORDER_QUANTITY_EXCEEDED");
    expect(error.details).toMatchObject({ workOrderQuantity: "0.0000" });
  });

  it("lists the lines a Final bill leaves short", () => {
    expect(
      unbilledLines(
        [
          { id: "a", itemNo: "1", quantity: q(10) },
          { id: "b", itemNo: "2", quantity: q(5) },
        ],
        new Map([
          ["a", q(10)],
          ["b", q(4)],
        ]),
      ),
    ).toEqual([
      {
        workOrderLineId: "b",
        itemNo: "2",
        billed: q(4),
        workOrderQuantity: q(5),
      },
    ]);
  });
});

describe("retention", () => {
  it("suggests gross × retention %", () => {
    expect(
      retentionSuggestion({
        gross: 1_00_000_00n,
        retentionPercent: 500n,
        retentionCapPercent: null,
        workOrderValue: 10_00_000_00n,
        heldBefore: 0n,
      }),
    ).toEqual({
      byPercent: 5_000_00n,
      cap: null,
      heldBefore: 0n,
      suggested: 5_000_00n,
    });
  });

  it("cuts the suggestion to what the cap leaves on the Work Order", () => {
    const capped = retentionSuggestion({
      gross: 1_00_000_00n,
      retentionPercent: 1000n,
      retentionCapPercent: 500n,
      workOrderValue: 2_00_000_00n,
      heldBefore: 8_000_00n,
    });
    // Cap 5 % of ₹2,00,000 = ₹10,000; ₹8,000 held → ₹2,000 left.
    expect(capped.cap).toBe(10_000_00n);
    expect(capped.byPercent).toBe(10_000_00n);
    expect(capped.suggested).toBe(2_000_00n);
    const full = retentionSuggestion({
      gross: 1_00_000_00n,
      retentionPercent: 1000n,
      retentionCapPercent: 500n,
      workOrderValue: 2_00_000_00n,
      heldBefore: 12_000_00n,
    });
    expect(full.suggested).toBe(0n);
  });

  it("refuses retention above the suggestion", () => {
    const error = errorOf(() => {
      assertDeductions({
        deductions: [{ kind: "retention", amount: 2_000_01n }],
        gross: 1_00_000_00n,
        payableGst: 0n,
        retentionMax: 2_000_00n,
      });
    });
    expect(error.code).toBe("BILL_RETENTION_OVER_CAP");
    expect(error.details).toMatchObject({ max: 2_000_00 });
  });
});

describe("GST", () => {
  const base = {
    gross: 1_00_000_01n,
    gstRate: 1800n,
    reverseCharge: false,
  };

  it("splits CGST and SGST in the same state, CGST taking the odd paisa", () => {
    const gst = billGst({
      ...base,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    // 18 % of ₹1,00,000.01 = ₹18,000.0018 → ₹18,000.00
    expect(gst.total).toBe(18_000_00n);
    expect(gst).toMatchObject({
      supplyType: "intra_state",
      cgst: 9_000_00n,
      sgst: 9_000_00n,
      igst: 0n,
      payable: 18_000_00n,
    });
    const odd = billGst({
      ...base,
      gross: 1_05n,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    // 18 % of ₹1.05 = 18.9 paise → 19 paise: CGST 10, SGST 9.
    expect([odd.cgst, odd.sgst]).toEqual([10n, 9n]);
  });

  it("charges IGST across states and intra-state when a state is unknown", () => {
    expect(
      billGst({
        ...base,
        supplierStateCode: "29",
        placeOfSupplyStateCode: "33",
      }),
    ).toMatchObject({ supplyType: "inter_state", igst: 18_000_00n, cgst: 0n });
    expect(
      billGst({
        ...base,
        supplierStateCode: null,
        placeOfSupplyStateCode: "33",
      }).supplyType,
    ).toBe("intra_state");
  });

  it("shows reverse-charge GST but pays none of it to the Contractor", () => {
    const gst = billGst({
      ...base,
      reverseCharge: true,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    expect(gst.total).toBe(18_000_00n);
    expect(gst.payable).toBe(0n);
    expect(
      billNet({
        gross: 1_00_000_01n,
        payableGst: gst.payable,
        deductionsTotal: 5_000_00n,
      }),
    ).toBe(95_000_01n);
  });

  it("charges nothing when the Work Order sets no rate", () => {
    expect(
      billGst({
        gross: 1_000_00n,
        gstRate: null,
        reverseCharge: false,
        supplierStateCode: "33",
        placeOfSupplyStateCode: "33",
      }).total,
    ).toBe(0n);
  });
});

describe("deductions and net", () => {
  it("nets gross + GST − deductions", () => {
    expect(
      billNet({
        gross: 1_00_000_00n,
        payableGst: 18_000_00n,
        deductionsTotal: 7_500_00n,
      }),
    ).toBe(1_10_500_00n);
  });

  it("checks kinds, amounts and the reason for other", () => {
    expect(
      billDeductions([
        { kind: "retention", amount: 5_000_00 },
        { kind: "other", amount: 100_00, description: " Water charges " },
      ]),
    ).toEqual([
      {
        kind: "retention",
        amount: 5_000_00n,
        description: null,
        advanceId: null,
        escalationBillId: null,
        materialId: null,
      },
      {
        kind: "other",
        amount: 100_00n,
        description: "Water charges",
        advanceId: null,
        escalationBillId: null,
        materialId: null,
      },
    ]);
    expect(
      errorOf(() => billDeductions([{ kind: "other", amount: 1 }])).code,
    ).toBe("BILL_DEDUCTION_REASON_REQUIRED");
    expect(
      errorOf(() => billDeductions([{ kind: "retention", amount: 0 }])).code,
    ).toBe("BILL_DEDUCTION_AMOUNT_INVALID");
    expect(
      errorOf(() => billDeductions([{ kind: "escalation", amount: 1 }])).code,
    ).toBe("BILL_DEDUCTION_KIND_INVALID");
    // CM-1110: material deductions keep the Material they name; others drop it.
    expect(
      billDeductions([
        { kind: "material_reconciliation", amount: 1, materialId: " M1 " },
        { kind: "other", amount: 2, description: "x", materialId: "m2" },
      ]).map((row) => row.materialId),
    ).toEqual(["m1", null]);
    // CM-1108: a recovery keeps the advance it names; other kinds drop it.
    expect(
      billDeductions([
        { kind: "secured_advance_recovery", amount: 1, advanceId: " a1 " },
        { kind: "material_at_cost", amount: 2, advanceId: "a2" },
      ]),
    ).toEqual([
      {
        kind: "secured_advance_recovery",
        amount: 1n,
        description: null,
        advanceId: "a1",
        escalationBillId: null,
        materialId: null,
      },
      {
        kind: "material_at_cost",
        amount: 2n,
        description: null,
        advanceId: null,
        escalationBillId: null,
        materialId: null,
      },
    ]);
  });

  it("refuses deductions above gross + GST payable", () => {
    const error = errorOf(() => {
      assertDeductions({
        deductions: [{ kind: "material_at_cost", amount: 1_180_01n }],
        gross: 1_000_00n,
        payableGst: 180_00n,
        retentionMax: 0n,
      });
    });
    expect(error.code).toBe("BILL_DEDUCTIONS_TOO_LARGE");
    expect(error.details).toMatchObject({ max: 1_180_00 });
  });

  it("prints rupees the Indian way", () => {
    expect(rupees(1_23_45_678_90n)).toBe("1,23,45,678.90");
    expect(rupees(5n)).toBe("0.05");
  });
});

describe("header and life", () => {
  const context = { today: "2026-10-22", orderDate: "2026-10-01" };

  it("checks the dates", () => {
    expect(
      billHeader(
        { billDate: "2026-10-21", measuredUpTo: "2026-10-20", remarks: " " },
        context,
      ),
    ).toEqual({
      billDate: "2026-10-21",
      measuredUpTo: "2026-10-20",
      remarks: null,
      isFinal: false,
    });
    expect(
      errorOf(() =>
        billHeader(
          { billDate: "2026-10-23", measuredUpTo: "2026-10-20" },
          context,
        ),
      ).code,
    ).toBe("BILL_DATE_IN_FUTURE");
    expect(
      errorOf(() =>
        billHeader(
          { billDate: "2026-09-30", measuredUpTo: "2026-09-30" },
          context,
        ),
      ).code,
    ).toBe("BILL_DATE_BEFORE_ORDER_DATE");
    expect(
      errorOf(() =>
        billHeader(
          { billDate: "2026-10-20", measuredUpTo: "2026-10-21" },
          context,
        ),
      ).code,
    ).toBe("MEASURED_UP_TO_AFTER_BILL_DATE");
  });

  it("allows each action only in its status", () => {
    expect(billActions("draft")).toMatchObject({
      edit: true,
      refresh: true,
      delete: true,
      submit: true,
      approve: false,
      reverse: false,
    });
    expect(billActions("pending_approval")).toMatchObject({
      edit: false,
      approve: true,
      reject: true,
    });
    expect(billActions("approved")).toMatchObject({
      reverse: true,
      delete: false,
    });
    expect(billActions("reversed").reverse).toBe(false);
    const error = errorOf(() => {
      assertBillAction("approved", "delete");
    });
    expect(error.code).toBe("BILL_STATUS_INVALID");
    expect(error.details).toEqual({ status: "approved", action: "delete" });
  });
});
