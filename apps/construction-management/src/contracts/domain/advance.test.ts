import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  addMonths,
  advanceBalance,
  advanceFields,
  advanceWarnings,
  assertRecoveries,
  completionDate,
  dlpPeriod,
  dueSoon,
  guaranteeFields,
  guaranteeStatus,
  recoveriesByAdvance,
  recoveryRule,
  recoverySuggestion,
  releaseFields,
  retentionPosition,
  suggestedRecoveries,
  type DlpPeriod,
  type RecoverableAdvance,
} from "./advance";

function errorOf(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const TODAY = "2026-10-22";

const advance = (
  overrides: Partial<RecoverableAdvance> = {},
): RecoverableAdvance => ({
  id: "a1",
  kind: "mobilisation",
  amount: 1_00_000_00n,
  advanceOn: "2026-09-01",
  recoveryMode: "percent",
  recoveryValue: 10_00n,
  recovered: 0n,
  paymentId: "p1",
  ...overrides,
});

describe("advances (CM-1108)", () => {
  it("checks a new advance and takes the Work Order's recovery % when blank", () => {
    expect(
      advanceFields(
        {
          kind: "mobilisation",
          amount: 1_00_000_00,
          advanceOn: "2026-10-01",
          recoveryMode: "percent",
          remarks: "  Site set-up ",
        },
        { today: TODAY, defaultPercent: 10_00n },
      ),
    ).toEqual({
      kind: "mobilisation",
      amount: 1_00_000_00n,
      advanceOn: "2026-10-01",
      recoveryMode: "percent",
      recoveryValue: 10_00n,
      remarks: "Site set-up",
    });
    // A secured advance never takes the mobilisation %.
    expect(
      errorOf(() =>
        advanceFields(
          {
            kind: "secured",
            amount: 100,
            advanceOn: TODAY,
            recoveryMode: "percent",
          },
          { today: TODAY, defaultPercent: 10_00n },
        ),
      ).code,
    ).toBe("RECOVERY_VALUE_REQUIRED");
    const bad = (input: Partial<Parameters<typeof advanceFields>[0]>) =>
      errorOf(() =>
        advanceFields(
          {
            kind: "mobilisation",
            amount: 100,
            advanceOn: TODAY,
            recoveryMode: "percent",
            recoveryValue: "5",
            ...input,
          },
          { today: TODAY, defaultPercent: null },
        ),
      ).code;
    expect(bad({ kind: "loan" })).toBe("ADVANCE_KIND_INVALID");
    expect(bad({ amount: 0 })).toBe("ADVANCE_AMOUNT_INVALID");
    expect(bad({ amount: 100_00_00_000_01 })).toBe("ADVANCE_AMOUNT_INVALID");
    expect(bad({ advanceOn: "2026-10-23" })).toBe("ADVANCE_ON_IN_FUTURE");
    expect(bad({ recoveryMode: "monthly" })).toBe("RECOVERY_MODE_INVALID");
    expect(bad({ recoveryValue: "100.01" })).toBe("RECOVERY_VALUE_INVALID");
    expect(bad({ recoveryValue: "0" })).toBe("RECOVERY_VALUE_INVALID");
    expect(bad({ recoveryMode: "fixed", recoveryValue: 101 })).toBe(
      "RECOVERY_VALUE_INVALID",
    );
    expect(bad({ recoveryMode: "fixed", recoveryValue: null })).toBe(
      "RECOVERY_VALUE_REQUIRED",
    );
  });

  it("suggests min(rule, what is left) per advance", () => {
    // 10 % of ₹4,00,000 = ₹40,000, well inside ₹1,00,000.
    expect(recoverySuggestion(advance(), 4_00_000_00n)).toBe(40_000_00n);
    // Half up: 10 % of ₹0.05 = ₹0.005 → ₹0.01.
    expect(recoveryRule(advance(), 5n)).toBe(1n);
    // The cap: ₹95,000 recovered leaves ₹5,000.
    expect(
      recoverySuggestion(advance({ recovered: 95_000_00n }), 4_00_000_00n),
    ).toBe(5_000_00n);
    expect(advanceBalance(advance({ recovered: 1_10_000_00n }))).toBe(0n);
    // A fixed amount per bill, whatever the gross, within the balance.
    const fixed = advance({ recoveryMode: "fixed", recoveryValue: 25_000_00n });
    expect(recoverySuggestion(fixed, 1_00n)).toBe(25_000_00n);
    expect(recoverySuggestion({ ...fixed, recovered: 90_000_00n }, 1n)).toBe(
      10_000_00n,
    );
    // No gross, no percent recovery.
    expect(recoveryRule(advance(), 0n)).toBe(0n);
  });

  it("lists one suggested line per advance with a balance, oldest first", () => {
    expect(
      suggestedRecoveries(
        [
          advance({ id: "late", advanceOn: "2026-10-01", kind: "secured" }),
          advance({ id: "done", recovered: 1_00_000_00n }),
          advance({ id: "early", advanceOn: "2026-08-01" }),
        ],
        2_00_000_00n,
      ),
    ).toEqual([
      {
        kind: "mobilisation_recovery",
        amount: 20_000_00n,
        description: null,
        advanceId: "early",
        escalationBillId: null,
      },
      {
        kind: "secured_advance_recovery",
        amount: 20_000_00n,
        description: null,
        advanceId: "late",
        escalationBillId: null,
      },
    ]);
  });

  it("refuses a recovery without its advance, of another kind, twice, or above the balance", () => {
    const advances = [advance({ recovered: 70_000_00n })];
    const check = (
      deductions: { kind: string; amount: bigint; advanceId: string | null }[],
    ) =>
      errorOf(() => {
        assertRecoveries(deductions, advances);
      });
    expect(
      check([{ kind: "mobilisation_recovery", amount: 1n, advanceId: null }])
        .code,
    ).toBe("BILL_RECOVERY_ADVANCE_REQUIRED");
    expect(
      check([{ kind: "mobilisation_recovery", amount: 1n, advanceId: "x" }])
        .code,
    ).toBe("BILL_RECOVERY_ADVANCE_INVALID");
    expect(
      check([{ kind: "secured_advance_recovery", amount: 1n, advanceId: "a1" }])
        .code,
    ).toBe("BILL_RECOVERY_KIND_MISMATCH");
    expect(
      check([
        { kind: "mobilisation_recovery", amount: 1n, advanceId: "a1" },
        { kind: "mobilisation_recovery", amount: 1n, advanceId: "a1" },
      ]).code,
    ).toBe("BILL_RECOVERY_DUPLICATE");
    const over = check([
      { kind: "mobilisation_recovery", amount: 30_000_01n, advanceId: "a1" },
    ]);
    expect(over.code).toBe("BILL_RECOVERY_OVER_BALANCE");
    expect(over.details).toMatchObject({
      max: 30_000_00,
      field: "deductions.0.amount",
    });
    expect(() => {
      assertRecoveries(
        [
          { kind: "retention", amount: 5n, advanceId: null },
          {
            kind: "mobilisation_recovery",
            amount: 30_000_00n,
            advanceId: "a1",
          },
        ],
        advances,
      );
    }).not.toThrow();
    expect(
      recoveriesByAdvance([
        { kind: "mobilisation_recovery", amount: 3n, advanceId: "a1" },
        { kind: "retention", amount: 9n, advanceId: null },
      ]),
    ).toEqual(new Map([["a1", 3n]]));
  });

  it("warns when mobilisation advances pass the agreed figure", () => {
    expect(advanceWarnings({ agreed: null, mobilisationGiven: 5n })).toEqual(
      [],
    );
    expect(
      advanceWarnings({
        agreed: 1_00_000_00n,
        mobilisationGiven: 1_00_000_00n,
      }),
    ).toEqual([]);
    expect(
      advanceWarnings({
        agreed: 1_00_000_00n,
        mobilisationGiven: 1_20_000_00n,
      }),
    ).toMatchObject([
      {
        code: "ADVANCES_OVER_AGREED",
        message:
          "Mobilisation advances given (₹1,20,000.00) are more than the ₹1,00,000.00 the Work Order agrees.",
      },
    ]);
  });
});

describe("retention release (CM-1108)", () => {
  it("works out what is releasable and what each stage suggests", () => {
    // ₹30,000 deducted, 50 % on completion.
    expect(
      retentionPosition({
        deducted: 30_000_00n,
        released: 0n,
        completionPercent: 50_00n,
      }),
    ).toEqual({
      deducted: 30_000_00n,
      released: 0n,
      releasable: 30_000_00n,
      completionPercent: 50_00n,
      completionSuggestion: 15_000_00n,
      dlpEndSuggestion: 30_000_00n,
    });
    // After the completion release the DLP end suggests the rest.
    expect(
      retentionPosition({
        deducted: 30_000_00n,
        released: 15_000_00n,
        completionPercent: 50_00n,
      }),
    ).toMatchObject({
      releasable: 15_000_00n,
      completionSuggestion: 0n,
      dlpEndSuggestion: 15_000_00n,
    });
    // An early release against a guarantee leaves completion its share only.
    expect(
      retentionPosition({
        deducted: 30_000_00n,
        released: 10_000_00n,
        completionPercent: 50_00n,
      }).completionSuggestion,
    ).toBe(5_000_00n);
    // Half up on odd paise.
    expect(
      retentionPosition({
        deducted: 3n,
        released: 0n,
        completionPercent: 50_00n,
      }).completionSuggestion,
    ).toBe(2n);
  });

  const dlp = (startsOn: string | null, months: number): DlpPeriod =>
    dlpPeriod(startsOn, months, TODAY);

  const release = (
    input: Partial<Parameters<typeof releaseFields>[0]>,
    context: Partial<Parameters<typeof releaseFields>[1]> = {},
  ) =>
    releaseFields(
      { stage: "completion", amount: 100, releasedOn: TODAY, ...input },
      {
        today: TODAY,
        releasable: 1_000n,
        dlp: dlp("2026-01-10", 12),
        canReleaseEarly: false,
        ...context,
      },
    );

  it("checks the amount, the date and each stage's rule", () => {
    expect(release({})).toEqual({
      stage: "completion",
      amount: 100n,
      releasedOn: TODAY,
      reason: null,
      bankGuaranteeId: null,
      beforeDlpEnd: false,
    });
    const over = errorOf(() => release({ amount: 1_001 }));
    expect(over.code).toBe("RELEASE_OVER_RELEASABLE");
    expect(over.details).toMatchObject({ max: 1000 });
    expect(errorOf(() => release({ amount: 0 })).code).toBe(
      "RELEASE_AMOUNT_INVALID",
    );
    expect(errorOf(() => release({ stage: "half" })).code).toBe(
      "RETENTION_STAGE_INVALID",
    );
    expect(errorOf(() => release({ releasedOn: "2026-10-23" })).code).toBe(
      "RELEASED_ON_IN_FUTURE",
    );
    expect(errorOf(() => release({}, { dlp: dlp(null, 12) })).code).toBe(
      "COMPLETION_DATE_REQUIRED",
    );
    expect(errorOf(() => release({ releasedOn: "2026-01-09" })).code).toBe(
      "RELEASED_ON_BEFORE_COMPLETION",
    );
    expect(errorOf(() => release({ stage: "other" })).code).toBe(
      "RELEASE_REASON_REQUIRED",
    );
    expect(errorOf(() => release({ stage: "bank_guarantee" })).code).toBe(
      "RELEASE_GUARANTEE_REQUIRED",
    );
    expect(
      release({ stage: "bank_guarantee", bankGuaranteeId: "g1" }),
    ).toMatchObject({ bankGuaranteeId: "g1" });
    // A guarantee or other release needs no completion date.
    expect(
      release(
        { stage: "other", reason: "Agreed with the Contractor" },
        { dlp: dlp(null, 12) },
      ),
    ).toMatchObject({ stage: "other", reason: "Agreed with the Contractor" });
  });

  it("releases the DLP end on or after the end, earlier only with Approve and a reason", () => {
    // Started 2025-10-22, 12 months: ends today.
    expect(
      release({ stage: "dlp_end" }, { dlp: dlp("2025-10-22", 12) }),
    ).toMatchObject({ stage: "dlp_end", beforeDlpEnd: false });
    // Ends 2027-01-10.
    const early = errorOf(() => release({ stage: "dlp_end" }));
    expect(early.code).toBe("DLP_NOT_ENDED");
    expect(early.details).toMatchObject({ dlpEndsOn: "2027-01-10" });
    expect(
      errorOf(() => release({ stage: "dlp_end" }, { canReleaseEarly: true }))
        .code,
    ).toBe("RELEASE_REASON_REQUIRED");
    expect(
      release(
        { stage: "dlp_end", reason: "Defects closed early" },
        { canReleaseEarly: true },
      ),
    ).toMatchObject({ beforeDlpEnd: true, reason: "Defects closed early" });
  });
});

describe("DLP dates (CM-1108)", () => {
  it("adds calendar months, clamped to the month's end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-10-22", 12)).toBe("2027-10-22");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-05-10", 0)).toBe("2026-05-10");
  });

  it("runs from the start for its months, with days left", () => {
    expect(dlpPeriod(null, 12, TODAY)).toEqual({
      startsOn: null,
      months: 12,
      endsOn: null,
      daysLeft: null,
      ended: false,
    });
    expect(dlpPeriod("2026-10-01", 1, TODAY)).toEqual({
      startsOn: "2026-10-01",
      months: 1,
      endsOn: "2026-11-01",
      daysLeft: 10,
      ended: false,
    });
    // No DLP months: it ends at completion.
    expect(dlpPeriod("2026-10-01", null, TODAY)).toMatchObject({
      endsOn: "2026-10-01",
      ended: true,
    });
  });

  it("is due soon within 30 days, today included", () => {
    expect(dueSoon(TODAY, TODAY)).toBe(true);
    expect(dueSoon("2026-11-21", TODAY)).toBe(true);
    expect(dueSoon("2026-11-22", TODAY)).toBe(false);
    expect(dueSoon("2026-10-21", TODAY)).toBe(false);
  });

  it("checks a completion date against the order date and today", () => {
    const context = { orderDate: "2026-06-01", today: TODAY };
    expect(completionDate("2026-10-01", context)).toBe("2026-10-01");
    expect(errorOf(() => completionDate("2026-05-31", context)).code).toBe(
      "COMPLETED_ON_BEFORE_ORDER_DATE",
    );
    expect(errorOf(() => completionDate("2026-10-23", context)).code).toBe(
      "COMPLETED_ON_IN_FUTURE",
    );
  });
});

