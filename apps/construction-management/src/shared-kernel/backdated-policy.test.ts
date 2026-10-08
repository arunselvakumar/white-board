import { describe, expect, it } from "vitest";

import {
  BACKDATED_MODULE_GROUPS,
  BACKDATED_MODULES,
  DEFAULT_BACKDATED_POLICY,
  assertCanCreate,
  assertCanEdit,
  createBackdatedPolicy,
  referencedDesignationIds,
  resolveBackdatedLimits,
  type BackdatedActor,
} from "./backdated-policy";
import { addDays, daysBetween, todayIn } from "./calendar-date";
import { DomainError } from "./domain-error";

const TODAY = "2026-10-08";
const ENGINEER = "designation-engineer";
const ACCOUNTANT = "designation-accountant";

const engineer: BackdatedActor = { designationId: ENGINEER, isOwner: false };
const accountant: BackdatedActor = {
  designationId: ACCOUNTANT,
  isOwner: false,
};
const owner: BackdatedActor = { designationId: null, isOwner: true };

function errorOf(run: () => void): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("module catalogue", () => {
  it("lists the 24 modules of modules/12 in seven groups", () => {
    expect(BACKDATED_MODULES).toHaveLength(24);
    const counts = Object.fromEntries(
      BACKDATED_MODULE_GROUPS.map((group) => [
        group.label,
        BACKDATED_MODULES.filter((item) => item.group === group.key).length,
      ]),
    );
    expect(counts).toEqual({
      Procurement: 6,
      Site: 5,
      Inventory: 3,
      Accounts: 2,
      "Labour & Vendor": 2,
      Sales: 3,
      HRMS: 3,
    });
    expect(new Set(BACKDATED_MODULES.map((item) => item.key)).size).toBe(24);
  });
});

describe("calendar dates", () => {
  it("counts days and rejects impossible dates", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => daysBetween("2026-02-30", TODAY)).toThrow(DomainError);
  });

  it("reads today in the Company time zone, not UTC", () => {
    // 20:00 UTC on 8 October is 01:30 on 9 October in India.
    const now = new Date("2026-10-08T20:00:00Z");
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-10-09");
    expect(todayIn("UTC", now)).toBe("2026-10-08");
  });
});

