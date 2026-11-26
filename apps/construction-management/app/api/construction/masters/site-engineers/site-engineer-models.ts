import { normalizeMobile } from "@repo/auth/construction/mobile";
import { z } from "zod";

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
} from "@/src/organization/application/team-member-handlers";
import { MAX_SALARY } from "@/src/organization/domain/staff-salary";
import type {
  SiteEngineerCreated,
  SiteEngineerInput,
  SiteEngineerReadModel,
} from "@/src/composition/site-engineers";
import {
  BLOOD_GROUPS,
  GENDERS,
} from "@/src/masters/domain/site-engineer-profile";
import {
  can,
  financialValue,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { expectedUpdatedAt } from "../_lib/master-models";

/** Salary and bank details need Financial on Labours (ADR CM-0037). */
export const SITE_ENGINEER_MENU = "masters.labours" satisfies MenuKey;

const paise = z.number().int().min(0).max(MAX_SALARY).nullish();
const calendarDate = z
  .string()
  .max(10)
  .nullish()
  .describe("YYYY-MM-DD; null or left out for none");

const ProfileModel = z.object({
  employeeCode: z.string().max(200).nullish(),
  fatherName: z.string().max(200).nullish(),
  dateOfBirth: calendarDate,
  gender: z.enum(GENDERS).nullish(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullish(),
  joiningDate: calendarDate,
  qualification: z.string().max(200).nullish(),
  experienceYears: z.int().min(0).max(60).nullish(),
  specialisation: z
    .string()
    .max(200)
    .nullish()
    .describe("Civil, steel / PEB, MEP …; free text"),
});

const BankModel = z.object({
  accountHolder: z.string().max(200).nullish(),
  accountNumber: z
    .string()
    .max(40)
    .nullish()
    .describe("Leave it out on edit to keep the stored one; null clears it"),
  ifsc: z.string().max(20).nullish(),
  bankName: z.string().max(200).nullish(),
});

const SignInModel = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN)
      .max(PASSWORD_MAX)
      .nullish()
      .describe(
        "A first password: they sign in with their mobile and it at once, and must change it (400 SIGN_IN_REQUIRED without one)",
      ),
  })
  .describe(
    "How the Site Engineer signs in: their mobile and this password. Nobody is invited (ADR CM-0053)",
  );

const details = {
  name: z.string().trim().min(1).max(100),
  mobile: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .describe(
      "Any common Indian format or E.164; stored as E.164. Required with their own sign-in, which it is (400 MOBILE_REQUIRED)",
    ),
  email: z.string().trim().max(254).nullish(),
  address: z.string().trim().max(500).nullish(),
  aadhaar: z
    .string()
    .trim()
    .max(14)
    .nullish()
    .describe("Leave it out on edit to keep the stored one; null clears it"),
  pan: z
    .string()
    .trim()
    .max(10)
    .nullish()
    .describe("Leave it out on edit to keep the stored one; null clears it"),
  emergencyContact: z.string().trim().max(120).nullish(),
  salaryType: z.enum(["daily", "monthly"]).optional(),
  salaryPerDay: paise,
  salaryPerMonth: paise,
  overtimeWagePerHour: paise,
  workingHoursPerDay: z.union([z.string().max(12), z.number()]).nullish(),
  weeklyHolidays: z.array(z.int()).max(7).optional(),
  projectIds: z
    .array(z.string().min(1).max(64))
    .max(500)
    .optional()
    .describe(
      "Left out: none on Add, and kept on edit. Site Engineers are put on a Project from the Project's Resources",
    ),
  profile: ProfileModel.default({}),
  bank: BankModel.optional().describe(
    "Ignored without Financial on Labours; left out keeps the stored details",
  ),
};

/**
 * Add Site Engineer (ADR CM-0037): the profile, contact, KYC, salary,
 * bank, Projects and the sign-in. Salary and bank are ignored without
 * Financial on Labours.
 */
