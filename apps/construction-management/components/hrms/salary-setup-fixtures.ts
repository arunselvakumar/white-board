import type {
  EmployeeSalariesModel,
  SalaryStatutoryModel,
  SalaryStructureModel,
} from "@/src/queries/hrms-salary-setup";

/** Story data for Salary Structures (CM-314) and Employees (CM-315). */

export const STRUCTURES_PATH = "/api/construction/hrms/salary-structures";
export const EMPLOYEES_PATH = "/api/construction/hrms/employees/salary";

export const STATUTORY: SalaryStatutoryModel = {
  month: "2026-10",
  pf: {
    effectiveFrom: "2014-09-01",
    wageCeiling: 1_500_000,
    employeePercent: "12.00",
    employerPercent: "12.00",
    epsPercent: "8.33",
    source: "EPF",
  },
  esi: {
    effectiveFrom: "2019-07-01",
    wageCeiling: 2_100_000,
    pwdWageCeiling: 2_500_000,
    employeePercent: "0.75",
    employerPercent: "3.25",
    source: "ESI",
  },
  ptStateCode: "29",
  ptSlabs: [
    {
      stateCode: "29",
      effectiveFrom: "2025-04-01",
      appliesTo: "everyone",
      grossFrom: 2_500_000,
      grossTo: null,
      monthlyAmount: 20_000,
      specialMonth: 2,
      specialMonthAmount: 30_000,
      source: "Karnataka",
    },
  ],
};

export const SITE_STAFF: SalaryStructureModel = {
  id: "0199a1b2-0000-7000-8000-000000000101",
  name: "Site staff",
  description: "Engineers and supervisors",
  components: [
    {
      id: "0199a1b2-0000-7000-8000-000000000201",
      name: "Basic",
      basis: "percent_of_base",
      amount: null,
      percent: "50",
      isBalancing: false,
      countsForPfWage: true,
    },
    {
      id: "0199a1b2-0000-7000-8000-000000000202",
      name: "Conveyance",
      basis: "fixed",
      amount: 160_000,
      percent: null,
      isBalancing: false,
      countsForPfWage: false,
    },
    {
      id: "0199a1b2-0000-7000-8000-000000000203",
      name: "Special Allowance",
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
  esi: { applicable: true, employeePercent: null },
  pt: { applicable: true, monthlyAmount: null },
  deductAbsentDays: true,
  deductUnpaidLeave: true,
  otherDeductions: [{ name: "Canteen", amount: 50_000 }],
  isActive: true,
  membersUsing: 2,
  createdAt: "2026-10-01T06:00:00.000Z",
  updatedAt: "2026-10-01T06:00:00.000Z",
};

export const OFFICE: SalaryStructureModel = {
  ...SITE_STAFF,
  id: "0199a1b2-0000-7000-8000-000000000102",
  name: "Office",
  description: null,
  components: [
    {
      id: "0199a1b2-0000-7000-8000-000000000211",
      name: "Basic",
      basis: "percent_of_base",
      amount: null,
      percent: "60",
      isBalancing: false,
      countsForPfWage: true,
    },
    {
      id: "0199a1b2-0000-7000-8000-000000000212",
      name: "HRA",
      basis: "percent_of_base",
      amount: null,
      percent: "40",
      isBalancing: false,
      countsForPfWage: false,
    },
  ],
  esi: { applicable: false, employeePercent: null },
  otherDeductions: [],
  isActive: false,
  membersUsing: 0,
};

export const MEMBER_IDS = {
  owner: "0199a1b2-0000-7000-8000-000000000301",
  engineer: "0199a1b2-0000-7000-8000-000000000302",
  clerk: "0199a1b2-0000-7000-8000-000000000303",
} as const;

export const EMPLOYEES: EmployeeSalariesModel = {
  items: [
    {
      memberId: MEMBER_IDS.owner,
      name: "Arun Selva Kumar",
      memberType: "normal",
      designationName: "Owner",
      active: true,
      status: "configured",
      config: {
        id: "0199a1b2-0000-7000-8000-000000000401",
        structureId: SITE_STAFF.id,
        structureName: SITE_STAFF.name,
        baseMonthly: 6_000_000,
        componentOverrides: {},
        gender: "male",
        uan: "100123456789",
        esiIpNumber: null,
        effectiveFrom: "2026-04-01",
        updatedAt: "2026-10-01T06:00:00.000Z",
      },
    },
    {
      memberId: MEMBER_IDS.engineer,
      name: "Bala Murugan",
      memberType: "normal",
      designationName: "Site Engineer",
      active: true,
      status: "not_set",
      config: null,
    },
    {
      memberId: MEMBER_IDS.clerk,
      name: "Chitra Devi",
      memberType: "hrms",
      designationName: "Store Keeper",
      active: false,
      status: "not_set",
      config: null,
    },
  ],
  structures: [SITE_STAFF, OFFICE].map((structure) => ({
    id: structure.id,
    name: structure.name,
    isActive: structure.isActive,
    components: structure.components.map((component) => ({
      id: component.id,
      name: component.name,
      basis: component.basis,
      isBalancing: component.isBalancing,
    })),
  })),
  financial: true,
};
