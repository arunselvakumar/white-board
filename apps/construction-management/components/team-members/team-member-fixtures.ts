import { SITE_ENGINEER_ROLE } from "@/components/roles/role-fixtures";
import type { TeamMember } from "@/src/queries/team-members";

/** Story fixtures for the Staff screens (Team Members in code). */
export function teamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: "0199c3a0-0000-7000-8000-000000000101",
    userId: null,
    name: "Prabhu Saravanan",
    mobile: "+917708165767",
    email: "prabhu@sakthi.in",
    address: null,
    aadhaarMasked: "XXXXXXXX2346",
    panMasked: null,
    emergencyContact: null,
    salaryType: "monthly",
    salaryPerDay: null,
    salaryPerMonth: null,
    overtimeWagePerHour: 0,
    workingHoursPerDay: "8",
    weeklyHolidays: [0],
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
