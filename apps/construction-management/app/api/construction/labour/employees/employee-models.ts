import { z } from "zod";

import type {
  EmployeeCreated,
  EmployeeWithSignIn,
} from "@/src/composition/employee-sign-ins";
import type { EmployeeReadModel } from "@/src/labour/application/employee-ports";
import { BLOOD_GROUPS, GENDERS } from "@/src/labour/domain/employee";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
} from "@/src/organization/application/team-member-handlers";
import {
  can,
  financialValue,
  type MemberAccess,
  type MenuKey,
} from "@/src/shared-kernel/access";
import { fileVersion } from "@/src/shared-kernel/files";

export const EMPLOYEES_PATH = "/api/construction/labour/employees";

/** Wages, opening balance, balance and bank details need Financial here. */
export const EMPLOYEES_MENU = "masters.labours" satisfies MenuKey;

/** Paise: a whole number, signed only where it says so. */
const paise = z.int().describe("Paise (₹1 = 100).");
const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD.");
const ref = z.object({ id: z.uuid(), name: z.string() });

export const EmployeeIdParamsModel = z.object({ id: z.uuid() });

const SignInResponseModel = z
  .object({
    memberId: z.uuid().describe("The sign-in membership (Team Member)."),
    status: z.enum(["joining_pending", "active", "rejected", "left"]),
    canSetPassword: z.boolean(),
    mobileLocked: z
      .boolean()
      .describe(
        "Their User also works with another Company, so the mobile they sign in with cannot change here (409 MOBILE_LOCKED).",
      ),
    invitedAt: z.iso.datetime().nullable(),
    joinedAt: z.iso.datetime().nullable(),
  })
  .describe(
    "How they sign in: their mobile and a password, on their Role (ADR CM-0055 §4).",
  );

export const ConstructionLabourEmployeeResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** "Employee Id", typed by the Company. */
  employeeCode: z.string().nullable(),
  role: ref.describe("Their Role (ADR CM-0055 §2)."),
  department: ref
    .nullable()
    .describe("The Role's Department; null for a Role under none."),
  fatherName: z.string().nullable(),
  dateOfBirth: calendarDate.nullable(),
  gender: z.enum(GENDERS).nullable(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable(),
  joiningDate: calendarDate,
  /** E.164. Their login when they sign in. */
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  emergencyContact: z.string().nullable(),
  qualification: z.string().nullable(),
  experienceYears: z.int().nullable(),
  specialisation: z.string().nullable(),
  wageType: z.enum(["daily", "monthly"]),
  /** Null without Financial, or for a monthly wage. */
  wagePerDay: paise.nullable(),
  /** Null without Financial, or for a daily wage. */
  wagePerMonth: paise.nullable(),
  /** Null without Financial. */
  overtimeWagePerHour: paise.nullable(),
  /** Decimal hours a day; time worked beyond it is overtime (ADR CM-0011). */
  workingHoursPerDay: z.string(),
  /** 0 = Sunday … 6 = Saturday. */
  weeklyHolidays: z.array(z.int().min(0).max(6)),
  /** Signed: negative is an advance given before the app. Null without Financial. */
  openingBalance: paise.nullable(),
  /** Owed to the Employee today (sum of the ledger). Null without Financial. */
  balance: paise.nullable(),
  uanNumber: z.string().nullable(),
  esicNumber: z.string().nullable(),
  /** `XXXXXXXX9012`; the number itself is never returned. */
  aadhaarMasked: z.string().nullable(),
  /** `XXXXXX234F`. */
  panMasked: z.string().nullable(),
  bank: z
    .object({
      accountHolder: z.string().nullable(),
      accountLast4: z.string().nullable(),
      ifsc: z.string().nullable(),
      bankName: z.string().nullable(),
    })
    .nullable()
    .describe("Null without Financial on Employees."),
  labourCategory: ref.nullable(),
  /** The Employee they report to (ADR CM-0035). */
  reportsTo: ref.nullable(),
  /** The Projects they work on now: none, one or many (ADR CM-0033). */
  projects: z.array(ref),
  /** "Can sign in" (ADR CM-0055 §4). */
  canSignIn: z.boolean(),
  signIn: SignInResponseModel.nullable().describe(
    "Null when they do not sign in.",
  ),
  isActive: z.boolean(),
  /** Same-origin URL of the photo (versioned), or null. */
  photoUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt` when updating. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourEmployeeResponseModel = z.infer<
  typeof ConstructionLabourEmployeeResponseModel
>;

/** An Employee as the API returns them; `signIn` null when not read. */
export function toEmployeeResponse(
  item: EmployeeReadModel & Partial<Pick<EmployeeWithSignIn, "signIn">>,
  access: MemberAccess,
): ConstructionLabourEmployeeResponseModel {
  const financial = can(access, EMPLOYEES_MENU, "financial");
  const money = <T>(value: T) => financialValue(access, EMPLOYEES_MENU, value);
  const { details } = item;
  const signIn = item.signIn ?? null;
  return {
    id: item.id,
    name: details.name,
    employeeCode: details.employeeCode,
    role: item.role,
    department: item.department,
    fatherName: details.fatherName,
    dateOfBirth: details.dateOfBirth,
    gender: details.gender,
    bloodGroup: details.bloodGroup,
    joiningDate: details.joiningDate,
    mobile: details.mobile,
    email: details.email,
    address: details.address,
    emergencyContact: details.emergencyContact,
    qualification: details.qualification,
    experienceYears: details.experienceYears,
    specialisation: details.specialisation,
    wageType: details.wageType,
    wagePerDay: money(details.wagePerDay),
    wagePerMonth: money(details.wagePerMonth),
    overtimeWagePerHour: money(details.overtimeWagePerHour),
    workingHoursPerDay: details.workingHoursPerDay,
    weeklyHolidays: details.weeklyHolidays,
    openingBalance: money(item.openingBalance),
    balance: money(item.balance),
    uanNumber: details.uanNumber,
    esicNumber: details.esicNumber,
    aadhaarMasked: item.aadhaarMasked,
    panMasked: item.panMasked,
    bank: financial
      ? {
          accountHolder: details.bankAccountHolder,
          accountLast4: item.bankAccountLast4,
          ifsc: details.bankIfsc,
          bankName: details.bankName,
        }
      : null,
    labourCategory: item.labourCategory,
    reportsTo: item.reportsTo,
    projects: item.projects,
    canSignIn: item.teamMemberId != null,
    signIn:
      signIn == null
        ? null
        : {
            ...signIn,
            invitedAt: signIn.invitedAt?.toISOString() ?? null,
            joinedAt: signIn.joinedAt?.toISOString() ?? null,
          },
    isActive: item.isActive,
    photoUrl:
      item.photoKey == null
        ? null
        : `${EMPLOYEES_PATH}/${item.id}/photo?v=${fileVersion(item.photoKey)}`,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const optionalText = z.string().nullable().optional();

const SignInRequestModel = z
  .object({
    canSignIn: z.boolean(),
    password: z
      .string()
      .min(PASSWORD_MIN)
      .max(PASSWORD_MAX)
      .nullable()
      .optional()
      .describe(
        "A first password, required when a sign-in is made (400 PASSWORD_REQUIRED): they sign in with their mobile and it, and must change it. Ignored for an Employee who already signs in (use Set password).",
      ),
  })
  .describe(
    "Can sign in (ADR CM-0055 §4): on needs a mobile (400 MOBILE_REQUIRED); off removes their sign-in. Omit on update to keep it as it is.",
  );

/** The fields Add and Edit share. */
const employeeFields = {
  name: z.string(),
  employeeCode: optionalText,
  /** A live Role of the Company; else 400 EMPLOYEE_ROLE_NOT_FOUND. */
  roleId: z.uuid(),
  fatherName: optionalText,
  dateOfBirth: optionalText.describe(
    "Calendar date, YYYY-MM-DD; before today.",
  ),
  gender: z.enum(GENDERS).nullable().optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
  joiningDate: z.string().describe("Calendar date, YYYY-MM-DD."),
  /** E.164, or a 10-digit Indian mobile. Required to sign in. */
  mobile: optionalText,
  email: optionalText,
  address: optionalText,
  emergencyContact: optionalText,
  qualification: optionalText,
  experienceYears: z.int().min(0).max(60).nullable().optional(),
  specialisation: optionalText,
  wageType: z.enum(["daily", "monthly"]),
  weeklyHolidays: z.array(z.int()).max(7).optional(),
  /**
   * Decimal hours a day, 0 < h ≤ 24, two places at most. Leave out (or
   * null) for 8 on create, to keep the stored value on update.
   */
  workingHoursPerDay: z
    .union([z.string().max(12), z.number()])
    .nullable()
    .optional(),
  uanNumber: optionalText,
  esicNumber: optionalText,
  labourCategoryId: z.uuid().nullable().optional(),
  /**
   * Another live, active Employee (ADR CM-0035); never this one, never a
   * loop. Null for none; omit on update to keep.
   */
  reportsToId: z.uuid().nullable().optional(),
  /** Ignored without Financial; on update, omit any of them to keep it. */
  bankAccountHolder: optionalText,
  bankAccountNumber: optionalText.describe(
    "6 to 30 letters and digits; stored encrypted. Omit on update to keep the stored one; null clears it.",
  ),
  bankIfsc: optionalText,
  bankName: optionalText,
  signIn: SignInRequestModel.optional(),
};

export const CreateConstructionLabourEmployeeRequestModel = z.object({
  ...employeeFields,
  /** Required for a daily wage; paise. */
  wagePerDay: paise.nullable().optional(),
  /** Required for a monthly wage; paise. */
  wagePerMonth: paise.nullable().optional(),
  overtimeWagePerHour: paise,
  /** Signed paise; posted to the ledger on the joining date. */
  openingBalance: paise.nullable().optional(),
  /** 12 digits; stored encrypted. */
  aadhaar: optionalText,
  /** 10 characters; stored encrypted. */
  pan: optionalText,
  /** None, one or many; on each from the joining date (ADR CM-0033). */
  projectIds: z.array(z.uuid()).max(500).optional(),
});

export type CreateConstructionLabourEmployeeRequestModel = z.infer<
  typeof CreateConstructionLabourEmployeeRequestModel
>;

export const UpdateConstructionLabourEmployeeRequestModel = z.object({
  ...employeeFields,
  /** Omit to keep the stored wage. */
  wagePerDay: paise.nullable().optional(),
  wagePerMonth: paise.nullable().optional(),
  overtimeWagePerHour: paise.nullable().optional(),
  /** Omit to keep; a new amount reverses the old opening entry and posts this one. */
  openingBalance: paise.nullable().optional(),
  /** Omit to keep the stored Aadhaar; null removes it. */
  aadhaar: optionalText,
  /** Omit to keep the stored PAN; null removes it. */
  pan: optionalText,
  /**
   * Every Project they work on. Omit to keep. One ticked or unticked is on
   * or off from today, with a row in the transfer history (ADR CM-0033).
   */
  projectIds: z.array(z.uuid()).max(500).optional(),
  /** The `updatedAt` the edit started from; else 409 `EMPLOYEE_CHANGED`. */
  expectedUpdatedAt: z.iso.datetime(),
});

export type UpdateConstructionLabourEmployeeRequestModel = z.infer<
  typeof UpdateConstructionLabourEmployeeRequestModel
>;

/**
 * Bank details from a request: left out (undefined) without Financial, so
 * Add has none and an edit keeps the stored ones.
 */
export function employeeBankInput(
  model: {
    bankAccountHolder?: string | null;
    bankAccountNumber?: string | null;
    bankIfsc?: string | null;
    bankName?: string | null;
  },
  access: MemberAccess,
) {
  if (!can(access, EMPLOYEES_MENU, "financial"))
    return {
      bankAccountHolder: undefined,
      bankAccountNumber: undefined,
      bankIfsc: undefined,
      bankName: undefined,
    };
  return {
    bankAccountHolder: model.bankAccountHolder,
    bankAccountNumber: model.bankAccountNumber,
    bankIfsc: model.bankIfsc,
    bankName: model.bankName,
  };
}

export const SetConstructionLabourEmployeePasswordRequestModel = z.object({
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const ConstructionLabourEmployeeCreatedResponseModel =
  ConstructionLabourEmployeeResponseModel.extend({
    passwordIgnored: z
      .enum(["existing_account"])
      .nullable()
      .describe(
        "`existing_account`: someone already signs in with this mobile, so the password was not set and they got a Join Request instead",
      ),
    passwordSet: z.boolean(),
  });

export const ConstructionLabourEmployeePasswordResponseModel =
  ConstructionLabourEmployeeResponseModel.extend({
    passwordIgnored: z.enum(["existing_account"]).nullable(),
  });

export function toEmployeeCreatedResponse(
  item: EmployeeCreated,
  access: MemberAccess,
) {
  return {
    ...toEmployeeResponse(item, access),
    passwordIgnored: item.passwordIgnored,
    passwordSet: item.passwordSet,
  };
}

/** `true` or `false` in a query string. */
const booleanQuery = z.enum(["true", "false"]);

export function queryBoolean(value: "true" | "false" | undefined) {
  return value == null ? undefined : value === "true";
}

export const ListConstructionLabourEmployeesRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
    projectId: z.uuid().optional(),
    active: booleanQuery.optional(),
    q: z.string().trim().max(100).optional(),
    categoryId: z.uuid().optional(),
    roleId: z.uuid().optional(),
    departmentId: z.uuid().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ExportConstructionLabourEmployeesRequestModel = z.object({
  projectId: z.uuid().optional(),
  active: booleanQuery.optional(),
  q: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  roleId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
});

export const ListConstructionLabourEmployeesResponseModel = z.object({
  items: z.array(ConstructionLabourEmployeeResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int(),
});

export type ListConstructionLabourEmployeesResponseModel = z.infer<
  typeof ListConstructionLabourEmployeesResponseModel
>;

export const TransferConstructionLabourEmployeesRequestModel = z.object({
  employeeIds: z.array(z.uuid()).min(1).max(500),
  /**
   * The Project they leave; their other Projects stay. Omit when each
   * works on one Project only (ADR CM-0033).
   */
  fromProjectId: z.uuid().nullable().optional(),
  toProjectId: z.uuid(),
  /** The first day in the new Project. */
  transferDate: z.string().describe("Calendar date, YYYY-MM-DD."),
  remark: z.string().max(500).nullable().optional(),
});

export const TransferConstructionLabourEmployeesResponseModel = z.object({
  items: z.array(ConstructionLabourEmployeeResponseModel),
});

export const ConstructionLabourEmployeeTransferResponseModel = z.object({
  id: z.uuid(),
  /** Null when added to a Project (with the Employee, or ticked on Edit). */
  fromProject: ref.nullable(),
  /** Null when taken off a Project on Edit (ADR CM-0033). */
  toProject: ref.nullable(),
  transferDate: calendarDate,
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const ListConstructionLabourEmployeeTransfersResponseModel = z.object({
  /** Oldest first. */
  items: z.array(ConstructionLabourEmployeeTransferResponseModel),
});

export type ListConstructionLabourEmployeeTransfersResponseModel = z.infer<
  typeof ListConstructionLabourEmployeeTransfersResponseModel
>;

export const ListConstructionLabourEmployeeOptionsRequestModel = z.object({
  projectId: z.uuid(),
  /** Defaults to today in the Company's time zone. */
  date: z.iso.date().optional(),
});

export const ConstructionLabourEmployeeOptionResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  employeeCode: z.string().nullable(),
  labourCategoryId: z.uuid().nullable(),
  wageType: z.enum(["daily", "monthly"]),
  weeklyHolidays: z.array(z.int()),
  /** Decimal hours a day (ADR CM-0011). */
  workingHoursPerDay: z.string(),
  /** Null without Financial on `labour.labour`. */
  wagePerDay: paise.nullable(),
  wagePerMonth: paise.nullable(),
  overtimeWagePerHour: paise.nullable(),
});

export const ListConstructionLabourEmployeeOptionsResponseModel = z.object({
  items: z.array(ConstructionLabourEmployeeOptionResponseModel),
});

export type ListConstructionLabourEmployeeOptionsResponseModel = z.infer<
  typeof ListConstructionLabourEmployeeOptionsResponseModel
>;

export const ImportConstructionLabourEmployeesRequestModel = z.object({
  /** `true` (default) checks and previews; `false` imports when every row is valid. */
  dryRun: z.enum(["true", "false"]).optional(),
});

const importValues = z.object({
  name: z.string(),
  employeeCode: z.string().nullable(),
  /** The Department and Role cells as typed. */
  department: z.string().nullable(),
  role: z.string().nullable(),
  joiningDate: z.string().nullable(),
  wageType: z.string().nullable(),
  wagePerDay: paise.nullable(),
  wagePerMonth: paise.nullable(),
  overtimeWagePerHour: paise.nullable(),
  openingBalance: paise.nullable(),
  /** The Projects cell as typed: names separated by ";". */
  projects: z.string().nullable(),
  labourCategory: z.string().nullable(),
});

export const ImportConstructionLabourEmployeesResponseModel = z.object({
  rows: z.array(
    z.object({
      /** The Excel row number. */
      row: z.int(),
      ok: z.boolean(),
      errors: z.array(
        z.object({ field: z.string(), code: z.string(), message: z.string() }),
      ),
      values: importValues,
    }),
  ),
  valid: z.int(),
  invalid: z.int(),
  /** How many Employees were added (0 on a dry run). */
  imported: z.int(),
});

export type ImportConstructionLabourEmployeesResponseModel = z.infer<
  typeof ImportConstructionLabourEmployeesResponseModel
>;
