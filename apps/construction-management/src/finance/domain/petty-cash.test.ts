import { describe, expect, it } from "vitest";

import {
  defaultPettyCashAccountName,
  pendingEffect,
  receiptEntryName,
  voucherContent,
  voucherEntries,
  type VoucherContent,
} from "./petty-cash";

const base: VoucherContent = {
  voucherType: "payment",
  voucherDate: "2026-10-08",
  projectId: "p1",
  counterparty: { kind: null, id: null, name: "  Tea stall " },
  toAccountId: null,
  paymentCategoryId: "c1",
  amount: 25_000n,
  paidFor: " Tea for the crew ",
  reference: "",
  description: null,
};

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

describe("petty-cash vouchers (CM-0017 §9)", () => {
  it("trims texts and keeps a typed name", () => {
    expect(voucherContent("a1", base)).toMatchObject({
      counterparty: { kind: null, id: null, name: "Tea stall" },
      paidFor: "Tea for the crew",
      reference: null,
    });
  });

  it("needs a category on a Payment or Receipt, and another account on a Transfer", () => {
    expect(
      codeOf(() => voucherContent("a1", { ...base, paymentCategoryId: null })),
    ).toBe("PAYMENT_CATEGORY_REQUIRED");
    expect(
      codeOf(() => voucherContent("a1", { ...base, voucherType: "transfer" })),
    ).toBe("TO_ACCOUNT_REQUIRED");
    expect(
      codeOf(() =>
        voucherContent("a1", {
          ...base,
          voucherType: "transfer",
          toAccountId: "a1",
        }),
      ),
    ).toBe("TO_ACCOUNT_SAME");
    // A Transfer drops any category it was sent.
    expect(
      voucherContent("a1", {
        ...base,
        voucherType: "transfer",
        toAccountId: "a2",
      }).paymentCategoryId,
    ).toBeNull();
    expect(codeOf(() => voucherContent("a1", { ...base, amount: 0n }))).toBe(
      "AMOUNT_INVALID",
    );
    expect(
      codeOf(() =>
        voucherContent("a1", {
          ...base,
          counterparty: { kind: "supplier", id: null, name: null },
        }),
      ),
    ).toBe("COUNTERPARTY_NOT_FOUND");
  });

  it("posts a Payment out, a Receipt in, and a Transfer on both accounts", () => {
    const voucher = {
      ...voucherContent("a1", base),
      id: "v1",
      number: "PC/26-27/00001",
      accountId: "a1",
    };
    expect(voucherEntries(voucher)).toEqual([
      expect.objectContaining({
        accountId: "a1",
        kind: "payment",
        amount: -25_000n,
        documentNumber: "PC/26-27/00001",
        narration: "Tea for the crew",
        paymentCategoryId: "c1",
        counterpartyName: "Tea stall",
        sourceType: "petty_cash_voucher",
        sourceId: "v1",
      }),
    ]);
    expect(
      voucherEntries({ ...voucher, voucherType: "receipt" }).map((entry) => [
        entry.kind,
        entry.amount,
      ]),
    ).toEqual([["receipt", 25_000n]]);
    expect(
      voucherEntries({
        ...voucher,
        voucherType: "transfer",
        toAccountId: "a2",
        paymentCategoryId: null,
      }).map((entry) => [entry.accountId, entry.kind, entry.amount]),
    ).toEqual([
      ["a1", "transfer_out", -25_000n],
      ["a2", "transfer_in", 25_000n],
    ]);
  });

  it("says what a pending voucher would do to each account", () => {
    const payment = {
      accountId: "a1",
      voucherType: "payment" as const,
      amount: 100n,
      toAccountId: null,
    };
    expect(pendingEffect(payment, "a1")).toBe(-100n);
    expect(pendingEffect({ ...payment, voucherType: "receipt" }, "a1")).toBe(
      100n,
    );
    const transfer = {
      ...payment,
      voucherType: "transfer" as const,
      toAccountId: "a2",
    };
    expect(pendingEffect(transfer, "a1")).toBe(-100n);
    expect(pendingEffect(transfer, "a2")).toBe(100n);
    expect(pendingEffect(transfer, "a3")).toBe(0n);
  });

  it("names accounts and receipt files", () => {
    expect(defaultPettyCashAccountName("Ravi Kumar")).toBe(
      "Petty cash — Ravi Kumar",
    );
    expect(receiptEntryName("PC/26-27/00012", 2, "Bill.JPG")).toBe(
      "PC-26-27-00012 2.jpg",
    );
    expect(receiptEntryName("PC/26-27/00012", 1, "scan")).toBe(
      "PC-26-27-00012 1",
    );
  });
});