describe("assertCanCreate / assertCanEdit", () => {
  it("allows anything when every limit is 0", () => {
    expect(() => {
      assertCanCreate(
        DEFAULT_BACKDATED_POLICY,
        "purchase_order",
        "2020-01-01",
        engineer,
        TODAY,
      );
    }).not.toThrow();
  });

  it("applies the global create limit (N days back is allowed, N + 1 is not)", () => {
    const policy = createBackdatedPolicy({
      create: { days: 3 },
      edit: { days: 0 },
    });
    expect(() => {
      assertCanCreate(policy, "purchase_order", "2026-10-05", engineer, TODAY);
    }).not.toThrow();
    const error = errorOf(() => {
      assertCanCreate(policy, "purchase_order", "2026-10-04", engineer, TODAY);
    });
    expect(error.code).toBe("BACKDATED_CREATE_BLOCKED");
    expect(error.kind).toBe("forbidden");
    expect(error.details).toEqual({
      module: "purchase_order",
      entryDate: "2026-10-04",
      limitDays: 3,
      oldestAllowedDate: "2026-10-05",
    });
    // Edits have their own limit.
    expect(() => {
      assertCanEdit(policy, "purchase_order", "2026-01-01", engineer, TODAY);
    }).not.toThrow();
  });

  it("applies the global edit limit", () => {
    const policy = createBackdatedPolicy({
      create: { days: 0 },
      edit: { days: 1 },
    });
    expect(
      errorOf(() => {
        assertCanEdit(policy, "petty_cash", "2026-10-06", engineer, TODAY);
      }).code,
    ).toBe("BACKDATED_EDIT_BLOCKED");
  });

  it("lets override Designations and the Owner past the day limit", () => {
    const policy = createBackdatedPolicy({
      create: { days: 2, overrideDesignationIds: [ACCOUNTANT] },
      edit: { days: 2 },
    });
    expect(() => {
      assertCanCreate(policy, "transaction", "2026-09-01", accountant, TODAY);
    }).not.toThrow();
    expect(() => {
      assertCanCreate(policy, "transaction", "2026-09-01", engineer, TODAY);
    }).toThrow(DomainError);
    // The override is per action: the Accountant may not edit that far back.
    expect(() => {
      assertCanEdit(policy, "transaction", "2026-09-01", accountant, TODAY);
    }).toThrow(DomainError);
    expect(() => {
      assertCanEdit(policy, "transaction", "2026-09-01", owner, TODAY);
    }).not.toThrow();
  });

  it("uses a module's custom limits instead of the defaults", () => {
    const policy = createBackdatedPolicy({
      create: { days: 30 },
      edit: { days: 30 },
      modules: [
        {
          key: "labour_attendance",
          mode: "custom",
          create: { days: 1, overrideDesignationIds: [ENGINEER] },
          edit: { days: 0 },
        },
        // Global mode ignores the stored custom values.
        { key: "petty_cash", mode: "global", create: { days: 1 } },
      ],
    });
    expect(
      errorOf(() => {
        assertCanCreate(
          policy,
          "labour_attendance",
          "2026-10-05",
          accountant,
          TODAY,
        );
      }).details,
    ).toMatchObject({ limitDays: 1 });
    expect(() => {
      assertCanCreate(
        policy,
        "labour_attendance",
        "2026-10-05",
        engineer,
        TODAY,
      );
    }).not.toThrow();
    // Custom edit days 0 = no restriction, even though the default is 30.
    expect(() => {
      assertCanEdit(
        policy,
        "labour_attendance",
        "2025-01-01",
        accountant,
        TODAY,
      );
    }).not.toThrow();
    expect(() => {
      assertCanCreate(policy, "petty_cash", "2026-10-01", accountant, TODAY);
    }).not.toThrow();
    expect(
      resolveBackdatedLimits(policy, "labour_attendance", accountant),
    ).toEqual({ createDays: 1, editDays: 0, financialClosingDate: null });
  });

  it("locks the closing date inclusively for everyone, overrides and Owner included", () => {
    const policy = createBackdatedPolicy({
      create: { days: 0, overrideDesignationIds: [ACCOUNTANT] },
      edit: { days: 0 },
      financialClosingDate: "2026-03-31",
    });
    for (const actor of [engineer, accountant, owner]) {
      const error = errorOf(() => {
        assertCanCreate(policy, "transaction", "2026-03-31", actor, TODAY);
      });
      expect(error.code).toBe("FINANCIAL_PERIOD_CLOSED");
      expect(error.details).toEqual({
        module: "transaction",
        entryDate: "2026-03-31",
        financialClosingDate: "2026-03-31",
      });
      expect(
        errorOf(() => {
          assertCanEdit(policy, "leave", "2025-12-01", actor, TODAY);
        }).code,
      ).toBe("FINANCIAL_PERIOD_CLOSED");
    }
    expect(() => {
      assertCanCreate(policy, "transaction", "2026-04-01", engineer, TODAY);
    }).not.toThrow();
  });
});

describe("createBackdatedPolicy", () => {
  it("rejects negative, fractional and huge day counts", () => {
    for (const days of [-1, 1.5, 3651])
      expect(
        errorOf(() =>
          createBackdatedPolicy({ create: { days }, edit: { days: 0 } }),
        ).code,
      ).toBe("BACKDATED_DAYS_INVALID");
  });

  it("rejects unknown modules and impossible closing dates", () => {
    expect(
      errorOf(() =>
        createBackdatedPolicy({
          create: { days: 0 },
          edit: { days: 0 },
          modules: [{ key: "salary", mode: "custom" }],
        }),
      ).code,
    ).toBe("BACKDATED_MODULE_UNKNOWN");
    expect(
      errorOf(() =>
        createBackdatedPolicy({
          create: { days: 0 },
          edit: { days: 0 },
          financialClosingDate: "2026-13-01",
        }),
      ).code,
    ).toBe("FINANCIAL_CLOSING_DATE_INVALID");
  });

  it("de-duplicates Designations and lists those custom modules use", () => {
    const policy = createBackdatedPolicy({
      create: { days: 1, overrideDesignationIds: [ENGINEER, ENGINEER] },
      edit: { days: 0 },
      modules: [
        {
          key: "booking",
          mode: "custom",
          create: { days: 1, overrideDesignationIds: [ACCOUNTANT] },
        },
        {
          key: "inquiry",
          mode: "global",
          create: { days: 1, overrideDesignationIds: ["ignored"] },
        },
      ],
    });
    expect(policy.create.overrideDesignationIds).toEqual([ENGINEER]);
    expect(referencedDesignationIds(policy).sort()).toEqual(
      [ACCOUNTANT, ENGINEER].sort(),
    );
  });
});
