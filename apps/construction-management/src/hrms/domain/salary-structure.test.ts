import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  cleanOverrides,
  componentAmounts,
  createSalaryStructure,
  formatPercent,
  percentHundredths,
  percentOf,
  type SalaryComponentInput,
  type SalaryStructureInput,
} from "./salary-structure";

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

/** Basic 50% (PF wage), HRA 20%, Conveyance ₹1,600, Special the balance. */
function standardInput(
  overrides: Partial<SalaryStructureInput> = {},
): SalaryStructureInput {
  return {
    name: "Site staff",
    description: "Engineers and supervisors",
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

describe("createSalaryStructure (CM-314)", () => {
  it("keeps a valid structure, trimmed, with the balancing amount cleared", () => {
    const structure = createSalaryStructure(
      standardInput({
        name: "  Site staff ",
        description: "  ",
        components: [
          component({
            id: "basic",
            name: " Basic ",
            percent: "50.50",
            countsForPfWage: true,
          }),
          component({
            id: "special",
            name: "Special",
            isBalancing: true,
            basis: "fixed",
            amount: 99,
          }),
        ],
      }),
    );
    expect(structure.name).toBe("Site staff");
    expect(structure.description).toBeNull();
    expect(structure.components[0]).toMatchObject({
      name: "Basic",
      percent: "50.5",
      amount: null,
    });
    expect(structure.components[1]).toMatchObject({
      isBalancing: true,
      amount: null,
      percent: null,
    });
  });

  it("needs a name and at least one component", () => {
    expect(
      codeOf(() => createSalaryStructure(standardInput({ name: " " }))),
    ).toEqual({
      code: "SALARY_STRUCTURE_NAME_REQUIRED",
      field: "name",
    });
    expect(
      codeOf(() => createSalaryStructure(standardInput({ components: [] }))),
    ).toEqual({ code: "SALARY_COMPONENTS_REQUIRED", field: "components" });
  });

  it("needs percentage-only components to make exactly 100%", () => {
    const percentOnly = (a: string, b: string) =>
      standardInput({
        components: [
          component({
            id: "basic",
            name: "Basic",
            percent: a,
            countsForPfWage: true,
          }),
          component({ id: "hra", name: "HRA", percent: b }),
        ],
      });
    expect(
      createSalaryStructure(percentOnly("60", "40")).components,
    ).toHaveLength(2);
    expect(
      createSalaryStructure(percentOnly("33.33", "66.67")).components,
    ).toHaveLength(2);
    expect(
      codeOf(() => createSalaryStructure(percentOnly("60", "30"))),
    ).toEqual({
      code: "SALARY_COMPONENTS_NOT_100_PERCENT",
      field: "components",
    });
    expect(
      codeOf(() => createSalaryStructure(percentOnly("60", "40.01"))),
    ).toEqual({
      code: "SALARY_COMPONENTS_NOT_100_PERCENT",
      field: "components",
    });
  });

  it("needs a balancing component when any component is a fixed amount", () => {
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            components: [
              component({
                id: "basic",
                name: "Basic",
                percent: "50",
                countsForPfWage: true,
              }),
              component({
                id: "hra",
                name: "HRA",
                basis: "fixed",
                amount: 500_000,
              }),
            ],
          }),
        ),
      ).code,
    ).toBe("SALARY_COMPONENTS_NOT_100_PERCENT");
  });

  it("refuses percentages over 100% beside a balancing component", () => {
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            components: [
              component({
                id: "basic",
                name: "Basic",
                percent: "70",
                countsForPfWage: true,
              }),
              component({ id: "hra", name: "HRA", percent: "40" }),
              component({ id: "special", name: "Special", isBalancing: true }),
            ],
          }),
        ),
      ),
    ).toEqual({ code: "BALANCING_COMPONENT_NEGATIVE", field: "components" });
  });

  it("allows one balancing component only, and unique names", () => {
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            components: [
              component({
                id: "a",
                name: "Basic",
                isBalancing: true,
                countsForPfWage: true,
              }),
              component({ id: "b", name: "Special", isBalancing: true }),
            ],
          }),
        ),
      ),
    ).toEqual({
      code: "BALANCING_COMPONENT_MULTIPLE",
      field: "components.1.isBalancing",
    });
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            components: [
              component({
                id: "a",
                name: "Basic",
                percent: "50",
                countsForPfWage: true,
              }),
              component({ id: "b", name: "basic", isBalancing: true }),
            ],
          }),
        ),
      ),
    ).toEqual({
      code: "SALARY_COMPONENT_NAME_DUPLICATE",
      field: "components.1.name",
    });
  });

  it("checks each component's amount and percentage", () => {
    const withLine = (line: SalaryComponentInput) =>
      standardInput({
        components: [
          line,
          component({
            id: "special",
            name: "Special",
            isBalancing: true,
            countsForPfWage: true,
          }),
        ],
      });
    expect(
      codeOf(() =>
        createSalaryStructure(
          withLine(
            component({ id: "x", name: "X", basis: "fixed", amount: 0 }),
          ),
        ),
      ),
    ).toEqual({
      code: "SALARY_COMPONENT_AMOUNT_INVALID",
      field: "components.0.amount",
    });
    expect(
      codeOf(() =>
        createSalaryStructure(
          withLine(component({ id: "x", name: "X", percent: "12.345" })),
        ),
      ),
    ).toEqual({
      code: "SALARY_COMPONENT_PERCENT_INVALID",
      field: "components.0.percent",
    });
    expect(
      codeOf(() =>
        createSalaryStructure(
          withLine(component({ id: "x", name: "X", percent: "0" })),
        ),
      ).code,
    ).toBe("SALARY_COMPONENT_PERCENT_INVALID");
    expect(
      codeOf(() =>
        createSalaryStructure(
          withLine(component({ id: "x", name: "X", basis: "hourly" })),
        ),
      ).code,
    ).toBe("SALARY_COMPONENT_BASIS_INVALID");
  });

  it("needs a PF wage component when PF applies, and checks the overrides", () => {
    const noPfWage = standardInput({
      components: [
        component({ id: "basic", name: "Basic", percent: "50" }),
        component({ id: "special", name: "Special", isBalancing: true }),
      ],
    });
    expect(codeOf(() => createSalaryStructure(noPfWage))).toEqual({
      code: "PF_WAGE_COMPONENTS_REQUIRED",
      field: "components",
    });
    expect(
      createSalaryStructure({
        ...noPfWage,
        pf: { ...noPfWage.pf, applicable: false },
      }).pf.applicable,
    ).toBe(false);
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            pf: {
              applicable: true,
              employeePercent: "101",
              capAtCeiling: true,
              wageCeiling: null,
            },
          }),
        ),
      ),
    ).toEqual({ code: "PF_PERCENT_INVALID", field: "pf.employeePercent" });
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            pf: {
              applicable: true,
              employeePercent: null,
              capAtCeiling: true,
              wageCeiling: 0,
            },
          }),
        ),
      ),
    ).toEqual({ code: "PF_WAGE_CEILING_INVALID", field: "pf.wageCeiling" });
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({ esi: { applicable: true, employeePercent: "abc" } }),
        ),
      ),
    ).toEqual({ code: "ESI_PERCENT_INVALID", field: "esi.employeePercent" });
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({ pt: { applicable: true, monthlyAmount: -1 } }),
        ),
      ),
    ).toEqual({ code: "PT_AMOUNT_INVALID", field: "pt.monthlyAmount" });
  });

  it("drops overrides whose switch is off and keeps the ceiling only when capping", () => {
    const structure = createSalaryStructure(
      standardInput({
        pf: {
          applicable: true,
          employeePercent: "10",
          capAtCeiling: false,
          wageCeiling: 2_100_000,
        },
        esi: { applicable: false, employeePercent: "1" },
        pt: { applicable: false, monthlyAmount: 20_000 },
      }),
    );
    expect(structure.pf).toEqual({
      applicable: true,
      employeePercent: "10",
      capAtCeiling: false,
      wageCeiling: null,
    });
    expect(structure.esi.employeePercent).toBeNull();
    expect(structure.pt.monthlyAmount).toBeNull();
  });

  it("checks other deductions", () => {
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({ otherDeductions: [{ name: "Canteen", amount: 0 }] }),
        ),
      ),
    ).toEqual({
      code: "SALARY_DEDUCTION_AMOUNT_INVALID",
      field: "otherDeductions.0.amount",
    });
    expect(
      codeOf(() =>
        createSalaryStructure(
          standardInput({
            otherDeductions: [
              { name: "Canteen", amount: 100 },
              { name: "canteen", amount: 100 },
            ],
          }),
        ),
      ).code,
    ).toBe("SALARY_DEDUCTION_NAME_DUPLICATE");
  });
});

