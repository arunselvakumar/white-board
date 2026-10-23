import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertMaterialDeductions,
  attributeIssue,
  capMaterialLines,
  fitsOnBill,
  roomOnBill,
  consumedQuantity,
  reconcileMaterial,
  reconciliationQuantityText,
  type AttributionCandidate,
  type ReconciledMaterialTerms,
} from "./material-reconciliation";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

/** Ten-thousandths: `q(100)` = 1,000,000n. */
const q = (value: number) => BigInt(Math.round(value * 10_000));
/** Thousandths: `t(700)` = 700,000n. */
const t = (value: number) => BigInt(Math.round(value * 1_000));

const PCC = "line-pcc";
const CEMENT: ReconciledMaterialTerms = {
  materialId: "cement",
  issueBasis: "free",
  issueRate: null,
  wastagePercent: 200n, // 2 %
  penalRate: 50_000n, // ₹500 a bag
  coefficients: [{ lineId: PCC, coefficient: q(6.34) }],
};

function statement(billed: number, issued: number, recoveredBefore = 0n) {
  const row = reconcileMaterial({
    material: CEMENT,
    billed: new Map([[PCC, q(billed)]]),
    issued: t(issued),
    returned: 0n,
    recoveredBefore,
    atCostDeductedBefore: 0n,
  });
  return {
    theoretical: reconciliationQuantityText(row.theoretical),
    allowed: reconciliationQuantityText(row.allowed),
    issued: reconciliationQuantityText(row.netIssued),
    excess: reconciliationQuantityText(row.excess),
    excessValue: row.excessValue,
    recoverySuggested: row.recoverySuggested,
    underUse: row.underUse,
  };
}

describe("reconcileMaterial: the worked example (PCC 175 cum, 6.34 bag/cum, 2 %, ₹500 a bag)", () => {
  it("bill 1: 100 cum billed, 700 bags issued → excess 53.32 bags, ₹26,660", () => {
    expect(statement(100, 700)).toEqual({
      theoretical: "634.000",
      allowed: "646.680",
      issued: "700.000",
      excess: "53.320",
      excessValue: 2_666_000n,
      recoverySuggested: 2_666_000n,
      underUse: false,
    });
  });

  it("bill 2: 120 cum cumulative, 790 bags → 13.984 bags, ₹6,992 cumulative and nothing more to recover", () => {
    expect(statement(120, 790, 2_666_000n)).toEqual({
      theoretical: "760.800",
      allowed: "776.016",
      issued: "790.000",
      excess: "13.984",
      excessValue: 699_200n,
      recoverySuggested: 0n,
      underUse: false,
    });
  });

  it("flags under-use below theoretical × (1 − wastage): 600 bags for 634 (limit 621.32)", () => {
    const row = statement(100, 600);
    expect(row.excess).toBe("0.000");
    expect(row.recoverySuggested).toBe(0n);
    expect(row.underUse).toBe(true);
    // 621.32 itself is not under-use.
    expect(statement(100, 621.32).underUse).toBe(false);
    expect(statement(100, 621.319).underUse).toBe(true);
  });

  it("nets returns off the issues", () => {
    const row = reconcileMaterial({
      material: CEMENT,
      billed: new Map([[PCC, q(100)]]),
      issued: t(700),
      returned: t(60),
      recoveredBefore: 0n,
      atCostDeductedBefore: 0n,
    });
    expect(reconciliationQuantityText(row.netIssued)).toBe("640.000");
    expect(row.excess).toBe(0n);
  });

  it("has no excess value without a penal rate", () => {
    const row = reconcileMaterial({
      material: { ...CEMENT, penalRate: null },
      billed: new Map([[PCC, q(100)]]),
      issued: t(700),
      returned: 0n,
      recoveredBefore: 0n,
      atCostDeductedBefore: 0n,
    });
    expect(row.excessValue).toBeNull();
    expect(row.recoverySuggested).toBe(0n);
  });

  it("values material issued at cost, less what earlier bills deducted", () => {
    const row = reconcileMaterial({
      material: { ...CEMENT, issueBasis: "at_cost", issueRate: 38_000n },
      billed: new Map([[PCC, q(100)]]),
      issued: t(700),
      returned: 0n,
      recoveredBefore: 0n,
      atCostDeductedBefore: 19_000_000n,
    });
    // 700 × ₹380 = ₹2,66,000; ₹1,90,000 deducted before.
    expect(row.atCostValue).toBe(26_600_000n);
    expect(row.atCostSuggested).toBe(7_600_000n);
  });

  it("adds lines up and rounds the 10CA quantity to ten-thousandths", () => {
    expect(
      consumedQuantity(
        [
          { lineId: "a", coefficient: q(6.34) },
          { lineId: "b", coefficient: q(0.0001) },
        ],
        new Map([
          ["a", q(20)],
          ["b", q(0.5)],
        ]),
      ),
    ).toBe(q(126.8001)); // 126.8 + 0.00005 → half up
  });
});

