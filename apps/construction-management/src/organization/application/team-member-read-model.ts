import {
  PermissionSet,
  type PermissionGrants,
} from "@/src/shared-kernel/access";
import { maskIdentifier } from "@/src/shared-kernel/tax-ids";

import type { Role } from "../domain/role";
import type { SalaryType } from "../domain/staff-salary";
import type {
  MemberType,
  TeamMember,
  TeamMemberStatus,
} from "../domain/team-member";

export type TeamMemberReadModel = {
  id: string;
  userId: string | null;
  name: string;
  /** Null for the Owner, and for a member left without one. */
  role: { id: string; name: string } | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  /** `XXXXXXXX2346`; the full value only through reveal. */
  aadhaarMasked: string | null;
  panMasked: string | null;
  emergencyContact: string | null;
  /** The salary set-up (ADR CM-0033 §3). */
  salaryType: SalaryType;
  /** Paise; Response models null the amounts without Financial. */
  salaryPerDay: number | null;
  salaryPerMonth: number | null;
  overtimeWagePerHour: number;
  /** Decimal hours, like "8" or "9.5". */
  workingHoursPerDay: string;
  /** 0 = Sunday … 6 = Saturday. */
  weeklyHolidays: number[];
  memberType: MemberType;
  isOwner: boolean;
  status: TeamMemberStatus;
  projectIds: string[];
  /** The Role's matrix, read-only here; the Owner's is everything. */
  permissions: PermissionGrants;
  /**
   * Edit User may set a new password (ADR CM-0030 §7): not the Owner, and
   * either no User yet or a User who belongs to no other Company.
   */
  canSetPassword: boolean;
  /** `/join/<token>` while Joining Pending; null otherwise. */
  invitePath: string | null;
  invitedAt: Date | null;
  joinedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What a Team Member's view needs besides the record itself. */
export type TeamMemberLookups = {
  /** Live Roles of the Company by id. */
  roles: ReadonlyMap<string, Role>;
  /** Users who also belong to another Company. */
  usersInOtherCompanies: ReadonlySet<string>;
};

export function toTeamMemberReadModel(
  member: TeamMember,
  lookups: TeamMemberLookups,
): TeamMemberReadModel {
  const { details } = member;
  const role =
    member.roleId == null ? null : (lookups.roles.get(member.roleId) ?? null);
  const permissions = member.isOwner
    ? PermissionSet.everything()
    : (role?.permissions ?? PermissionSet.empty());
  return {
    id: member.id,
    userId: member.userId,
    name: details.name,
    role: role == null ? null : { id: role.id, name: role.name },
    mobile: details.mobile,
    email: details.email,
    address: details.address,
    aadhaarMasked:
      details.aadhaar == null ? null : maskIdentifier(details.aadhaar),
    panMasked: details.pan == null ? null : maskIdentifier(details.pan),
    emergencyContact: details.emergencyContact,
    salaryType: member.salary.type,
    salaryPerDay: member.salary.perDay,
    salaryPerMonth: member.salary.perMonth,
    overtimeWagePerHour: member.salary.overtimePerHour,
    workingHoursPerDay: member.salary.workingHoursPerDay,
    weeklyHolidays: [...member.salary.weeklyHolidays],
    memberType: member.memberType,
    isOwner: member.isOwner,
    status: member.status,
    projectIds: [...member.projectIds],
    permissions: permissions.toGrants(),
    canSetPassword:
      !member.isOwner &&
      (details.mobile != null || details.email != null) &&
      (member.userId == null ||
        !lookups.usersInOtherCompanies.has(member.userId)),
    invitePath:
      member.status === "joining_pending" && member.inviteToken != null
        ? `/join/${member.inviteToken}`
        : null,
    invitedAt: member.invitedAt,
    joinedAt: member.joinedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}
