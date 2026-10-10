import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  calculateSalary,
  esiContributionPeriod,
  isEsiEligible,
  sampleSalary,
  type SalaryCalculationInput,
  type SalaryDayCounts,
} from "./salary-calculation";
import {
  createSalaryStructure,
  type SalaryComponentInput,
  type SalaryStructureInput,
} from "./salary-structure";
import type { EsiRate, PfRate, PtSlab } from "./statutory";

const PF: PfRate = {
  effectiveFrom: "2014-09-01",
  wageCeiling: 1_500_000,
  employeePercent: "12.00",
  employerPercent: "12.00",
  epsPercent: "8.33",
  source: "test",
};

const ESI: EsiRate = {
  effectiveFrom: "2019-07-01",
  wageCeiling: 2_100_000,
  pwdWageCeiling: 2_500_000,
  employeePercent: "0.75",
  employerPercent: "3.25",
  source: "test",
};

function slab(
  input: Partial<PtSlab> & Pick<PtSlab, "stateCode" | "grossFrom">,
): PtSlab {
  return {
    effectiveFrom: "2023-04-01",
    appliesTo: "everyone",
    grossTo: null,
    monthlyAmount: 20_000,
    specialMonth: null,
    specialMonthAmount: null,
    source: "test",
    ...input,
  };
}

/** As seeded (ADR CM-0008): Karnataka and Maharashtra. */
const KARNATAKA = [
  slab({
    stateCode: "29",
    effectiveFrom: "2025-04-01",
    grossFrom: 2_500_000,
    specialMonth: 2,
    specialMonthAmount: 30_000,
  }),
];
const MAHARASHTRA = [
  slab({
    stateCode: "27",
    appliesTo: "men",
    grossFrom: 750_001,
    grossTo: 1_000_000,
    monthlyAmount: 17_500,
  }),
  slab({
    stateCode: "27",
    appliesTo: "men",
    grossFrom: 1_000_001,
    specialMonth: 2,
    specialMonthAmount: 30_000,
  }),
  slab({
    stateCode: "27",
    appliesTo: "women",
    grossFrom: 2_500_001,
    specialMonth: 2,
    specialMonthAmount: 30_000,
  }),
];

function component(
  input: Partial<SalaryComponentInput> & Pick<SalaryComponentInput, "id">,
): SalaryComponentInput {
  return {
    name: input.id,
    basis: "percent_of_base",
    amount: null,
    percent: null,
    isBalancing: false,
    countsForPfWage: false,
    ...input,
  };
}

/** Basic 50% (PF wage), HRA 20%, Conveyance ₹1,600, Special the balance; Canteen ₹500. */
function structureWith(overrides: Partial<SalaryStructureInput> = {}) {
  return createSalaryStructure({
    name: "Site staff",
    description: null,
    components: [
      component({
        id: "basic",
        name: "Basic",
        percent: "50",
        countsForPfWage: true,
      }),
      component({ id: "hra", name: "HRA", percent: "20" }),
      component({
        id: "conveyance",
        name: "Conveyance",
        basis: "fixed",
        amount: 160_000,
      }),
      component({
        id: "special",
        name: "Special Allowance",
        isBalancing: true,
      }),
    ],
    pf: {
      applicable: true,
      employeePercent: null,
      capAtCeiling: true,
      wageCeiling: null,
    },
    esi: { applicable: true, employeePercent: null },
    pt: { applicable: true, monthlyAmount: null },
    deductAbsentDays: true,
    deductUnpaidLeave: true,
    otherDeductions: [{ name: "Canteen", amount: 50_000 }],
    isActive: true,
    ...overrides,
  });
}

/** Basic 60% (PF wage) and HRA 40%; no other deductions. */
function splitStructure(overrides: Partial<SalaryStructureInput> = {}) {
  return structureWith({
    components: [
      component({
        id: "basic",
        name: "Basic",
        percent: "60",
        countsForPfWage: true,
      }),
      component({ id: "hra", name: "HRA", percent: "40" }),
    ],
    otherDeductions: [],
    ...overrides,
  });
}

function fullMonth(days: number): SalaryDayCounts {
  return {
    workingDays: days,
    present: days,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    weekOff: 0,
    holidays: 0,
  };
}

