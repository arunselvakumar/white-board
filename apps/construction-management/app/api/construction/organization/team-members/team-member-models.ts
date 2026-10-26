import { isConstructionSmsEnabled } from "@repo/auth/construction/server";
import { z } from "zod";

import {
  FLAGS,
  MENUS,
  financialValue,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";
import { MAX_MONTHLY_SALARY } from "@/src/organization/domain/team-member";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  type TeamMemberWithPassword,
} from "@/src/organization/application/team-member-handlers";
import type { TeamMemberReadModel } from "@/src/organization/application/team-member-read-model";

const MENU_KEYS = MENUS.map((menu) => menu.key) as [string, ...string[]];

/** `{ "<menu key>": ["create", …] }`; unsupported cells are dropped (ADR CM-0003). */
export const PermissionGrantsModel = z.partialRecord(
  z.enum(MENU_KEYS),
  z.array(z.enum(FLAGS)),
);

export const TeamMemberIdParamsModel = z.object({ id: z.uuid() });

export const teamMemberDetailFields = {
  name: z.string().trim().min(1).max(100),
  mobile: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  aadhaar: z.string().trim().max(14).nullish(),
  pan: z.string().trim().max(10).nullish(),
  emergencyContact: z.string().trim().max(120).nullish(),
  monthlySalary: z
    .number()
    .int()
    .min(0)
    .max(MAX_MONTHLY_SALARY)
    .nullish()
    .describe(
      "Paise a month; optional (ADR CM-0032). Ignored without Financial on Staff; on edit, leave it out to keep it and send null to clear it",
    ),
  memberType: z.enum(["normal", "hrms"]),
};

export const ConstructionOrganizationTeamMemberResponseModel = z.object({
  id: z.uuid(),
  userId: z.string().nullable(),
  name: z.string(),
  role: z
    .object({ id: z.uuid(), name: z.string() })
    .nullable()
    .describe(
      "What they may do (ADR CM-0030); null for the Owner, who can do everything",
    ),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  aadhaarMasked: z.string().nullable(),
  panMasked: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  monthlySalary: z
    .number()
    .int()
    .nullable()
    .describe(
      "Paise a month (ADR CM-0032); null when none, or without Financial on Staff",
    ),
  memberType: z.enum(["normal", "hrms"]),
  isOwner: z.boolean(),
  status: z.enum(["joining_pending", "active", "rejected", "left"]),
  mobileLocked: z
    .boolean()
    .describe(
      "The mobile is a joined member's sign-in (SMS on, ADR CM-0009), so `update` rejects a change with MOBILE_LOCKED",
    ),
  projectIds: z.array(z.string()),
  permissions: PermissionGrantsModel.describe(
    "The Role's matrix, read-only here (the Owner's is everything); change it in Role Management",
  ),
  canSetPassword: z
    .boolean()
    .describe(
      "Edit Staff may set a new password: not the Owner, and no User yet or a User in no other Company (ADR CM-0030 §7)",
    ),
  invitePath: z.string().nullable(),
  invitedAt: z.iso.datetime().nullable(),
  joinedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationTeamMemberResponseModel = z.infer<
  typeof ConstructionOrganizationTeamMemberResponseModel
>;

/** The salary only with Financial on Staff (ADR CM-0032). */
export function toTeamMemberResponse(
  member: TeamMemberReadModel,
  access: MemberAccess,
): ConstructionOrganizationTeamMemberResponseModel {
  return {
    ...member,
    monthlySalary: financialValue(
      access,
      "organization.team_members",
      member.monthlySalary,
    ),
    mobileLocked:
      isConstructionSmsEnabled() &&
      // Same rule as TeamMember.updateDetails: locked once past Joining Pending.
      member.status !== "joining_pending" &&
      !member.isOwner,
    permissions: member.permissions satisfies PermissionGrants,
    invitedAt: member.invitedAt?.toISOString() ?? null,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}

/** A first password the admin types (ADR CM-0030 §6). */
export const TeamMemberPasswordModel = z
  .string()
  .min(PASSWORD_MIN)
  .max(PASSWORD_MAX);

/**
 * Add Staff and Set a new password answer with the Team Member and whether
 * the password was ignored because someone already signs in with that
 * mobile or email (ADR CM-0030 §3).
 */
export const ConstructionOrganizationTeamMemberWithPasswordResponseModel =
  ConstructionOrganizationTeamMemberResponseModel.extend({
    passwordIgnored: z
      .enum(["existing_account"])
      .nullable()
      .describe(
        "`existing_account`: a User already has this mobile or email, so their password was left alone and they got a Join Request instead",
      ),
  });

export type ConstructionOrganizationTeamMemberWithPasswordResponseModel =
  z.infer<typeof ConstructionOrganizationTeamMemberWithPasswordResponseModel>;

export function toTeamMemberWithPasswordResponse(
  member: TeamMemberWithPassword,
  access: MemberAccess,
): ConstructionOrganizationTeamMemberWithPasswordResponseModel {
  return {
    ...toTeamMemberResponse(member, access),
    passwordIgnored: member.passwordIgnored,
  };
}
