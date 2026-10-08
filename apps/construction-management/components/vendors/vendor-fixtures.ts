import type { LookupItem } from "@/src/queries/masters";
import type { ProjectOption } from "@/src/queries/projects";
import type { VendorResponse, VendorSummary } from "@/src/queries/vendors";

/** Story data for the Vendor register (CM-209). */

const AT = "2026-10-08T06:30:00.000Z";

export const PROJECT_OPTIONS: ProjectOption[] = [
  {
    id: "0199a1b2-0000-7000-8000-0000000000a1",
    name: "Tower A",
    status: "ongoing",
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000a2",
    name: "Villa Phase 2",
    status: "ongoing",
  },
];

function category(id: string, name: string, disabled = false): LookupItem {
  return {
    id,
    name,
    isSeed: true,
    disabled,
    createdAt: AT,
    updatedAt: AT,
  };
}

export const MASON = category("0199a1b2-0000-7000-8000-0000000000c1", "Mason");
export const HELPER = category(
  "0199a1b2-0000-7000-8000-0000000000c2",
  "Helper",
);
export const CARPENTER = category(
  "0199a1b2-0000-7000-8000-0000000000c3",
  "Carpenter",
);
export const WELDER = category(
  "0199a1b2-0000-7000-8000-0000000000c4",
  "Welder",
  true,
);

export const CATEGORY_LIST = {
  items: [CARPENTER, HELPER, MASON, WELDER],
  total: 4,
};

export const RAMESH_GANG: VendorResponse = {
  id: "0199a1b2-0000-7000-8000-0000000000b1",
  name: "Ramesh Gang",
  joiningDate: "2026-04-01",
  contactNumber: "+919876543210",
  address: "Hadapsar, Pune",
  isActive: true,
  hasRateCard: true,
  photoUrl: null,
  projects: [{ id: "0199a1b2-0000-7000-8000-0000000000a1", name: "Tower A" }],
  shifts: [
    {
      id: "0199a1b2-0000-7000-8000-0000000000d1",
      name: "Shift 1",
      startTime: "08:00",
      endTime: "17:00",
      rates: [
        {
          labourCategoryId: MASON.id,
          labourCategoryName: "Mason",
          ratePerDay: 90_000,
          overtimePerHour: 12_000,
        },
        {
          labourCategoryId: HELPER.id,
          labourCategoryName: "Helper",
          ratePerDay: 55_000,
          overtimePerHour: 7_000,
        },
      ],
    },
    {
      id: "0199a1b2-0000-7000-8000-0000000000d2",
      name: "Night",
      startTime: null,
      endTime: null,
      rates: [
        {
          labourCategoryId: MASON.id,
          labourCategoryName: "Mason",
          ratePerDay: 100_000,
          overtimePerHour: 15_000,
        },
      ],
    },
  ],
  openingBalance: 2_500_000,
  balance: 2_500_000,
  createdAt: AT,
  updatedAt: AT,
};

export const VENDOR_SUMMARIES: VendorSummary[] = [
  {
    id: RAMESH_GANG.id,
    name: "Ramesh Gang",
    contactNumber: "+919876543210",
    isActive: true,
    hasRateCard: true,
    shiftCount: 2,
    projects: RAMESH_GANG.projects,
    balance: 2_500_000,
    createdAt: AT,
    updatedAt: AT,
  },
  {
    id: "0199a1b2-0000-7000-8000-0000000000b2",
    name: "Sunil Gang",
    contactNumber: null,
    isActive: false,
    hasRateCard: false,
    shiftCount: 0,
    projects: [
      { id: "0199a1b2-0000-7000-8000-0000000000a1", name: "Tower A" },
      { id: "0199a1b2-0000-7000-8000-0000000000a2", name: "Villa Phase 2" },
    ],
    balance: -500_000,
    createdAt: AT,
    updatedAt: AT,
  },
];