describe("attributeIssue", () => {
  const wo = (
    id: string,
    materials: string[],
    extra: Partial<AttributionCandidate> = {},
  ): AttributionCandidate => ({
    id,
    status: "issued",
    orderDate: "2026-06-01",
    closedOn: null,
    materialIds: new Set(materials),
    ...extra,
  });
  const issue = (workOrderId: string | null = null) => ({
    workOrderId,
    materialId: "cement",
    date: "2026-07-10",
  });

  it("counts an issue towards the Work Order its request names", () => {
    expect(attributeIssue(issue("wo-x"), [wo("wo-a", ["cement"])])).toEqual({
      how: "named",
      workOrderId: "wo-x",
    });
  });

  it("counts it towards the only Work Order listing the material", () => {
    expect(
      attributeIssue(issue(), [wo("wo-a", ["cement"]), wo("wo-b", ["steel"])]),
    ).toEqual({ how: "auto", workOrderId: "wo-a" });
  });

  it("leaves it unattributed with several or none", () => {
    expect(
      attributeIssue(issue(), [wo("wo-a", ["cement"]), wo("wo-b", ["cement"])]),
    ).toEqual({
      how: "unattributed",
      workOrderId: null,
      candidates: ["wo-a", "wo-b"],
    });
    expect(attributeIssue(issue(), [wo("wo-b", ["steel"])]).how).toBe(
      "unattributed",
    );
  });

  it("ignores Work Orders not open on the issue's date", () => {
    const later = wo("wo-later", ["cement"], { orderDate: "2026-08-01" });
    const closed = wo("wo-closed", ["cement"], {
      status: "closed",
      closedOn: "2026-07-01",
    });
    const cancelled = wo("wo-cancelled", ["cement"], { status: "cancelled" });
    expect(
      attributeIssue(issue(), [
        wo("wo-a", ["cement"]),
        later,
        closed,
        cancelled,
      ]),
    ).toEqual({ how: "auto", workOrderId: "wo-a" });
    expect(
      attributeIssue(issue(), [
        wo("wo-a", ["cement"], { status: "closed", closedOn: "2026-07-10" }),
      ]).how,
    ).toBe("auto");
  });
});

