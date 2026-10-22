import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertBilledLinesKept,
  assertWorkOrderAction,
  defaultCoefficient,
  defaultTdsNature,
  overRemaining,
  overRemainingMessage,
  remainingQuantity,
  resolvedCoefficients,
  workOrderActions,
  workOrderHeader,
  workOrderLine,
  workOrderLineAmount,
  workOrderMaterial,
  workOrderTerms,
  workOrderValue,
  type WorkOrderLineInput,
} from "./work-order";

const UOM = "0199c0de-0000-7000-8000-000000000001";
const ITEM_A = "0199c0de-0000-7000-8000-00000000000a";
const ITEM_B = "0199c0de-0000-7000-8000-00000000000b";
const LIBRARY = "0199c0de-0000-7000-8000-0000000000c1";
const CEMENT = "0199c0de-0000-7000-8000-0000000000d1";
const STEEL = "0199c0de-0000-7000-8000-0000000000d2";

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

function detailsOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.details;
    throw error;
  }
  return null;
}

const line: WorkOrderLineInput = {
  kind: "non_boq",
  boqItemId: null,
  itemNo: " NB-1 ",
  description: "  Shuttering labour  ",
  uomId: UOM,
  sacHsn: "9954",
  quantity: "12.5",
  rate: 450_00,
};

describe("Work Order value (CM-1104)", () => {
  it("rounds each line half up and adds the rounded lines", () => {
    // 1.0005 × ₹1.00 = 100.05 paise → 100; 0.0005 × ₹10 = 0.5 paise → 1.
    expect(workOrderLineAmount({ quantity: 10_005n, rate: 100n })).toBe(100n);
    expect(workOrderLineAmount({ quantity: 5n, rate: 1000n })).toBe(1n);
    expect(
      workOrderValue([
        { quantity: 10_005n, rate: 100n },
        { quantity: 5n, rate: 1000n },
        { quantity: 125_000n, rate: 450_00n },
      ]),
    ).toBe(100n + 1n + 562_500n);
    expect(workOrderValue([])).toBe(0n);
  });

  it("checks a line and names it by index", () => {
    expect(workOrderLine(line, 0)).toEqual({
      kind: "non_boq",
      boqItemId: null,
      itemNo: "NB-1",
      description: "Shuttering labour",
      uomId: UOM,
      sacHsn: "9954",
      quantity: 125_000n,
      rate: 450_00n,
    });
    expect(codeOf(() => workOrderLine({ ...line, quantity: "0" }, 2))).toBe(
      "BOQ_QUANTITY_INVALID",
    );
    expect(
      detailsOf(() => workOrderLine({ ...line, quantity: "0" }, 2)),
    ).toEqual({ line: 2, field: "lines.2.quantity" });
    expect(codeOf(() => workOrderLine({ ...line, rate: -1 }, 0))).toBe(
      "BOQ_RATE_INVALID",
    );
    expect(codeOf(() => workOrderLine({ ...line, description: " " }, 0))).toBe(
      "WORK_ORDER_LINE_DESCRIPTION_REQUIRED",
    );
    expect(codeOf(() => workOrderLine({ ...line, sacHsn: "99" }, 0))).toBe(
      "SAC_HSN_INVALID",
    );
    expect(
      codeOf(() => workOrderLine({ ...line, kind: "boq", boqItemId: null }, 0)),
    ).toBe("WORK_ORDER_BOQ_ITEM_REQUIRED");
    expect(
      codeOf(() =>
        workOrderLine(
          { ...line, quantity: "100000000", rate: 2_000_000_00 },
          0,
        ),
      ),
    ).toBe("BOQ_AMOUNT_TOO_LARGE");
  });
});

