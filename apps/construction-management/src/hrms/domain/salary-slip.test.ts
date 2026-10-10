import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  advanceDue,
  advanceInstalment,
  assertApprovable,
  assertPayable,
  assertRecalculable,
  createSalaryAdvance,
  createSalaryPayment,
  esiEligibilityFor,
  firstRecoveryMonth,
  type SalarySlipState,
} from "./salary-slip";
import type { EsiRate } from "./statutory";

function codeOf(run: () => unknown): {
  code: string;
  kind: string;
  field: unknown;
} {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        kind: error.kind,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

const slip = (overrides: Partial<SalarySlipState> = {}): SalarySlipState => ({
  memberId: "m-1",
  month: "2026-09",
  kind: "regular",
  status: "calculated",
  ...overrides,
});

describe("salary slip states", () => {
  it("recalculates only a Calculated regular slip", () => {
    expect(() => {
      assertRecalculable(slip());
    }).not.toThrow();
    for (const status of ["approved", "paid"] as const)
      expect(
        codeOf(() => {
          assertRecalculable(slip({ status }));
        }),
      ).toMatchObject({
        code: "SALARY_SLIP_NOT_CALCULATED",
        kind: "conflict",
      });
    expect(
      codeOf(() => {
        assertRecalculable(slip({ kind: "advance", status: "paid" }));
      }).code,
    ).toBe("SALARY_SLIP_NOT_CALCULATED");
  });

  it("approves a Calculated slip once, never one's own except the Owner's", () => {
    expect(() => {
      assertApprovable(slip(), { memberId: "m-2", isOwner: false });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertApprovable(slip(), { memberId: "m-1", isOwner: false });
      }),
    ).toMatchObject({ code: "SALARY_OWN_SLIP", kind: "forbidden" });
    expect(() => {
      assertApprovable(slip(), { memberId: "m-1", isOwner: true });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertApprovable(slip({ status: "approved" }), {
          memberId: "m-2",
          isOwner: false,
        });
      }),
    ).toMatchObject({ code: "SALARY_SLIP_ALREADY_APPROVED", kind: "conflict" });
  });

  it("marks paid only after approval, and only once", () => {
    expect(
      codeOf(() => {
        assertPayable(slip());
      }),
    ).toMatchObject({
      code: "SALARY_NOT_APPROVED",
      kind: "conflict",
    });
    expect(() => {
      assertPayable(slip({ status: "approved" }));
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertPayable(slip({ status: "paid" }));
      }).code,
    ).toBe("SALARY_ALREADY_PAID");
  });
});

describe("createSalaryPayment", () => {
  it("takes Cash or Bank, a date not after today and an optional reference", () => {
    expect(
      createSalaryPayment(
        { mode: "bank", paymentDate: "2026-10-01", reference: "  UTR 123 " },
        "2026-10-10",
      ),
    ).toEqual({ mode: "bank", date: "2026-10-01", reference: "UTR 123" });
    expect(
      createSalaryPayment(
        { mode: "cash", paymentDate: "2026-10-10", reference: " " },
        "2026-10-10",
      ).reference,
    ).toBeNull();
  });

  it("refuses a bad mode, a bad or future date and a long reference", () => {
    const today = "2026-10-10";
    expect(
      codeOf(() =>
        createSalaryPayment({ mode: "upi", paymentDate: today }, today),
      ),
    ).toMatchObject({ code: "PAYMENT_MODE_INVALID", field: "mode" });
    expect(
      codeOf(() =>
        createSalaryPayment({ mode: "cash", paymentDate: "10/10/2026" }, today),
      ),
    ).toMatchObject({ code: "PAYMENT_DATE_INVALID", field: "paymentDate" });
    expect(
      codeOf(() =>
        createSalaryPayment({ mode: "cash", paymentDate: "2026-10-11" }, today),
      ).code,
    ).toBe("PAYMENT_DATE_IN_FUTURE");
    expect(
      codeOf(() =>
        createSalaryPayment(
          { mode: "cash", paymentDate: today, reference: "x".repeat(101) },
          today,
        ),
      ).field,
    ).toBe("reference");
  });
});