describe("assertMaterialDeductions", () => {
  const limits = [
    {
      materialId: "cement",
      materialName: "Cement",
      issueBasis: "free" as const,
      recoverySuggested: 2_666_000n,
    },
    {
      materialId: "steel",
      materialName: "Steel",
      issueBasis: "at_cost" as const,
      recoverySuggested: 0n,
    },
  ];
  const row = (
    kind: string,
    amount: bigint,
    materialId: string | null,
    description: string | null = null,
  ) => ({ kind, amount, materialId, description });
  const check = (
    rows: ReturnType<typeof row>[],
    mayExceed = false,
    checkLimit = true,
  ) =>
    code(() => {
      assertMaterialDeductions(rows, limits, { mayExceed, checkLimit });
    });

  it("takes a recovery up to its suggestion", () => {
    expect(check([row("material_reconciliation", 2_666_000n, "cement")])).toBe(
      null,
    );
    expect(check([row("material_reconciliation", 100n, "cement")])).toBe(null);
  });

  it("refuses a recovery without its material, or a material not on the Work Order", () => {
    expect(check([row("material_reconciliation", 1n, null)])).toBe(
      "BILL_MATERIAL_REQUIRED",
    );
    expect(check([row("material_reconciliation", 1n, "sand")])).toBe(
      "BILL_MATERIAL_INVALID",
    );
    expect(check([row("material_at_cost", 1n, "cement")])).toBe(
      "BILL_MATERIAL_INVALID",
    );
    expect(check([row("material_at_cost", 1n, null)])).toBe(null);
  });

  it("refuses a material twice under one kind", () => {
    expect(
      check([
        row("material_reconciliation", 1n, "cement"),
        row("material_reconciliation", 2n, "cement"),
      ]),
    ).toBe("BILL_MATERIAL_DUPLICATE");
  });

  it("goes above the suggestion only with a reason and Approve", () => {
    const over = row("material_reconciliation", 2_666_001n, "cement");
    expect(check([over], true)).toBe("BILL_MATERIAL_RECOVERY_REASON_REQUIRED");
    const reasoned = { ...over, description: "Theft at site, agreed" };
    expect(check([reasoned])).toBe("BILL_MATERIAL_RECOVERY_OVER_SUGGESTION");
    expect(check([reasoned], true)).toBe(null);
    expect(check([over], false, false)).toBe(null);
  });
});

describe("capping material recoveries to what the bill can take", () => {
  // The walkthrough's RA-3: gross ₹2,400, GST ₹432, retention ₹180, an
  // advance recovery of ₹240, and ₹6,992 of cement recovery due.
  const deductions = [
    { kind: "retention", amount: 180_00n, materialId: null },
    { kind: "mobilisation_recovery", amount: 240_00n, materialId: null },
    {
      kind: "material_reconciliation",
      amount: 6_992_00n,
      materialId: "cement",
    },
  ];

  it("offers min(due, gross + GST payable − the other deductions)", () => {
    const room = roomOnBill({
      gross: 2_400_00n,
      payableGst: 432_00n,
      deductions,
      except: { kind: "material_reconciliation", materialId: "cement" },
    });
    expect(room).toBe(2_412_00n);
    expect(fitsOnBill(6_992_00n, room)).toBe(2_412_00n);
    expect(fitsOnBill(1_000_00n, room)).toBe(1_000_00n);
    expect(fitsOnBill(1_000_00n, -5n)).toBe(0n);
    expect(roomOnBill({ gross: 100n, payableGst: 0n, deductions })).toBe(0n);
  });

  it("trims reasonless material lines, last first, on a refresh", () => {
    const rows = [
      ...deductions.slice(0, 2).map((row) => ({ ...row, description: null })),
      {
        kind: "material_reconciliation",
        amount: 2_000_00n,
        materialId: "cement",
        description: null,
      },
      {
        kind: "material_at_cost",
        amount: 1_000_00n,
        materialId: "steel",
        description: null,
      },
    ];
    // Room for ₹2,832 in all: ₹420 other, so ₹2,412 of material; at cost goes first.
    expect(
      capMaterialLines(rows, 2_832_00n).map((row) => [row.kind, row.amount]),
    ).toEqual([
      ["retention", 180_00n],
      ["mobilisation_recovery", 240_00n],
      ["material_reconciliation", 2_000_00n],
      ["material_at_cost", 412_00n],
    ]);
    expect(
      capMaterialLines(rows, 2_000_00n).map((row) => [row.kind, row.amount]),
    ).toEqual([
      ["retention", 180_00n],
      ["mobilisation_recovery", 240_00n],
      ["material_reconciliation", 1_580_00n],
    ]);
    // A line with a reason is not trimmed: the total stays too large.
    const reasoned = rows.map((row) => ({ ...row, description: "agreed" }));
    expect(capMaterialLines(reasoned, 100n)).toHaveLength(4);
  });
});
