import type { DesignationOption, TeamMember } from "@/src/queries/team-members";

/** Story fixtures for the Team Member screens. */
export const DESIGNATIONS: DesignationOption[] = [
  {
    id: "0199c3a0-0000-7000-8000-000000000201",
    name: "Site Engineer",
    template: {
      "labour.attendance": ["create", "read", "update"],
      "procurement.purchase_requests": ["create", "read"],
    },
  },
  {
    id: "0199c3a0-0000-7000-8000-000000000202",
    name: "Accountant",
    template: null,
  },
];

export const DESIGNATION_LIST = {
  items: DESIGNATIONS.map((item) => ({
    ...item,
    isSeed: true,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
  })),
  total: DESIGNATIONS.length,
};

export function teamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "0199c3a0-0000-7000-8000-000000000101",
    userId: null,
    name: "Suresh Kale",
    designation: { id: DESIGNATIONS[0]?.id ?? "", name: "Site Engineer" },
    mobile: "+919876543210",
    email: "suresh@kale.in",
    address: null,
    aadhaarMasked: "XXXXXXXX2346",
    panMasked: null,
    emergencyContact: null,
    memberType: "normal",
    isOwner: false,
    status: "joining_pending",
    mobileLocked: false,
    projectIds: [],
    permissions: { "labour.attendance": ["create", "read", "update"] },
    invitePath: "/join/Zt0kenZt0kenZt0kenZt0kenZt0ken12",
    invitedAt: "2026-10-08T06:30:00.000Z",
    joinedAt: null,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
    ...overrides,
  };
}
