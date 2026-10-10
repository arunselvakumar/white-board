import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { DEFAULT_HRMS_SETTINGS } from "./hrms-settings";
import {
  accrualCredits,
  assertBalanceCovers,
  balanceOf,
  carryForwardDays,
  createAdjustment,
  openingCredit,
  previousLeaveYear,
  type LeaveLedgerLine,
} from "./leave-balance";
import { leaveYearOf } from "./leave-year";

const YEAR_2026 = leaveYearOf("2026-06-01", "calendar");

const PRIVILEGE = {
  accrualMode: "periodic" as const,
  accrualDay: 1,
  creditPerPeriod: 1.25,
};

const MATERNITY = { ...PRIVILEGE, creditPerPeriod: 15.17 };

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "none";
}

describe("leave balance from the ledger (CM-311)", () => {
  it("sums every entry, splitting credits, use and pending", () => {
    const lines: LeaveLedgerLine[] = [
      { kind: "initial", days: 12 },
      { kind: "carry_forward", days: 3 },
      { kind: "adjustment", days: 1 },
      // Approved 2 days: reserved, released, used.
      { kind: "reserved", days: -2 },
      { kind: "released", days: 2 },
      { kind: "used", days: -2 },
      // Approved 1 day, then cancelled: restored.
      { kind: "used", days: -1 },
      { kind: "restored", days: 1 },
      // Pending 1.5 days.
      { kind: "reserved", days: -1.5 },
    ];
    expect(balanceOf(lines)).toEqual({
      initialised: true,
      opening: 12,
      accrued: 0,
      carriedForward: 3,
      adjusted: 1,
      used: 2,
      pending: 1.5,
      available: 12.5,
      lastAccrualPeriod: null,
    });
  });

  it("adds accruals without float drift and reports the last period", () => {
    const lines: LeaveLedgerLine[] = [
      { kind: "initial", days: 0 },
      ...Array.from({ length: 12 }, (_, index) => ({
        kind: "accrual" as const,
        days: 0.58,
        periodKey: `2026-${String(index + 1).padStart(2, "0")}`,
      })),
    ];
    const balance = balanceOf(lines);
    expect(balance.accrued).toBe(6.96);
    expect(balance.available).toBe(6.96);
    expect(balance.lastAccrualPeriod).toBe("2026-12");
  });

  it("is not initialised without an initial entry", () => {
    expect(balanceOf([]).initialised).toBe(false);
    expect(balanceOf([]).available).toBe(0);
  });
});

describe("initialise (CM-311, ADR CM-0012 §7)", () => {
  it("credits the whole entitlement upfront, nothing for monthly or no-credit types", () => {
    expect(openingCredit({ accrualMode: "upfront" }, 12)).toBe(12);
    expect(openingCredit({ accrualMode: "periodic" }, 15)).toBe(0);
    expect(openingCredit({ accrualMode: "none" }, 0)).toBe(0);
  });
});

