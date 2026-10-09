import type {
  LabourImportPreview,
  LabourList,
  LabourResponse,
} from "@/src/queries/labours";

/** Story data for the Labour screens (CM-207). */

const AT = "2026-10-08T06:30:00.000Z";

export const TOWER = {
  id: "0199a1b2-0000-7000-8000-00000000a001",
  name: "Tower A",
};
export const VILLA = {
  id: "0199a1b2-0000-7000-8000-00000000a002",
  name: "Villa Phase 2",
};
export const MASON = {
  id: "0199a1b2-0000-7000-8000-00000000c001",
  name: "Mason",
};
export const HELPER = {
  id: "0199a1b2-0000-7000-8000-00000000c002",
  name: "Helper",
};
export const SUNDAR = {
  id: "0199a1b2-0000-7000-8000-00000000d001",
  name: "Sundar Rajan",
};

export const PROJECT_OPTIONS = [
  { ...TOWER, status: "ongoing" },
  { ...VILLA, status: "ongoing" },
];

const lookup = (item: { id: string; name: string }, disabled = false) => ({
  ...item,
  isSeed: true,
  disabled,
  createdAt: AT,
  updatedAt: AT,
});

export const CATEGORY_LIST = {
  items: [
    lookup(HELPER),
    lookup(MASON),
    lookup(
      { id: "0199a1b2-0000-7000-8000-00000000c003", name: "Welder" },
      true,
    ),
  ],
  total: 3,
};

export const SUPERVISOR_LIST = {
  items: [
    {
      ...SUNDAR,
      mobile: null,
      teamMember: null,
      disabled: false,
      createdAt: AT,
      updatedAt: AT,
    },
  ],
  total: 1,
};

export const DHURESH: LabourResponse = {
  id: "0199a1b2-0000-7000-8000-00000000b001",
  name: "Dhuresh Nawin",
  labourCode: "L-001",
  fatherName: "Nawin Kumar",
  joiningDate: "2026-09-01",
  wageType: "daily",
  wagePerDay: 70_000,
  wagePerMonth: null,
  overtimeWagePerHour: 10_000,
  workingHoursPerDay: "8",
  weeklyHolidays: [0],
  openingBalance: 150_000,
  balance: 2_45_000,
  uanNumber: null,
  esicNumber: null,
  aadhaarMasked: "XXXXXXXX2346",
  labourCategory: MASON,
  supervisor: SUNDAR,
  contactNumber: "+917708165767",
  gender: "male",
  currentProject: TOWER,
  isActive: true,
  photoUrl: null,
  createdAt: AT,
  updatedAt: AT,
};

export const MEENA: LabourResponse = {
  ...DHURESH,
  id: "0199a1b2-0000-7000-8000-00000000b002",
  name: "Meena Selvi",
  labourCode: "L-002",
  fatherName: null,
  wageType: "monthly",
  wagePerDay: null,
  wagePerMonth: 18_00_000,
  openingBalance: 0,
  balance: -50_000,
  aadhaarMasked: null,
  labourCategory: HELPER,
  supervisor: null,
  gender: "female",
  currentProject: VILLA,
};

export const MURUGAN: LabourResponse = {
  ...DHURESH,
  id: "0199a1b2-0000-7000-8000-00000000b003",
  name: "Mohan Raj",
  labourCode: null,
  isActive: false,
  balance: 0,
};

export function listOf(items: LabourResponse[]): LabourList {
  return { items, total: items.length, nextCursor: null, prevCursor: null };
}

/** What a Team Member without Financial sees. */
export function withoutAmounts(labour: LabourResponse): LabourResponse {
  return {
    ...labour,
    wagePerDay: null,
    wagePerMonth: null,
    overtimeWagePerHour: null,
    openingBalance: null,
    balance: null,
  };
}

const values = (name: string, project: string | null) => ({
  name,
  labourCode: null,
  joiningDate: "2026-09-01",
  wageType: "Daily",
  wagePerDay: 65_000,
  wagePerMonth: null,
  overtimeWagePerHour: 8_000,
  openingBalance: null,
  project,
  labourCategory: "Mason",
  supervisor: null,
});

export const PREVIEW_WITH_ERRORS: LabourImportPreview = {
  rows: [
    { row: 2, ok: true, errors: [], values: values("Ganesh Kumar", "Tower A") },
    {
      row: 3,
      ok: false,
      errors: [
        {
          field: "project",
          code: "PROJECT_NOT_FOUND",
          message: 'No Project is called "Nowhere".',
        },
        {
          field: "aadhaar",
          code: "AADHAAR_INVALID",
          message: "Enter a valid 12-digit Aadhaar number.",
        },
      ],
      values: values("Manikandan Raja", "Nowhere"),
    },
  ],
  valid: 1,
  invalid: 1,
  imported: 0,
};

export const PREVIEW_VALID: LabourImportPreview = {
  rows: [
    { row: 2, ok: true, errors: [], values: values("Ganesh Kumar", "Tower A") },
    {
      row: 3,
      ok: true,
      errors: [],
      values: values("Manikandan Raja", "Tower A"),
    },
  ],
  valid: 2,
  invalid: 0,
  imported: 0,
};
