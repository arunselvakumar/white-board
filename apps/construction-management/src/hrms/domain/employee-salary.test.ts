import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  configInForce,
  createEmployeeSalaryConfig,
  type EmployeeSalaryConfigInput,
} from "./employee-salary";
import { createSalaryStructure } from "./salary-structure";

const structure = createSalaryStructure({
  name: "Office",
  description: null,
  components: [
    {
      id: "basic",
      name: "Basic",
      basis: "percent_of_base",
      amount: null,
      percent: "50",
      isBalancing: false,
      countsForPfWage: true,
    },
    {
      id: "conveyance",
      name: "Conveyance",
      basis: "fixed",
      amount: 200_000,
      percent: null,
      isBalancing: false,
      countsForPfWage: false,
    },
    {
      id: "special",
      name: "Special",
      basis: "fixed",
      amount: null,
      percent: null,
      isBalancing: true,
      countsForPfWage: false,
    },
  ],
  pf: {
    applicable: true,
    employeePercent: null,
    capAtCeiling: true,
    wageCeiling: null,
  },
  esi: { applicable: false, employeePercent: null },
  pt: { applicable: true, monthlyAmount: null },
  deductAbsentDays: true,
  deductUnpaidLeave: true,
  otherDeductions: [],
  isActive: true,
});

function config(overrides: Partial<EmployeeSalaryConfigInput> = {}) {
  return createEmployeeSalaryConfig(structure, {
    structureId: "structure-1",
    baseMonthly: 2_000_000,
    componentOverrides: {},
    gender: null,
    uan: null,
    esiIpNumber: null,
    effectiveFrom: "2026-10-01",
    ...overrides,
  });
}

function fieldOf(run: () => unknown): { code: string; field: unknown } {
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

describe("createEmployeeSalaryConfig (CM-315)", () => {
  it("keeps a valid configuration with its components", () => {
    const { config: saved, components } = config({
      gender: "female",
      uan: "1001 2345 6789",
      esiIpNumber: "3112345678",
      componentOverrides: { conveyance: { amount: 150_000 } },
    });
    expect(saved).toEqual({
      structureId: "structure-1",
      baseMonthly: 2_000_000,
      componentOverrides: { conveyance: { amount: 150_000 } },
      gender: "female",
      uan: "100123456789",
      esiIpNumber: "3112345678",
      effectiveFrom: "2026-10-01",
    });
    expect(components.map((line) => line.monthly)).toEqual([
      1_000_000, 150_000, 850_000,
    ]);
  });

  it("refuses a base the balancing component cannot cover", () => {
    expect(fieldOf(() => config({ baseMonthly: 300_000 }))).toEqual({
      code: "BALANCING_COMPONENT_NEGATIVE",
      field: "baseMonthly",
    });
  });

  it("checks the UAN, ESI IP number, gender and date", () => {
    expect(fieldOf(() => config({ uan: "12345" }))).toEqual({
      code: "UAN_INVALID",
      field: "uan",
    });
    expect(fieldOf(() => config({ esiIpNumber: "31123456789" }))).toEqual({
      code: "ESI_IP_NUMBER_INVALID",
      field: "esiIpNumber",
    });
    expect(fieldOf(() => config({ gender: "unknown" }))).toEqual({
      code: "GENDER_INVALID",
      field: "gender",
    });
    expect(fieldOf(() => config({ effectiveFrom: "2026-02-30" }))).toEqual({
      code: "EFFECTIVE_FROM_INVALID",
      field: "effectiveFrom",
    });
    // Blank identifiers are not recorded.
    expect(config({ uan: "  ", esiIpNumber: "" }).config).toMatchObject({
      uan: null,
      esiIpNumber: null,
    });
  });
});

describe("configInForce", () => {
  const rows = [
    { effectiveFrom: "2026-04-01", base: 1 },
    { effectiveFrom: "2026-10-01", base: 2 },
  ];

  it("takes the latest row starting on or before the date", () => {
    expect(configInForce(rows, "2026-03-31")).toBeNull();
    expect(configInForce(rows, "2026-09-30")?.base).toBe(1);
    expect(configInForce(rows, "2026-10-01")?.base).toBe(2);
  });
});