describe("remaining BOQ quantity (CM-1104)", () => {
  const boqItems = new Map([
    [ITEM_A, { itemNo: "1.1", quantity: 100_0000n }],
    [ITEM_B, { itemNo: "1.2", quantity: 50_0000n }],
  ]);

  it("is the current quantity less other Work Orders' lines, and may go negative", () => {
    expect(remainingQuantity(100_0000n, 40_0000n)).toBe(60_0000n);
    expect(remainingQuantity(100_0000n, 120_0000n)).toBe(-20_0000n);
  });

  it("warns per BOQ item when this Work Order's lines add up to more than is left", () => {
    const lines = [
      { kind: "boq" as const, boqItemId: ITEM_A, quantity: 40_0000n },
      { kind: "boq" as const, boqItemId: ITEM_A, quantity: 30_0000n },
      { kind: "boq" as const, boqItemId: ITEM_B, quantity: 50_0000n },
      { kind: "non_boq" as const, boqItemId: null, quantity: 999_0000n },
    ];
    const over = overRemaining(lines, boqItems, new Map([[ITEM_A, 40_0000n]]));
    expect(over).toEqual([
      {
        boqItemId: ITEM_A,
        itemNo: "1.1",
        ordered: 70_0000n,
        remaining: 60_0000n,
      },
    ]);
    const [first] = over;
    if (first == null) throw new Error("No warning");
    expect(overRemainingMessage(first)).toBe(
      "BOQ item 1.1: ordering 70, the BOQ has 60 left after other Work Orders.",
    );
    expect(
      overRemainingMessage({
        boqItemId: ITEM_B,
        itemNo: "1.2",
        ordered: 5_0000n,
        remaining: -2_5000n,
      }),
    ).toBe(
      "BOQ item 1.2: ordering 5, the BOQ has nothing left after other Work Orders.",
    );
    // Exactly what is left is no warning.
    expect(
      overRemaining(
        [{ kind: "boq", boqItemId: ITEM_B, quantity: 50_0000n }],
        boqItems,
        new Map(),
      ),
    ).toEqual([]);
  });
});

describe("coefficients (CM-1104, CM-0023 §10)", () => {
  const analysis = new Map([
    [
      LIBRARY,
      new Map([
        [CEMENT, 6_3000n],
        [STEEL, 1200n],
      ]),
    ],
  ]);

  it("default from the line's library Item rate analysis", () => {
    expect(defaultCoefficient(analysis, LIBRARY, CEMENT)).toBe(6_3000n);
    expect(defaultCoefficient(analysis, LIBRARY, "other")).toBeNull();
    expect(defaultCoefficient(analysis, null, CEMENT)).toBeNull();
  });

  it("keep what the form sent, blank as none, and default the lines it left out", () => {
    const material = workOrderMaterial(
      {
        materialId: CEMENT,
        issueBasis: "free",
        wastagePercent: "2.5",
        coefficients: [
          { line: 1, coefficient: "7" },
          { line: 2, coefficient: "" },
        ],
      },
      0,
      4,
    );
    expect(material.wastagePercent).toBe(250n);
    const resolved = resolvedCoefficients(
      material,
      [LIBRARY, LIBRARY, LIBRARY, null],
      analysis,
    );
    expect([...resolved]).toEqual([
      [0, 6_3000n],
      [1, 7_0000n],
    ]);
  });

  it("checks material rows", () => {
    expect(
      codeOf(() =>
        workOrderMaterial({ materialId: CEMENT, issueBasis: "at_cost" }, 0, 1),
      ),
    ).toBe("ISSUE_RATE_INVALID");
    expect(
      workOrderMaterial(
        { materialId: CEMENT, issueBasis: "free", issueRate: 380_00 },
        0,
        1,
      ).issueRate,
    ).toBeNull();
    expect(
      codeOf(() =>
        workOrderMaterial(
          {
            materialId: CEMENT,
            issueBasis: "free",
            coefficients: [{ line: 3, coefficient: "1" }],
          },
          0,
          2,
        ),
      ),
    ).toBe("COEFFICIENT_LINE_INVALID");
    expect(
      codeOf(() =>
        workOrderMaterial(
          {
            materialId: CEMENT,
            issueBasis: "free",
            coefficients: [{ line: 0, coefficient: "-1" }],
          },
          0,
          1,
        ),
      ),
    ).toBe("COEFFICIENT_INVALID");
  });
});