function input(
  overrides: Partial<SalaryCalculationInput> = {},
): SalaryCalculationInput {
  return {
    structure: structureWith(),
    employee: { baseMonthly: 3_000_000, componentOverrides: {}, gender: null },
    month: "2026-09",
    days: fullMonth(30),
    overtime: [],
    totalHours: 240,
    statutory: { pf: PF, esi: ESI, ptStateCode: "29", ptSlabs: KARNATAKA },
    esiEligible: false,
    advances: [],
    ...overrides,
  };
}

function codeOf(run: () => unknown): { code: string; field: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

describe("calculateSalary: a full month (golden, 30 days)", () => {
  const slip = calculateSalary(input());

  it("earns every component in full", () => {
    expect(slip.daysInMonth).toBe(30);
    expect(slip.days.payable).toBe(30);
    expect(
      slip.earnings.map((line) => [line.name, line.monthly, line.earned]),
    ).toEqual([
      ["Basic", 1_500_000, 1_500_000],
      ["HRA", 600_000, 600_000],
      ["Conveyance", 160_000, 160_000],
      ["Special Allowance", 740_000, 740_000],
    ]);
    expect(slip.fullMonthGross).toBe(3_000_000);
    expect(slip.grossEarnings).toBe(3_000_000);
    expect(slip.absentDeduction).toBe(0);
    expect(slip.unpaidLeaveDeduction).toBe(0);
  });

  it("charges PF on Basic at the ₹15,000 ceiling, employer split into EPF and EPS", () => {
    expect(slip.pf).toEqual({
      wage: 1_500_000,
      contributoryWage: 1_500_000,
      employee: 180_000,
      // EPS 8.33% of ₹15,000 = ₹1,249.50 → ₹1,250; EPF the rest of ₹1,800.
      employerEps: 125_000,
      employerEpf: 55_000,
      employerTotal: 180_000,
    });
  });

  it("charges no ESI when not eligible, Karnataka PT and the other deductions", () => {
    expect(slip.esi).toEqual({ wage: 0, employee: 0, employer: 0 });
    expect(slip.professionalTax).toBe(20_000);
    expect(slip.otherDeductions).toEqual([
      { name: "Canteen", amount: 50_000, charged: 50_000 },
    ]);
    expect(slip.totalDeductions).toBe(180_000 + 20_000 + 50_000);
    expect(slip.netPayable).toBe(2_750_000);
    expect(slip.shortfall).toBeNull();
  });

  it("snapshots the statutory figures it used", () => {
    expect(slip.statutorySnapshot).toMatchObject({
      month: "2026-09",
      rounding: {
        earnings: "half_up_paisa",
        pf: "half_up_rupee",
        esi: "up_to_rupee",
      },
      pf: {
        applicable: true,
        rateEffectiveFrom: "2014-09-01",
        capAtCeiling: true,
        wageCeiling: 1_500_000,
        tableWageCeiling: 1_500_000,
        employeePercent: "12.00",
        employerPercent: "12.00",
        epsPercent: "8.33",
        employeePercentOverridden: false,
        wageCeilingOverridden: false,
      },
      esi: { applicable: true, eligible: false, wageCeiling: 2_100_000 },
      pt: {
        basis: "slab",
        stateCode: "29",
        amount: 20_000,
        slab: { grossFrom: 2_500_000, monthlyAmount: 20_000 },
      },
    });
    // Plain JSON: it is stored as is.
    expect(JSON.parse(JSON.stringify(slip.statutorySnapshot))).toEqual(
      slip.statutorySnapshot,
    );
  });
});

describe("calculateSalary: PF", () => {
  it("charges PF on the whole PF wage when the cap is off; EPS stays at the ceiling", () => {
    const slip = calculateSalary(
      input({
        structure: structureWith({
          pf: {
            applicable: true,
            employeePercent: null,
            capAtCeiling: false,
            wageCeiling: null,
          },
        }),
        employee: {
          baseMonthly: 4_000_000,
          componentOverrides: {},
          gender: null,
        },
      }),
    );
    expect(slip.pf).toEqual({
      wage: 2_000_000,
      contributoryWage: 2_000_000,
      employee: 240_000,
      employerEps: 125_000,
      employerEpf: 115_000,
      employerTotal: 240_000,
    });
  });

  it("caps at the structure's own ceiling and uses its own employee %", () => {
    const slip = calculateSalary(
      input({
        structure: structureWith({
          pf: {
            applicable: true,
            employeePercent: "10",
            capAtCeiling: true,
            wageCeiling: 2_100_000,
          },
        }),
        employee: {
          baseMonthly: 5_000_000,
          componentOverrides: {},
          gender: null,
        },
      }),
    );
    expect(slip.pf.wage).toBe(2_500_000);
    expect(slip.pf.contributoryWage).toBe(2_100_000);
    expect(slip.pf.employee).toBe(210_000);
    // Employer stays at the table's 12%; EPS on the table's ₹15,000.
    expect(slip.pf.employerTotal).toBe(252_000);
    expect(slip.pf.employerEps).toBe(125_000);
    expect(slip.statutorySnapshot.pf).toMatchObject({
      wageCeiling: 2_100_000,
      employeePercent: "10",
      employeePercentOverridden: true,
      wageCeilingOverridden: true,
    });
  });

  it("charges PF on the earned PF wage below the ceiling, rounded half up to the rupee", () => {
    // ₹10,000 all Basic, 31-day month, one half day: 30.5 payable days.
    const slip = calculateSalary(
      input({
        structure: createSalaryStructure({
          name: "Basic only",
          description: null,
          components: [
            component({
              id: "basic",
              name: "Basic",
              percent: "100",
              countsForPfWage: true,
            }),
          ],
          pf: {
            applicable: true,
            employeePercent: null,
            capAtCeiling: true,
            wageCeiling: null,
          },
          esi: { applicable: false, employeePercent: null },
          pt: { applicable: false, monthlyAmount: null },
          deductAbsentDays: true,
          deductUnpaidLeave: true,
          otherDeductions: [],
          isActive: true,
        }),
        employee: {
          baseMonthly: 1_000_000,
          componentOverrides: {},
          gender: null,
        },
        month: "2026-10",
        days: { ...fullMonth(31), present: 30, halfDays: 1 },
      }),
    );
    expect(slip.days.payable).toBe(30.5);
    // ₹10,000 × 61 / 62 = ₹9,838.7096… → 983,871 paise.
    expect(slip.grossEarnings).toBe(983_871);
    // 12% = ₹1,180.645… → ₹1,181.
    expect(slip.pf.employee).toBe(118_100);
    // EPS 8.33% = ₹819.56… → ₹820; EPF ₹361.
    expect(slip.pf.employerEps).toBe(82_000);
    expect(slip.pf.employerEpf).toBe(36_100);
  });

  it("charges no PF when the structure has it off or there is no PF row", () => {
    expect(
      calculateSalary(
        input({
          structure: structureWith({
            pf: {
              applicable: false,
              employeePercent: null,
              capAtCeiling: true,
              wageCeiling: null,
            },
          }),
        }),
      ).pf,
    ).toEqual({
      wage: 0,
      contributoryWage: 0,
      employee: 0,
      employerEpf: 0,
      employerEps: 0,
      employerTotal: 0,
    });
    const before = calculateSalary(
      input({
        statutory: { pf: null, esi: ESI, ptStateCode: null, ptSlabs: [] },
      }),
    );
    expect(before.pf.employee).toBe(0);
    expect(before.statutorySnapshot.pf.rateEffectiveFrom).toBeNull();
  });
});

describe("calculateSalary: ESI", () => {
  const atBase = (baseMonthly: number, esiEligible: boolean) =>
    calculateSalary(
      input({
        structure: splitStructure(),
        employee: { baseMonthly, componentOverrides: {}, gender: null },
        esiEligible,
      }),
    );

  it("is eligible at exactly ₹21,000 and not a paisa above", () => {
    expect(isEsiEligible(2_100_000, ESI)).toBe(true);
    expect(isEsiEligible(2_100_001, ESI)).toBe(false);
    expect(isEsiEligible(1_000_000, null)).toBe(false);
  });

  it("charges both shares on gross, rounded up to the rupee", () => {
    const slip = atBase(2_100_000, true);
    // 0.75% of ₹21,000 = ₹157.50 → ₹158; 3.25% = ₹682.50 → ₹683.
    expect(slip.esi).toEqual({
      wage: 2_100_000,
      employee: 15_800,
      employer: 68_300,
    });
    expect(slip.statutorySnapshot.esi).toMatchObject({
      eligible: true,
      employeePercent: "0.75",
      employerPercent: "3.25",
    });
  });

  it("keeps charging for the period after a raise above the ceiling", () => {
    // Eligible at the period's start; gross is now ₹25,000.
    expect(atBase(2_500_000, true).esi.employee).toBe(18_800);
    expect(atBase(2_500_000, false).esi.employee).toBe(0);
  });

  it("uses the structure's employee % and charges nothing when ESI is off", () => {
    const own = calculateSalary(
      input({
        structure: splitStructure({
          esi: { applicable: true, employeePercent: "1" },
        }),
        employee: {
          baseMonthly: 2_000_000,
          componentOverrides: {},
          gender: null,
        },
        esiEligible: true,
      }),
    );
    expect(own.esi.employee).toBe(20_000);
    expect(own.esi.employer).toBe(65_000);
    const off = calculateSalary(
      input({
        structure: splitStructure({
          esi: { applicable: false, employeePercent: null },
        }),
        employee: {
          baseMonthly: 2_000_000,
          componentOverrides: {},
          gender: null,
        },
        esiEligible: true,
      }),
    );
    expect(off.esi).toEqual({ wage: 0, employee: 0, employer: 0 });
  });

  it("names the contribution period: April–September and October–March", () => {
    expect(esiContributionPeriod("2026-04")).toEqual({
      start: "2026-04",
      end: "2026-09",
    });
    expect(esiContributionPeriod("2026-09")).toEqual({
      start: "2026-04",
      end: "2026-09",
    });
    expect(esiContributionPeriod("2026-10")).toEqual({
      start: "2026-10",
      end: "2027-03",
    });
    expect(esiContributionPeriod("2026-12")).toEqual({
      start: "2026-10",
      end: "2027-03",
    });
    expect(esiContributionPeriod("2027-01")).toEqual({
      start: "2026-10",
      end: "2027-03",
    });
    expect(esiContributionPeriod("2027-03")).toEqual({
      start: "2026-10",
      end: "2027-03",
    });
  });
});

describe("calculateSalary: professional tax", () => {
  const maharashtra = (
    baseMonthly: number,
    month: string,
    gender: "male" | "female" | null,
  ) =>
    calculateSalary(
      input({
        structure: splitStructure(),
        employee: { baseMonthly, componentOverrides: {}, gender },
        month,
        days: fullMonth(month === "2027-02" ? 28 : 31),
        statutory: {
          pf: PF,
          esi: ESI,
          ptStateCode: "27",
          ptSlabs: MAHARASHTRA,
        },
      }),
    ).professionalTax;

  it("charges Maharashtra men ₹175 / ₹200, and ₹300 in February", () => {
    expect(maharashtra(750_000, "2026-10", "male")).toBe(0);
    expect(maharashtra(900_000, "2026-10", "male")).toBe(17_500);
    expect(maharashtra(1_200_000, "2026-10", "male")).toBe(20_000);
    expect(maharashtra(1_200_000, "2027-02", "male")).toBe(30_000);
  });

  it("exempts Maharashtra women up to ₹25,000 and uses the men's slab without a gender", () => {
    expect(maharashtra(2_500_000, "2026-10", "female")).toBe(0);
    expect(maharashtra(2_600_000, "2026-10", "female")).toBe(20_000);
    expect(maharashtra(2_600_000, "2027-02", "female")).toBe(30_000);
    expect(maharashtra(1_200_000, "2026-10", null)).toBe(20_000);
  });

  it("charges Karnataka from ₹25,000, ₹300 in February", () => {
    const karnataka = (baseMonthly: number, month: string, days: number) =>
      calculateSalary(
        input({
          structure: splitStructure(),
          employee: { baseMonthly, componentOverrides: {}, gender: null },
          month,
          days: fullMonth(days),
        }),
      ).professionalTax;
    expect(karnataka(2_499_999, "2026-10", 31)).toBe(0);
    expect(karnataka(2_500_000, "2026-10", 31)).toBe(20_000);
    expect(karnataka(2_500_000, "2027-02", 28)).toBe(30_000);
  });

  it("uses the structure's flat amount, and none without a state or with PT off", () => {
    const flat = calculateSalary(
      input({
        structure: splitStructure({
          pt: { applicable: true, monthlyAmount: 15_000 },
        }),
      }),
    );
    expect(flat.professionalTax).toBe(15_000);
    expect(flat.statutorySnapshot.pt).toMatchObject({
      basis: "flat",
      stateCode: null,
    });
    const noState = calculateSalary(
      input({
        statutory: { pf: PF, esi: ESI, ptStateCode: null, ptSlabs: KARNATAKA },
      }),
    );
    expect(noState.professionalTax).toBe(0);
    expect(noState.statutorySnapshot.pt.basis).toBe("none");
    const off = calculateSalary(
      input({
        structure: structureWith({
          pt: { applicable: false, monthlyAmount: null },
        }),
      }),
    );
    expect(off.professionalTax).toBe(0);
  });

  it("charges PT on gross earned, after absent days", () => {
    // ₹26,000 in a 30-day month with 3 absent days earns ₹23,400: below ₹25,000.
    const slip = calculateSalary(
      input({
        structure: splitStructure(),
        employee: {
          baseMonthly: 2_600_000,
          componentOverrides: {},
          gender: null,
        },
        days: { ...fullMonth(30), present: 27, absent: 3 },
      }),
    );
    expect(slip.grossEarnings).toBe(2_340_000);
    expect(slip.professionalTax).toBe(0);
  });
});

describe("calculateSalary: proration and the deduction switches (golden, 31 days)", () => {
  const october = (
    days: Partial<SalaryDayCounts>,
    switches: Partial<SalaryStructureInput> = {},
  ) =>
    calculateSalary(
      input({
        structure: splitStructure(switches),
        employee: {
          baseMonthly: 3_100_000,
          componentOverrides: {},
          gender: null,
        },
        month: "2026-10",
        days: { ...fullMonth(31), ...days },
        statutory: { pf: PF, esi: ESI, ptStateCode: null, ptSlabs: [] },
      }),
    );

  it("takes a half day as half absent", () => {
    // 2 absent + 2 half days = 3 days off; 28 of 31 payable.
    const slip = october({ present: 23, absent: 2, halfDays: 2, weekOff: 4 });
    expect(slip.days.payable).toBe(28);
    expect(slip.earnings.map((line) => line.earned)).toEqual([
      1_680_000, 1_120_000,
    ]);
    expect(slip.grossEarnings).toBe(2_800_000);
    expect(slip.absentDeduction).toBe(300_000);
    expect(slip.unpaidLeaveDeduction).toBe(0);
  });

  it("pays week offs, holidays and paid leave", () => {
    const slip = october({
      present: 20,
      weekOff: 8,
      holidays: 1,
      paidLeave: 2,
    });
    expect(slip.days.payable).toBe(31);
    expect(slip.grossEarnings).toBe(3_100_000);
  });

  it("deducts unpaid leave only when the switch is on", () => {
    const on = october({ present: 29, unpaidLeave: 2 });
    expect(on.days.payable).toBe(29);
    expect(on.unpaidLeaveDeduction).toBe(200_000);
    expect(on.grossEarnings).toBe(2_900_000);
    const off = october(
      { present: 29, unpaidLeave: 2 },
      { deductUnpaidLeave: false },
    );
    expect(off.days.payable).toBe(31);
    expect(off.unpaidLeaveDeduction).toBe(0);
  });

  it("deducts absent days only when the switch is on", () => {
    const off = october(
      { present: 28, absent: 2, halfDays: 1 },
      { deductAbsentDays: false },
    );
    expect(off.days.payable).toBe(31);
    expect(off.absentDeduction).toBe(0);
  });

  it("splits what proration took between absent days and unpaid leave, to the paisa", () => {
    const slip = october({
      present: 26,
      absent: 1,
      halfDays: 1,
      unpaidLeave: 3,
    });
    // 1.5 absent + 3 unpaid = 4.5 off; 26.5 payable.
    expect(slip.days.payable).toBe(26.5);
    expect(
      slip.fullMonthGross - slip.absentDeduction - slip.unpaidLeaveDeduction,
    ).toBe(slip.grossEarnings);
    expect(slip.absentDeduction).toBe(150_000);
    expect(slip.unpaidLeaveDeduction).toBe(300_000);
  });
});

describe("calculateSalary: an all-absent month", () => {
  it("earns nothing, charges nothing and reports what it could not take", () => {
    const slip = calculateSalary(
      input({
        structure: structureWith({
          pt: { applicable: true, monthlyAmount: 20_000 },
        }),
        days: { ...fullMonth(30), present: 0, absent: 30 },
        esiEligible: true,
        advances: [{ advanceId: "adv-1", due: 500_000 }],
      }),
    );
    expect(slip.days.payable).toBe(0);
    expect(slip.grossEarnings).toBe(0);
    expect(slip.absentDeduction).toBe(3_000_000);
    expect(slip.pf.employee).toBe(0);
    expect(slip.esi.employee).toBe(0);
    // Flat PT is only charged in a month with earnings.
    expect(slip.professionalTax).toBe(0);
    expect(slip.otherDeductions[0]?.charged).toBe(0);
    expect(slip.advanceRecovered).toBe(0);
    expect(slip.netPayable).toBe(0);
    expect(slip.shortfall).toEqual({
      professionalTax: 0,
      otherDeductions: 50_000,
      advance: 500_000,
    });
  });
});

describe("calculateSalary: overtime", () => {
  it("pays twice the hourly rate on days whose shift allows overtime", () => {
    const slip = calculateSalary(
      input({
        overtime: [
          {
            date: "2026-09-02",
            hours: 3,
            overtimeAllowed: true,
            shiftWorkingHours: 8,
          },
          {
            date: "2026-09-03",
            hours: 2,
            overtimeAllowed: false,
            shiftWorkingHours: 8,
          },
          {
            date: "2026-09-04",
            hours: 1.5,
            overtimeAllowed: true,
            shiftWorkingHours: 9,
          },
        ],
      }),
    );
    // ₹30,000 ÷ 30 ÷ 8 = ₹125 an hour; 2 × 3 h = ₹750.
    // ₹30,000 ÷ 30 ÷ 9 = ₹111.11; 2 × 1.5 h = ₹333.333… → ₹333.33.
    expect(slip.overtimePay).toBe(75_000 + 33_333);
    expect(slip.overtimeHours).toBe(6.5);
    expect(slip.paidOvertimeHours).toBe(4.5);
    expect(slip.grossEarnings).toBe(3_000_000 + 108_333);
    // Overtime never counts for PF.
    expect(slip.pf.wage).toBe(1_500_000);
  });

  it("counts overtime in the ESI wage", () => {
    const slip = calculateSalary(
      input({
        structure: splitStructure(),
        employee: {
          baseMonthly: 2_000_000,
          componentOverrides: {},
          gender: null,
        },
        esiEligible: true,
        overtime: [
          {
            date: "2026-09-02",
            hours: 4,
            overtimeAllowed: true,
            shiftWorkingHours: 8,
          },
        ],
      }),
    );
    // ₹20,000 ÷ 30 ÷ 8 × 2 × 4 = ₹666.666… → ₹666.67.
    expect(slip.overtimePay).toBe(66_667);
    expect(slip.esi.wage).toBe(2_066_667);
    // 0.75% of ₹20,666.67 = ₹155.0000… → ₹156 (rounded up).
    expect(slip.esi.employee).toBe(15_600);
  });

  it("refuses impossible hours", () => {
    expect(
      codeOf(() =>
        calculateSalary(
          input({
            overtime: [
              {
                date: "2026-09-02",
                hours: 25,
                overtimeAllowed: true,
                shiftWorkingHours: 8,
              },
            ],
          }),
        ),
      ),
    ).toEqual({ code: "SALARY_HOURS_INVALID", field: "overtime.0.hours" });
    expect(
      codeOf(() =>
        calculateSalary(
          input({
            overtime: [
              {
                date: "2026-09-02",
                hours: 1,
                overtimeAllowed: true,
                shiftWorkingHours: 0,
              },
            ],
          }),
        ),
      ).field,
    ).toBe("overtime.0.shiftWorkingHours");
  });
});

describe("calculateSalary: advances and net", () => {
  it("recovers advance instalments due", () => {
    const slip = calculateSalary(
      input({
        advances: [
          { advanceId: "adv-1", due: 500_000 },
          { advanceId: "adv-2", due: 250_000 },
        ],
      }),
    );
    expect(slip.advances).toEqual([
      { advanceId: "adv-1", due: 500_000, recovered: 500_000 },
      { advanceId: "adv-2", due: 250_000, recovered: 250_000 },
    ]);
    expect(slip.advanceRecovered).toBe(750_000);
    expect(slip.netPayable).toBe(2_750_000 - 750_000);
  });

  it("caps recoveries so net never goes negative, advances first", () => {
    const slip = calculateSalary(
      input({ advances: [{ advanceId: "adv-1", due: 3_000_000 }] }),
    );
    expect(slip.netPayable).toBe(0);
    expect(slip.advances[0]?.recovered).toBe(2_750_000);
    expect(slip.otherDeductions[0]?.charged).toBe(50_000);
    expect(slip.shortfall).toEqual({
      professionalTax: 0,
      otherDeductions: 0,
      advance: 250_000,
    });
  });

  it("refuses a negative instalment", () => {
    expect(
      codeOf(() =>
        calculateSalary(input({ advances: [{ advanceId: "a", due: -1 }] })),
      ),
    ).toEqual({ code: "ADVANCE_DUE_INVALID", field: "advances.0.due" });
  });
});

describe("calculateSalary: input checks", () => {
  it("refuses day counts that are not halves or exceed the month", () => {
    expect(
      codeOf(() =>
        calculateSalary(input({ days: { ...fullMonth(30), absent: 0.3 } })),
      ),
    ).toEqual({ code: "SALARY_DAYS_INVALID", field: "days.absent" });
    expect(
      codeOf(() =>
        calculateSalary(
          input({ days: { ...fullMonth(30), present: 30, absent: 1 } }),
        ),
      ),
    ).toEqual({ code: "SALARY_DAYS_INVALID", field: "days" });
    expect(
      codeOf(() =>
        calculateSalary(input({ days: { ...fullMonth(30), halfDays: 0.5 } })),
      ).field,
    ).toBe("days.halfDays");
  });

  it("refuses a base whose balancing component would be negative", () => {
    expect(
      codeOf(() =>
        calculateSalary(
          input({
            employee: {
              baseMonthly: 100_000,
              componentOverrides: {},
              gender: null,
            },
          }),
        ),
      ),
    ).toEqual({ code: "BALANCING_COMPONENT_NEGATIVE", field: "baseMonthly" });
  });

  it("applies the member's own component amounts", () => {
    const slip = calculateSalary(
      input({
        employee: {
          baseMonthly: 3_000_000,
          componentOverrides: { conveyance: { amount: 0 } },
          gender: null,
        },
      }),
    );
    expect(slip.earnings.map((line) => line.earned)).toEqual([
      1_500_000, 600_000, 0, 900_000,
    ]);
  });
});

describe("sampleSalary (CM-314 preview)", () => {
  it("works out a full month present, with ESI decided by that gross", () => {
    const statutory = {
      pf: PF,
      esi: ESI,
      ptStateCode: "29",
      ptSlabs: KARNATAKA,
    };
    const low = sampleSalary({
      structure: splitStructure(),
      baseMonthly: 2_100_000,
      month: "2026-10",
      statutory,
    });
    expect(low.grossEarnings).toBe(2_100_000);
    expect(low.esi.employee).toBe(15_800);
    // 60% Basic = ₹12,600 → PF ₹1,512.
    expect(low.pf.employee).toBe(151_200);
    expect(low.netPayable).toBe(2_100_000 - 151_200 - 15_800);
    const high = sampleSalary({
      structure: splitStructure(),
      baseMonthly: 2_100_100,
      month: "2026-10",
      statutory,
    });
    expect(high.esi.employee).toBe(0);
  });
});
