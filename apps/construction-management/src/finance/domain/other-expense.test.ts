import { describe, expect, it } from "vitest";

import { otherExpenseContent, otherExpenseEntry } from "./other-expense";

const base = {
  expenseDate: "2026-10-05",
  paymentCategoryId: "cat",
  accountId: "acc",
  mode: "cash" as const,
  amount: 45_000n,
};

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

describe("otherExpenseContent", () => {
  it("tidies the texts and keeps the amount in paise", () => {
    expect(
      otherExpenseContent({
        ...base,
        payeeName: "  Tea stall ",
        reference: " ",
        description: " Slab pour ",
      }),
    ).toEqual({
      ...base,
      payeeName: "Tea stall",
      reference: null,
      description: "Slab pour",
    });
  });

  it("keeps a cheque's number in the reference and asks for it", () => {
    expect(codeOf(() => otherExpenseContent({ ...base, mode: "cheque" }))).toBe(
      "CHEQUE_NUMBER_REQUIRED",
    );
    expect(codeOf(() => otherExpenseContent({ ...base, mode: "upi" }))).toBe(
      "REFERENCE_REQUIRED",
    );
    expect(
      otherExpenseContent({ ...base, mode: "cheque", reference: "000451" })
        .reference,
    ).toBe("000451");
  });

  it("refuses a bad date, amount or long text", () => {
    expect(
      codeOf(() => otherExpenseContent({ ...base, expenseDate: "5/10/2026" })),
    ).toBe("EXPENSE_DATE_INVALID");
    expect(codeOf(() => otherExpenseContent({ ...base, amount: 0n }))).toBe(
      "AMOUNT_INVALID",
    );
    expect(
      codeOf(() =>
        otherExpenseContent({ ...base, payeeName: "x".repeat(121) }),
      ),
    ).toBe("TEXT_TOO_LONG");
  });
});

describe("otherExpenseEntry", () => {
  it("is money out of the account with the Ledger Report's columns", () => {
    const content = otherExpenseContent({ ...base, payeeName: "Tea stall" });
    expect(
      otherExpenseEntry({
        id: "e1",
        number: "EXP/26-27/00001",
        projectId: "p1",
        content,
      }),
    ).toEqual({
      accountId: "acc",
      projectId: "p1",
      entryDate: "2026-10-05",
      kind: "payment",
      amount: -45_000n,
      mode: "cash",
      reference: null,
      paymentCategoryId: "cat",
      counterpartyKind: null,
      counterpartyId: null,
      counterpartyName: "Tea stall",
      documentNumber: "EXP/26-27/00001",
      narration: "Other Expense",
      sourceType: "other_expense",
      sourceId: "e1",
    });
  });
});