export const CreateConstructionMastersSiteEngineerRequestModel = z.object({
  ...details,
  signIn: SignInModel,
});
export type CreateConstructionMastersSiteEngineerRequestModel = z.infer<
  typeof CreateConstructionMastersSiteEngineerRequestModel
>;

/**
 * Edit Site Engineer. `signIn` is required only for an older Site Engineer
 * without a sign-in, and ignored otherwise.
 */
export const UpdateConstructionMastersSiteEngineerRequestModel = z.object({
  ...details,
  signIn: SignInModel.optional(),
  expectedUpdatedAt: expectedUpdatedAt("SUPERVISOR"),
});
export type UpdateConstructionMastersSiteEngineerRequestModel = z.infer<
  typeof UpdateConstructionMastersSiteEngineerRequestModel
>;

export const SetConstructionMastersSiteEngineerPasswordRequestModel = z.object({
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

/** The mobile as E.164, or 400 `MOBILE_INVALID`. */
function mobileOf(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value === "") return null;
  const mobile = normalizeMobile(value);
  if (mobile == null)
    throw new DomainError("MOBILE_INVALID", "Enter a valid mobile number.");
  return mobile;
}

/**
 * A request's details for the handlers. Without Financial on Labours the
 * salary type and amounts and the bank details are dropped, so an edit
 * keeps them and Add has none.
 */
export function siteEngineerInput(
  model:
    | CreateConstructionMastersSiteEngineerRequestModel
    | UpdateConstructionMastersSiteEngineerRequestModel,
  access: MemberAccess,
): SiteEngineerInput {
  const financial = can(access, SITE_ENGINEER_MENU, "financial");
  const hours =
    model.workingHoursPerDay === null ? undefined : model.workingHoursPerDay;
  return {
    name: model.name,
    mobile: mobileOf(model.mobile),
    email: model.email ?? null,
    address: model.address ?? null,
    ...(model.aadhaar === undefined ? {} : { aadhaar: model.aadhaar }),
    ...(model.pan === undefined ? {} : { pan: model.pan }),
    emergencyContact: model.emergencyContact ?? null,
    salary: financial
      ? {
          type: model.salaryType,
          perDay: model.salaryPerDay,
          perMonth: model.salaryPerMonth,
          overtimePerHour: model.overtimeWagePerHour,
          workingHoursPerDay: hours,
          weeklyHolidays: model.weeklyHolidays,
        }
      : { workingHoursPerDay: hours, weeklyHolidays: model.weeklyHolidays },
    projectIds: model.projectIds,
    profile: model.profile,
    ...(financial && model.bank !== undefined ? { bank: model.bank } : {}),
  };
}

const SignInResponseModel = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("site_engineer"),
      memberId: z.uuid(),
      status: z.enum(["joining_pending", "active", "rejected", "left"]),
      canSetPassword: z.boolean(),
      mobileLocked: z
        .boolean()
        .describe(
          "Their User also works with another Company, so the mobile they sign in with cannot change here",
        ),
      invitedAt: z.iso.datetime().nullable(),
      joinedAt: z.iso.datetime().nullable(),
    }),
    z.object({
      kind: z.literal("office_staff"),
      memberId: z.uuid(),
      name: z.string(),
    }),
    z.object({ kind: z.literal("none") }),
  ])
  .describe(
    "`site_engineer`: their own sign-in, managed here. `office_staff`: they sign in as that Office Staff member. `none`: an older Site Engineer without one",
  );

export const ConstructionMastersSiteEngineerResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** E.164. */
  mobile: z.string().nullable(),
  mobileLocked: z
    .boolean()
    .describe(
      "The mobile is their sign-in and their User also works with another Company, so it cannot change here (409 MOBILE_LOCKED)",
    ),
  profile: ProfileModel.extend({
    employeeCode: z.string().nullable(),
    fatherName: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    gender: z.enum(GENDERS).nullable(),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable(),
    joiningDate: z.string().nullable(),
    qualification: z.string().nullable(),
    experienceYears: z.int().nullable(),
    specialisation: z.string().nullable(),
  }),
  bank: z
    .object({
      accountHolder: z.string().nullable(),
      accountLast4: z.string().nullable(),
      ifsc: z.string().nullable(),
      bankName: z.string().nullable(),
    })
    .nullable()
    .describe("Null without Financial on Labours"),
  signIn: SignInResponseModel,
  email: z.string().nullable(),
  address: z.string().nullable(),
  aadhaarMasked: z.string().nullable(),
  panMasked: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  salaryType: z.enum(["daily", "monthly"]).nullable(),
  salaryPerDay: z
    .int()
    .nullable()
    .describe("Paise; null without Financial on Labours"),
  salaryPerMonth: z
    .int()
    .nullable()
    .describe("Paise; null without Financial on Labours"),
  overtimeWagePerHour: z
    .int()
    .nullable()
    .describe("Paise; null without Financial on Labours"),
  workingHoursPerDay: z.string().nullable(),
  weeklyHolidays: z.array(z.int()),
  projectIds: z.array(z.string()),
  disabled: z.boolean().describe("Off the pickers; old records keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersSiteEngineerResponseModel = z.infer<
  typeof ConstructionMastersSiteEngineerResponseModel
>;

export const ListConstructionMastersSiteEngineersResponseModel = z.object({
  items: z.array(ConstructionMastersSiteEngineerResponseModel),
  total: z.int().nonnegative(),
});

export const ConstructionMastersSiteEngineerCreatedResponseModel =
  ConstructionMastersSiteEngineerResponseModel.extend({
    passwordIgnored: z
      .enum(["existing_account"])
      .nullable()
      .describe(
        "`existing_account`: someone already signs in with this mobile, so the password was not set and they got a Join Request instead",
      ),
    passwordSet: z.boolean(),
  });

export const ConstructionMastersSiteEngineerPasswordResponseModel =
  ConstructionMastersSiteEngineerResponseModel.extend({
    passwordIgnored: z.enum(["existing_account"]).nullable(),
  });

export function toSiteEngineerResponse(
  item: SiteEngineerReadModel,
  access: MemberAccess,
): ConstructionMastersSiteEngineerResponseModel {
  const financial = can(access, SITE_ENGINEER_MENU, "financial");
  const money = (value: number | null) =>
    financialValue(access, SITE_ENGINEER_MENU, value);
  const { member, signIn } = item;
  return {
    id: item.id,
    name: item.name,
    mobile: item.mobile,
    mobileLocked: signIn.kind === "site_engineer" && signIn.mobileLocked,
    profile: item.profile,
    bank: financial ? item.bank : null,
    signIn:
      signIn.kind === "site_engineer"
        ? {
            ...signIn,
            invitedAt: signIn.invitedAt?.toISOString() ?? null,
            joinedAt: signIn.joinedAt?.toISOString() ?? null,
          }
        : signIn,
    email: member?.email ?? null,
    address: member?.address ?? null,
    aadhaarMasked: member?.aadhaarMasked ?? null,
    panMasked: member?.panMasked ?? null,
    emergencyContact: member?.emergencyContact ?? null,
    salaryType: member == null ? null : member.salaryType,
    salaryPerDay: member == null ? null : money(member.salaryPerDay),
    salaryPerMonth: member == null ? null : money(member.salaryPerMonth),
    overtimeWagePerHour:
      member == null ? null : money(member.overtimeWagePerHour),
    workingHoursPerDay: member?.workingHoursPerDay ?? null,
    weeklyHolidays: member?.weeklyHolidays ?? [],
    projectIds: member?.projectIds ?? [],
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toSiteEngineerCreatedResponse(
  item: SiteEngineerCreated,
  access: MemberAccess,
) {
  return {
    ...toSiteEngineerResponse(item, access),
    passwordIgnored: item.passwordIgnored,
    passwordSet: item.passwordSet,
  };
}