describe("bank guarantees (CM-1108)", () => {
  const input = {
    purpose: "retention",
    number: " BG/ 2026/ 001 ",
    bank: "State Bank of India",
    amount: 15_000_00,
    issuedOn: "2026-10-01",
    expiresOn: "2027-09-30",
    advanceId: "ignored",
  };

  it("checks a guarantee and keeps the advance only for an advance guarantee", () => {
    expect(guaranteeFields(input, { today: TODAY })).toEqual({
      purpose: "retention",
      number: "BG/ 2026/ 001",
      bank: "State Bank of India",
      amount: 15_000_00n,
      issuedOn: "2026-10-01",
      expiresOn: "2027-09-30",
      advanceId: null,
      remarks: null,
    });
    const bad = (patch: Partial<typeof input>) =>
      errorOf(() => guaranteeFields({ ...input, ...patch }, { today: TODAY }))
        .code;
    expect(bad({ purpose: "advance", advanceId: "" })).toBe(
      "GUARANTEE_ADVANCE_REQUIRED",
    );
    expect(bad({ purpose: "bid" })).toBe("GUARANTEE_PURPOSE_INVALID");
    expect(bad({ number: " " })).toBe("GUARANTEE_NUMBER_REQUIRED");
    expect(bad({ bank: "" })).toBe("GUARANTEE_BANK_REQUIRED");
    expect(bad({ amount: 0 })).toBe("GUARANTEE_AMOUNT_INVALID");
    expect(bad({ expiresOn: "2026-09-30" })).toBe(
      "GUARANTEE_EXPIRES_BEFORE_ISSUED",
    );
    expect(bad({ issuedOn: "2026-10-23", expiresOn: "2027-01-01" })).toBe(
      "GUARANTEE_ISSUED_ON_IN_FUTURE",
    );
  });

  it("is live until it expires or is released", () => {
    expect(guaranteeStatus({ expiresOn: TODAY, releasedOn: null }, TODAY)).toBe(
      "live",
    );
    expect(
      guaranteeStatus({ expiresOn: "2026-10-21", releasedOn: null }, TODAY),
    ).toBe("expired");
    expect(
      guaranteeStatus({ expiresOn: "2027-10-21", releasedOn: TODAY }, TODAY),
    ).toBe("released");
  });
});
