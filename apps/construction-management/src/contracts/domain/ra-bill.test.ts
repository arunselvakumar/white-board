import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { clientBillLine, clientRetentionSuggestion } from "./client-bill";
import { billLine, retentionSuggestion } from "./contractor-bill";
import {
  assertBillAction,
  assertRaDeductions,
  billGst,
  billNet,
  billValues,
  lineFigures,
  raBillHeader,
  raRetentionSuggestion,
  storedBillGst,
  sumRowsBy,
} from "./ra-bill";

function code(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "OTHER";
  }
}

/** Ten-thousandths: `q(12.5)` = 125000n. */
const q = (value: number) => BigInt(Math.round(value * 10_000));

describe("the RA bill engine both sides share (CM-1107)", () => {
  it("bills cumulative − previous, each rounded half up, the same on both sides", () => {
    const shared = { rate: 333_33n, previousQuantity: q(1.5), quantity: q(2) };
    const figures = lineFigures(shared);
    // round(3.5 × 333.33) = 1166.66 (116,665.5 paise → 116,666), round(1.5 × 333.33) = 499.995 → 500.00
    expect(figures).toEqual({
      cumulativeQuantity: q(3.5),
      cumulativeAmount: 1_166_66n,
      previousAmount: 500_00n,
      amount: 666_66n,
    });
    const contractor = billLine({
      ...shared,
      workOrderLineId: "l1",
      itemNo: "1.1",
      description: "PCC",
      uomId: "u",
      workOrderQuantity: q(10),
    });
    const client = clientBillLine({
      ...shared,
      boqItemId: "b1",
      itemNo: "1.1",
      description: "PCC",
      uomId: "u",
      boqQuantity: q(10),
    });
    expect(contractor.amount).toBe(figures.amount);
    expect(client.amount).toBe(figures.amount);
    expect(billValues([contractor, client])).toEqual({
      cumulativeValue: 2_333_32n,
      previousValue: 1_000_00n,
      gross: 1_333_32n,
    });
  });

  it("sums rows per line key, deductions included", () => {
    const sums = sumRowsBy(
      [
        { key: "a", quantity: q(2) },
        { key: "b", quantity: q(1) },
        { key: "a", quantity: q(-0.5) },
      ],
      (row) => row.key,
    );
    expect([...sums]).toEqual([
      ["a", q(1.5)],
      ["b", q(1)],
    ]);
  });

  it("caps retention against the contract's value on both sides alike", () => {
    const common = {
      gross: 10_00_000_00n,
      retentionPercent: 500n,
      retentionCapPercent: 500n,
      heldBefore: 4_80_000_00n,
    };
    const shared = raRetentionSuggestion({
      ...common,
      contractValue: 1_00_00_000_00n,
    });
    expect(shared).toEqual({
      byPercent: 50_000_00n,
      cap: 5_00_000_00n,
      heldBefore: 4_80_000_00n,
      suggested: 20_000_00n,
    });
    expect(
      retentionSuggestion({ ...common, workOrderValue: 1_00_00_000_00n }),
    ).toEqual(shared);
    expect(
      clientRetentionSuggestion({ ...common, boqValue: 1_00_00_000_00n }),
    ).toEqual(shared);
  });

  it("splits GST by state: same state CGST + SGST (CGST the odd paisa), else IGST", () => {
    const intra = billGst({
      gross: 1_00_001n,
      gstRate: 1800n,
      reverseCharge: false,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    expect(intra).toMatchObject({
      supplyType: "intra_state",
      total: 18_000n,
      cgst: 9_000n,
      sgst: 9_000n,
      igst: 0n,
      payable: 18_000n,
    });
    const odd = billGst({
      gross: 1_00_005n,
      gstRate: 1800n,
      reverseCharge: false,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    expect([odd.total, odd.cgst, odd.sgst]).toEqual([18_001n, 9_001n, 9_000n]);
    const inter = billGst({
      gross: 1_00_000_00n,
      gstRate: 1800n,
      reverseCharge: false,
      supplierStateCode: "29",
      placeOfSupplyStateCode: "33",
    });
    expect(inter).toMatchObject({
      supplyType: "inter_state",
      igst: 18_000_00n,
      cgst: 0n,
    });
    const rcm = billGst({
      gross: 1_00_000_00n,
      gstRate: 1800n,
      reverseCharge: true,
      supplierStateCode: "33",
      placeOfSupplyStateCode: "33",
    });
    expect([rcm.total, rcm.payable]).toEqual([18_000_00n, 0n]);
    expect(storedBillGst({ ...inter, gstRate: 1800n })).toEqual(inter);
  });

  it("keeps the net from going negative and names the contract in the cap message", () => {
    expect(
      code(() => {
        assertRaDeductions({
          deductions: [{ kind: "other", amount: 1_19_00n }],
          gross: 1_00_00n,
          payableGst: 18_00n,
          retentionMax: 0n,
          contract: "client contract",
        });
      }),
    ).toBe("BILL_DEDUCTIONS_TOO_LARGE");
    try {
      assertRaDeductions({
        deductions: [{ kind: "retention", amount: 1n }],
        gross: 1_00_00n,
        payableGst: 0n,
        retentionMax: 0n,
        contract: "client contract",
      });
    } catch (error) {
      expect((error as DomainError).code).toBe("BILL_RETENTION_OVER_CAP");
      expect((error as Error).message).toContain("client contract");
    }
    expect(
      billNet({ gross: 1_00_00n, payableGst: 18_00n, deductionsTotal: 5_00n }),
    ).toBe(1_13_00n);
  });

  it("checks dates and life the same way for both sides", () => {
    expect(
      code(() =>
        raBillHeader(
          { billDate: "2026-10-23", measuredUpTo: "2026-10-20" },
          { today: "2026-10-22" },
        ),
      ),
    ).toBe("BILL_DATE_IN_FUTURE");
    expect(
      code(() =>
        raBillHeader(
          { billDate: "2026-10-01", measuredUpTo: "2026-10-01" },
          {
            today: "2026-10-22",
            notBefore: {
              date: "2026-10-05",
              code: "BILL_DATE_BEFORE_ORDER_DATE",
              message: "x",
            },
          },
        ),
      ),
    ).toBe("BILL_DATE_BEFORE_ORDER_DATE");
    expect(
      code(() => {
        assertBillAction("approved", "edit");
      }),
    ).toBe("BILL_STATUS_INVALID");
    expect(
      code(() => {
        assertBillAction("approved", "reverse");
      }),
    ).toBeNull();
  });
});
