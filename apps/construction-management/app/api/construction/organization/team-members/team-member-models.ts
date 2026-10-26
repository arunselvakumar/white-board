import { isConstructionSmsEnabled } from "@repo/auth/construction/server";
import { z } from "zod";

import {
  FLAGS,
  MENUS,
  can,
  financialValue,
  type MemberAccess,
  type PermissionGrants,
} from "@/src/shared-kernel/access";
import {
  MAX_SALARY,
  type StaffSalaryInput,
} from "@/src/organization/domain/staff-salary";
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

const paise = z.number().int().min(0).max(MAX_SALARY).nullish();

export const teamMemberDetailFields = {
  name: z.string().trim().min(1).max(100),
  mobile: z.string().trim().max(20).nullish(),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  aadhaar: z.string().trim().max(14).nullish(),
  pan: z.string().trim().max(10).nullish(),
  emergencyContact: z.string().trim().max(120).nullish(),
  salaryType: z
    .enum(["daily", "monthly"])
    .optional()
    .describe(
      "A day's or a month's salary (ADR CM-0033 §3); Monthly when left out on create. Ignored without Financial on Staff",
    ),
  salaryPerDay: paise.describe(
    "Paise; optional, for a daily salary. Ignored without Financial on Staff; on edit, leave it out to keep it and send null to clear it",
  ),
  salaryPerMonth: paise.describe(
    "Paise; optional, for a monthly salary. Ignored without Financial on Staff; on edit, leave it out to keep it and send null to clear it",
  ),
  overtimeWagePerHour: paise.describe(
    "Paise an hour, 0 when none; dropped when there is no salary. Ignored without Financial on Staff",
  ),
  workingHoursPerDay: z
    .union([z.string().max(12), z.number()])
    .nullish()
    .describe(
      "Decimal hours a day, 0 < h ≤ 24, two places at most (ADR CM-0011); 8 when left out on create, kept when left out on edit",
    ),
  weeklyHolidays: z
    .array(z.int())
    .max(7)
    .optional()
    .describe(
      "0 = Sunday … 6 = Saturday; Sunday when left out on create, kept when left out on edit",
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
  salaryType: z
    .enum(["daily", "monthly"])
    .describe("A day's or a month's salary (ADR CM-0033 §3)"),
  salaryPerDay: z
    .number()
    .int()
    .nullable()
    .describe(
      "Paise; null when none, for a monthly salary, or without Financial on Staff",
    ),
  salaryPerMonth: z
    .number()
    .int()
    .nullable()
    .describe(
      "Paise; null when none, for a daily salary, or without Financial on Staff",
    ),
  overtimeWagePerHour: z
    .number()
    .int()
    .nullable()
    .describe("Paise an hour; null without Financial on Staff"),
  workingHoursPerDay: z
    .string()
    .describe("Decimal hours a day; time beyond it is overtime (ADR CM-0011)"),
  weeklyHolidays: z
    .array(z.int().min(0).max(6))
    .describe("0 = Sunday … 6 = Saturday"),
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

/**
 * The salary set-up from a request. Without Financial on Staff the type and
 * amounts are dropped, so an edit keeps them and Add Staff has none (ADR
 * CM-0032 §3); the type goes too, because it picks which amount applies.
 */
export function salaryInput(
  model: {
    salaryType?: "daily" | "monthly" | undefined;
    salaryPerDay?: number | null | undefined;
    salaryPerMonth?: number | null | undefined;
    overtimeWagePerHour?: number | null | undefined;
    workingHoursPerDay?: string | number | null | undefined;
    weeklyHolidays?: number[] | undefined;
  },
  access: MemberAccess,
): StaffSalaryInput {
  const hours =
    model.workingHoursPerDay === null ? undefined : model.workingHoursPerDay;
  if (!can(access, "organization.team_members", "financial"))
    return { workingHoursPerDay: hours, weeklyHolidays: model.weeklyHolidays };
  return {
    type: model.salaryType,
    perDay: model.salaryPerDay,
    perMonth: model.salaryPerMonth,
    overtimePerHour: model.overtimeWagePerHour,
    workingHoursPerDay: hours,
    weeklyHolidays: model.weeklyHolidays,
  };
}

/** The amounts only with Financial on Staff (ADR CM-0032 §3). */
export function toTeamMemberResponse(
  member: TeamMemberReadModel,
  access: MemberAccess,
): ConstructionOrganizationTeamMemberResponseModel {
  const money = (paise: number | null) =>
    financialValue(access, "organization.team_members", paise);
  return {
    ...member,
    salaryPerDay: money(member.salaryPerDay),
    salaryPerMonth: money(member.salaryPerMonth),
    overtimeWagePerHour: money(member.overtimeWagePerHour),
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