describe("percentages", () => {
  it("parse and print with two places at most", () => {
    expect(percentHundredths("12.5")).toBe(1250);
    expect(percentHundredths("12.555")).toBeNull();
    expect(formatPercent(1250)).toBe("12.5");
    expect(formatPercent(1205)).toBe("12.05");
    expect(formatPercent(10_000)).toBe("100");
  });

  it("round half up to the paisa", () => {
    // 33.33% of ₹100.01 = 3333.333 paise → 3333.
    expect(percentOf(10_001, "33.33")).toBe(3333);
    // 50% of 1 paisa = 0.5 → 1.
    expect(percentOf(1, "50")).toBe(1);
  });
});

describe("componentAmounts (CM-315)", () => {
  const structure = createSalaryStructure(standardInput());

  it("gives the balancing component what is left of the base", () => {
    const lines = componentAmounts(structure, 3_000_000);
    expect(lines.map((line) => [line.name, line.monthly])).toEqual([
      ["Basic", 1_500_000],
      ["HRA", 600_000],
      ["Conveyance", 160_000],
      ["Special Allowance", 740_000],
    ]);
    expect(lines.reduce((sum, line) => sum + line.monthly, 0)).toBe(3_000_000);
  });

  it("refuses a base that makes the balancing component negative", () => {
    // 70% of ₹5,000 = ₹3,500, plus ₹1,600 fixed = ₹5,100 > ₹5,000.
    const error = (() => {
      try {
        componentAmounts(structure, 500_000);
      } catch (caught) {
        return caught as DomainError;
      }
      return null;
    })();
    expect(error?.code).toBe("BALANCING_COMPONENT_NEGATIVE");
    expect(error?.details).toMatchObject({
      field: "baseMonthly",
      shortBy: 10_000,
    });
    // Exactly zero is allowed.
    expect(componentAmounts(structure, 533_334).at(-1)?.monthly).toBe(0);
  });

  it("puts the rounding paise on the last line when there is no balancing component", () => {
    const thirds = createSalaryStructure(
      standardInput({
        components: [
          component({
            id: "a",
            name: "A",
            percent: "33.33",
            countsForPfWage: true,
          }),
          component({ id: "b", name: "B", percent: "33.33" }),
          component({ id: "c", name: "C", percent: "33.34" }),
        ],
      }),
    );
    const lines = componentAmounts(thirds, 100_001);
    expect(lines.map((line) => line.monthly)).toEqual([33_330, 33_330, 33_341]);
    expect(lines.reduce((sum, line) => sum + line.monthly, 0)).toBe(100_001);
  });

  it("applies a member's overrides, by component id", () => {
    const overrides = cleanOverrides(structure, {
      hra: { percent: "10" },
      conveyance: { amount: 0 },
      gone: { amount: 1 },
    });
    expect(overrides).toEqual({
      hra: { percent: "10" },
      conveyance: { amount: 0 },
    });
    expect(
      componentAmounts(structure, 3_000_000, overrides).map(
        (line) => line.monthly,
      ),
    ).toEqual([1_500_000, 300_000, 0, 1_200_000]);
  });

  it("refuses overriding the balancing component or a malformed override", () => {
    expect(
      codeOf(() => cleanOverrides(structure, { special: { amount: 1 } })),
    ).toEqual({
      code: "COMPONENT_OVERRIDE_BALANCING",
      field: "componentOverrides.special",
    });
    expect(
      codeOf(() =>
        cleanOverrides(structure, { hra: { amount: 1, percent: "1" } }),
      ).code,
    ).toBe("COMPONENT_OVERRIDE_INVALID");
    expect(
      codeOf(() => cleanOverrides(structure, { hra: { percent: "150" } })).code,
    ).toBe("COMPONENT_OVERRIDE_INVALID");
  });

  it("refuses overrides that break a 100% structure's total", () => {
    const split = createSalaryStructure(
      standardInput({
        components: [
          component({
            id: "basic",
            name: "Basic",
            percent: "60",
            countsForPfWage: true,
          }),
          component({ id: "hra", name: "HRA", percent: "40" }),
        ],
      }),
    );
    expect(
      codeOf(() =>
        componentAmounts(split, 1_000_000, { basic: { amount: 500_000 } }),
      ),
    ).toEqual({
      code: "SALARY_COMPONENTS_NOT_100_PERCENT",
      field: "componentOverrides",
    });
  });

  it("refuses a negative or fractional base", () => {
    expect(codeOf(() => componentAmounts(structure, -1)).code).toBe(
      "BASE_MONTHLY_INVALID",
    );
    expect(codeOf(() => componentAmounts(structure, 1.5)).code).toBe(
      "BASE_MONTHLY_INVALID",
    );
  });
});
