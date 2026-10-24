import { SITE_ENGINEER_ROLE } from "@/components/roles/role-fixtures";
import type { DesignationOption, TeamMember } from "@/src/queries/team-members";

/** Story fixtures for the User screens (Team Members in code). */
export const DESIGNATIONS: DesignationOption[] = [
  { id: "0199c3a0-0000-7000-8000-000000000201", name: "Site Engineer" },
  { id: "0199c3a0-0000-7000-8000-000000000202", name: "Accountant" },
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
    name: "Prabhu Saravanan",
    designation: { id: DESIGNATIONS[0]?.id ?? "", name: "Site Engineer" },
    mobile: "+917708165767",
    email: "prabhu@sakthi.in",
    address: null,
    aadhaarMasked: "XXXXXXXX2346",
    panMasked: null,
    emergencyContact: null,
    memberType: "normal",
    isOwner: false,
    status: "joining_pending",
    mobileLocked: false,
    projectIds: [],
    role: { id: SITE_ENGINEER_ROLE.id, name: SITE_ENGINEER_ROLE.name },
    permissions: SITE_ENGINEER_ROLE.permissions,
    canSetPassword: true,
    invitePath: "/join/Zt0kenZt0kenZt0kenZt0kenZt0ken12",
    invitedAt: "2026-10-08T06:30:00.000Z",
    joinedAt: null,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
    ...overrides,
  };
}