describe("advance salary", () => {
  const today = "2026-10-10";
  const terms = (
    overrides: Partial<Parameters<typeof createSalaryAdvance>[0]>,
  ) =>
    createSalaryAdvance(
      {
        amount: 1_000_000,
        advanceDate: "2026-10-05",
        mode: "cash",
        ...overrides,
      },
      today,
    );

  it("defaults to one instalment", () => {
    expect(terms({})).toMatchObject({
      amount: 1_000_000,
      instalments: 1,
      advanceDate: "2026-10-05",
      reason: null,
      payment: { mode: "cash", date: "2026-10-05", reference: null },
    });
  });

  it("refuses a bad amount, instalments or date", () => {
    expect(codeOf(() => terms({ amount: 0 })).field).toBe("amount");
    expect(codeOf(() => terms({ amount: 10.5 })).field).toBe("amount");
    expect(codeOf(() => terms({ amount: 2_000_000_001 })).code).toBe(
      "AMOUNT_TOO_LARGE",
    );
    expect(codeOf(() => terms({ instalments: 0 })).field).toBe("instalments");
    expect(codeOf(() => terms({ instalments: 25 })).field).toBe("instalments");
    expect(codeOf(() => terms({ advanceDate: "2026-10-11" })).code).toBe(
      "PAYMENT_DATE_IN_FUTURE",
    );
  });

  it("splits into instalments rounded up to the paisa", () => {
    expect(advanceInstalment(1_000_000, 3)).toBe(333_334);
    expect(advanceInstalment(900_000, 3)).toBe(300_000);
  });

  it("starts recovery in the advance's month unless that month is approved", () => {
    expect(firstRecoveryMonth("2026-10-05", false)).toBe("2026-10");
    expect(firstRecoveryMonth("2026-12-20", true)).toBe("2027-01");
  });

  it("recovers one instalment a month until recovered", () => {
    const advance = {
      id: "a-1",
      amount: 1_000_000,
      instalments: 3,
      firstRecoveryMonth: "2026-10",
    };
    expect(advanceDue(advance, "2026-09", 0)).toBe(0);
    expect(advanceDue(advance, "2026-10", 0)).toBe(333_334);
    expect(advanceDue(advance, "2026-11", 333_334)).toBe(333_334);
    expect(advanceDue(advance, "2026-12", 666_668)).toBe(333_332);
    expect(advanceDue(advance, "2027-01", 1_000_000)).toBe(0);
  });

  it("keeps what a short month could not take outstanding, past the instalments", () => {
    const advance = {
      id: "a-1",
      amount: 900_000,
      instalments: 3,
      firstRecoveryMonth: "2026-10",
    };
    // October recovered only ₹1,000 of ₹3,000 (net would have gone negative).
    expect(advanceDue(advance, "2026-11", 100_000)).toBe(300_000);
    expect(advanceDue(advance, "2026-12", 400_000)).toBe(300_000);
    expect(advanceDue(advance, "2027-01", 700_000)).toBe(200_000);
  });
});

describe("esiEligibilityFor", () => {
  const rate: EsiRate = {
    effectiveFrom: "2019-07-01",
    wageCeiling: 2_100_000,
    pwdWageCeiling: 2_500_000,
    employeePercent: "0.75",
    employerPercent: "3.25",
    source: "test",
  };

  it("uses this month's full-month gross when it opens the period", () => {
    expect(
      esiEligibilityFor({
        month: "2026-10",
        periodFirstSlip: null,
        fullMonthGross: 2_100_000,
        rate,
      }),
    ).toEqual({ eligible: true, basisMonth: "2026-10", basisGross: 2_100_000 });
  });

  it("keeps the period's first slip's answer after a raise", () => {
    expect(
      esiEligibilityFor({
        month: "2026-12",
        periodFirstSlip: { month: "2026-10", fullMonthGross: 2_000_000 },
        fullMonthGross: 2_500_000,
        rate,
      }),
    ).toEqual({ eligible: true, basisMonth: "2026-10", basisGross: 2_000_000 });
    expect(
      esiEligibilityFor({
        month: "2026-12",
        periodFirstSlip: { month: "2026-10", fullMonthGross: 2_200_000 },
        fullMonthGross: 2_000_000,
        rate,
      }).eligible,
    ).toBe(false);
  });

  it("ignores a slip from another period and decides afresh in a new one", () => {
    expect(
      esiEligibilityFor({
        month: "2027-04",
        periodFirstSlip: { month: "2026-10", fullMonthGross: 2_000_000 },
        fullMonthGross: 2_200_000,
        rate,
      }),
    ).toEqual({
      eligible: false,
      basisMonth: "2027-04",
      basisGross: 2_200_000,
    });
  });

  it("is never eligible without an ESI row", () => {
    expect(
      esiEligibilityFor({
        month: "2026-10",
        periodFirstSlip: null,
        fullMonthGross: 100,
        rate: null,
      }).eligible,
    ).toBe(false);
  });
});