describe("monthly accrual (CM-311)", () => {
  it("credits each month whose accrual day has come, from the balance's start", () => {
    const credits = accrualCredits({
      type: { ...PRIVILEGE, accrualDay: 5 },
      entitlement: 15,
      fromMonth: "2026-07",
      year: YEAR_2026,
      today: "2026-10-04",
      credited: new Set(),
      accruedSoFar: 0,
    });
    expect(credits).toEqual([
      { periodKey: "2026-07", days: 1.25, entryDate: "2026-07-05" },
      { periodKey: "2026-08", days: 1.25, entryDate: "2026-08-05" },
      { periodKey: "2026-09", days: 1.25, entryDate: "2026-09-05" },
    ]);
  });

  it("is idempotent: periods already credited are skipped", () => {
    const first = accrualCredits({
      type: PRIVILEGE,
      entitlement: 15,
      fromMonth: "2026-01",
      year: YEAR_2026,
      today: "2026-03-01",
      credited: new Set(),
      accruedSoFar: 0,
    });
    expect(first.map((credit) => credit.periodKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    const again = accrualCredits({
      type: PRIVILEGE,
      entitlement: 15,
      fromMonth: "2026-01",
      year: YEAR_2026,
      today: "2026-03-31",
      credited: new Set(first.map((credit) => credit.periodKey)),
      accruedSoFar: 3.75,
    });
    expect(again).toEqual([]);
  });

  it("caps the year's accruals at the entitlement, cutting the last credit short", () => {
    const credits = accrualCredits({
      type: MATERNITY,
      entitlement: 182,
      fromMonth: "2026-01",
      year: YEAR_2026,
      today: "2026-12-31",
      credited: new Set(),
      accruedSoFar: 0,
    });
    expect(credits).toHaveLength(12);
    expect(credits.at(-1)).toMatchObject({ periodKey: "2026-12", days: 15.13 });
    const total = credits.reduce(
      (sum, credit) => sum + Math.round(credit.days * 100),
      0,
    );
    expect(total / 100).toBe(182);
    // A structure's smaller entitlement caps sooner.
    expect(
      accrualCredits({
        type: PRIVILEGE,
        entitlement: 2,
        fromMonth: "2026-01",
        year: YEAR_2026,
        today: "2026-12-31",
        credited: new Set(),
        accruedSoFar: 0,
      }).map((credit) => credit.days),
    ).toEqual([1.25, 0.75]);
  });

  it("credits nothing once the cap is reached, and nothing past the year's end", () => {
    expect(
      accrualCredits({
        type: PRIVILEGE,
        entitlement: 15,
        fromMonth: "2026-01",
        year: YEAR_2026,
        today: "2027-02-01",
        credited: new Set(),
        accruedSoFar: 15,
      }),
    ).toEqual([]);
    const late = accrualCredits({
      type: PRIVILEGE,
      entitlement: 15,
      fromMonth: "2026-11",
      year: YEAR_2026,
      today: "2027-02-01",
      credited: new Set(),
      accruedSoFar: 0,
    });
    expect(late.map((credit) => credit.periodKey)).toEqual([
      "2026-11",
      "2026-12",
    ]);
  });

  it("gives upfront and no-credit types nothing", () => {
    expect(
      accrualCredits({
        type: {
          accrualMode: "upfront",
          accrualDay: null,
          creditPerPeriod: null,
        },
        entitlement: 12,
        fromMonth: "2026-01",
        year: YEAR_2026,
        today: "2026-12-31",
        credited: new Set(),
        accruedSoFar: 0,
      }),
    ).toEqual([]);
  });

  it("follows a financial leave year", () => {
    const fy = leaveYearOf("2026-10-10", "financial");
    const credits = accrualCredits({
      type: PRIVILEGE,
      entitlement: 15,
      fromMonth: "2026-01",
      year: fy,
      today: "2026-05-15",
      credited: new Set(),
      accruedSoFar: 0,
    });
    expect(credits.map((credit) => credit.periodKey)).toEqual([
      "2026-04",
      "2026-05",
    ]);
  });
});

describe("carry forward (ADR CM-0012 §6)", () => {
  const on = { carryForwardEnabled: true, carryForwardMaxDays: 10 };
  const type = { carryForward: true, maxCarryForward: 6 };

  it("is the smaller of the unused days, the type's cap and the Company's cap", () => {
    expect(
      carryForwardDays({ type, settings: on, previousAvailable: 4.5 }),
    ).toBe(4.5);
    expect(carryForwardDays({ type, settings: on, previousAvailable: 9 })).toBe(
      6,
    );
    expect(
      carryForwardDays({
        type: { carryForward: true, maxCarryForward: 20 },
        settings: on,
        previousAvailable: 15,
      }),
    ).toBe(10);
  });

  it("carries nothing below zero", () => {
    expect(
      carryForwardDays({ type, settings: on, previousAvailable: -2 }),
    ).toBe(0);
  });

  it("needs both switches and an old balance", () => {
    expect(
      carryForwardDays({
        type,
        settings: DEFAULT_HRMS_SETTINGS,
        previousAvailable: 5,
      }),
    ).toBeNull();
    expect(
      carryForwardDays({
        type: { carryForward: false, maxCarryForward: null },
        settings: on,
        previousAvailable: 5,
      }),
    ).toBeNull();
    expect(
      carryForwardDays({ type, settings: on, previousAvailable: null }),
    ).toBeNull();
  });

  it("finds the year before under the same setting", () => {
    expect(previousLeaveYear(YEAR_2026, "calendar").key).toBe("2025");
    expect(
      previousLeaveYear(leaveYearOf("2026-10-10", "financial"), "financial")
        .key,
    ).toBe("25-26");
  });
});

describe("adjustment (ADR CM-0012 §9)", () => {
  it("credits Comp Off with a reason", () => {
    expect(
      createAdjustment({ days: 1, reason: " Worked on Sunday ", available: 0 }),
    ).toEqual({ days: 1, reason: "Worked on Sunday" });
  });

  it("refuses zero, three decimals, no reason and a debit below zero", () => {
    expect(
      codeOf(() => createAdjustment({ days: 0, reason: "abc", available: 0 })),
    ).toBe("LEAVE_ADJUSTMENT_DAYS_INVALID");
    expect(
      codeOf(() =>
        createAdjustment({ days: 1.255, reason: "abc", available: 0 }),
      ),
    ).toBe("LEAVE_ADJUSTMENT_DAYS_INVALID");
    expect(
      codeOf(() => createAdjustment({ days: 1, reason: " ", available: 0 })),
    ).toBe("LEAVE_ADJUSTMENT_REASON_REQUIRED");
    expect(
      codeOf(() =>
        createAdjustment({ days: -2, reason: "Correction", available: 1.5 }),
      ),
    ).toBe("LEAVE_ADJUSTMENT_BELOW_ZERO");
    expect(
      createAdjustment({ days: -1.5, reason: "Correction", available: 1.5 })
        .days,
    ).toBe(-1.5);
  });
});

describe("balance check on apply (CM-312)", () => {
  const casual = { name: "Casual Leave", isPaid: true, allowAdvanceUse: false };
  const twelve = balanceOf([{ kind: "initial", days: 12 }]);

  it("allows what the available days cover", () => {
    expect(() => {
      assertBalanceCovers({
        type: casual,
        balance: twelve,
        entitlement: 12,
        requested: 12,
      });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertBalanceCovers({
          type: casual,
          balance: twelve,
          entitlement: 12,
          requested: 12.5,
        });
      }),
    ).toBe("LEAVE_BALANCE_INSUFFICIENT");
  });

  it("counts pending requests as taken", () => {
    const held = balanceOf([
      { kind: "initial", days: 2 },
      { kind: "reserved", days: -1.5 },
    ]);
    expect(
      codeOf(() => {
        assertBalanceCovers({
          type: casual,
          balance: held,
          entitlement: 2,
          requested: 1,
        });
      }),
    ).toBe("LEAVE_BALANCE_INSUFFICIENT");
  });

  it("lets unpaid leave go beyond any balance", () => {
    expect(() => {
      assertBalanceCovers({
        type: { name: "Loss of Pay", isPaid: false, allowAdvanceUse: false },
        balance: balanceOf([]),
        entitlement: 0,
        requested: 30,
      });
    }).not.toThrow();
  });

  it("lets advance use go up to the yearly limit, not beyond", () => {
    const privilege = {
      name: "Privilege Leave",
      isPaid: true,
      allowAdvanceUse: true,
    };
    const accrued = balanceOf([
      { kind: "initial", days: 0 },
      { kind: "accrual", days: 1.25, periodKey: "2026-01" },
      { kind: "accrual", days: 1.25, periodKey: "2026-02" },
    ]);
    expect(() => {
      assertBalanceCovers({
        type: privilege,
        balance: accrued,
        entitlement: 15,
        requested: 15,
      });
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertBalanceCovers({
          type: privilege,
          balance: accrued,
          entitlement: 15,
          requested: 15.5,
        });
      }),
    ).toBe("LEAVE_BALANCE_INSUFFICIENT");
  });
});