describe("terms and header (CM-1104, CM-0023 §5, §14)", () => {
  it("defaults retention, its release and the TDS nature", () => {
    const terms = workOrderTerms({}, defaultTdsNature({ tdsApplicable: true }));
    expect(terms).toMatchObject({
      retentionPercent: 0n,
      retentionCapPercent: null,
      retentionCompletionPercent: 5000n,
      tdsNature: "contractor",
      reverseCharge: false,
    });
    expect(defaultTdsNature({ tdsApplicable: false })).toBeNull();
    expect(workOrderTerms({ tdsNature: null }, "contractor").tdsNature).toBe(
      null,
    );
  });

  it("checks each term", () => {
    const terms = workOrderTerms(
      {
        retentionPercent: "5",
        retentionCapPercent: 5,
        dlpMonths: 12,
        tdsNature: "technical",
        sacCode: "9954",
        gstRate: "18",
        reverseCharge: true,
        mobilisationAdvance: 5_00_000_00,
        mobilisationRecoveryPercent: "10",
      },
      null,
    );
    expect(terms).toEqual({
      retentionPercent: 500n,
      retentionCapPercent: 500n,
      retentionCompletionPercent: 5000n,
      dlpMonths: 12,
      tdsNature: "technical",
      sacCode: "9954",
      gstRate: 1800n,
      reverseCharge: true,
      mobilisationAdvance: 5_00_000_00n,
      mobilisationRecoveryPercent: 1000n,
    });
    expect(
      codeOf(() => workOrderTerms({ retentionPercent: "101" }, null)),
    ).toBe("RETENTION_PERCENT_INVALID");
    expect(codeOf(() => workOrderTerms({ dlpMonths: 121 }, null))).toBe(
      "DLP_MONTHS_INVALID",
    );
    expect(codeOf(() => workOrderTerms({ gstRate: "28.01" }, null))).toBe(
      "GST_RATE_INVALID",
    );
    expect(workOrderTerms({ gstRate: "12.5" }, null).gstRate).toBe(1250n);
    expect(codeOf(() => workOrderTerms({ tdsNature: "salary" }, null))).toBe(
      "TDS_NATURE_INVALID",
    );
    expect(codeOf(() => workOrderTerms({ sacCode: "99a" }, null))).toBe(
      "SAC_HSN_INVALID",
    );
  });

  it("keeps valid until on or after the order date", () => {
    expect(
      workOrderHeader({
        orderDate: "2026-10-01",
        validUntil: "2026-10-01",
        scope: "  Block A RCC  ",
      }),
    ).toEqual({
      orderDate: "2026-10-01",
      validUntil: "2026-10-01",
      scope: "Block A RCC",
    });
    expect(
      codeOf(() =>
        workOrderHeader({ orderDate: "2026-10-02", validUntil: "2026-10-01" }),
      ),
    ).toBe("VALID_UNTIL_BEFORE_ORDER_DATE");
    expect(codeOf(() => workOrderHeader({ orderDate: "02-10-2026" }))).toBe(
      "WORK_ORDER_DATE_INVALID",
    );
  });
});

describe("transitions (CM-1104)", () => {
  it("allows each action only in its status", () => {
    expect(workOrderActions("draft")).toMatchObject({
      edit: true,
      delete: true,
      submit: true,
      amend: false,
      close: false,
      cancel: true,
      approve: false,
    });
    expect(workOrderActions("pending_approval")).toMatchObject({
      edit: false,
      submit: false,
      cancel: false,
      approve: true,
      reject: true,
    });
    expect(workOrderActions("issued")).toMatchObject({
      edit: false,
      amend: true,
      close: true,
      cancel: true,
    });
    for (const status of ["closed", "cancelled"] as const)
      expect(Object.values(workOrderActions(status)).some(Boolean)).toBe(false);
    expect(
      codeOf(() => {
        assertWorkOrderAction("issued", "edit");
      }),
    ).toBe("WORK_ORDER_STATUS_INVALID");
    expect(
      detailsOf(() => {
        assertWorkOrderAction("closed", "cancel");
      }),
    ).toEqual({
      status: "closed",
      action: "cancel",
    });
    expect(
      codeOf(() => {
        assertWorkOrderAction("draft", "amend");
      }),
    ).toBe("WORK_ORDER_STATUS_INVALID");
    expect(
      codeOf(() => {
        assertWorkOrderAction("issued", "close");
      }),
    ).toBe("none");
  });

  it("keeps billed lines at or above what was billed", () => {
    const billed = new Map([["line-1", 40_0000n]]);
    const itemNos = new Map([["line-1", "1.1"]]);
    expect(
      codeOf(() => {
        assertBilledLinesKept(
          [{ id: "line-1", quantity: 40_0000n }],
          billed,
          itemNos,
        );
      }),
    ).toBe("none");
    expect(
      codeOf(() => {
        assertBilledLinesKept(
          [{ id: "line-2", quantity: 1n }],
          billed,
          itemNos,
        );
      }),
    ).toBe("WORK_ORDER_LINE_BILLED");
    expect(
      detailsOf(() => {
        assertBilledLinesKept(
          [{ id: "line-1", quantity: 39_0000n }],
          billed,
          itemNos,
        );
      }),
    ).toEqual({ lineId: "line-1", billed: "40.0000" });
  });
});
