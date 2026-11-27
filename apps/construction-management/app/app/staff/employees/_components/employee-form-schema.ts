import { normalizeMobile } from "@repo/auth/construction/react";
import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  EMPLOYEE_WAGE,
  checkWage,
  wageDefaults,
  wageErrorFields,
  wagePayload,
  wageValuesSchema,
} from "@/app/app/staff/_components/wage-schema";
import { temporaryPassword } from "@/app/app/staff/office-staff/_components/sign-in-options";
import type {
  EmployeeInput,
  EmployeeResponse,
  EmployeeUpdateInput,
} from "@/src/queries/employees";
import { isValidAadhaar, isValidPan } from "@/src/shared-kernel/tax-ids";

import { NO_DEPARTMENT } from "./role-choices";

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export const BLOOD_GROUP_OPTIONS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

/** Four letters, a zero, six letters or digits (HDFC0001234). */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_NUMBER_RE = /^[A-Z0-9]{6,30}$/;

function upto(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Use at most ${String(max)} characters`);
}

/** An account number as the bank prints it, spaces and hyphens dropped. */
export function tidyAccountNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export const MOBILE_REQUIRED_MESSAGE =
  "Enter the mobile number: they sign in with it";

export const PASSWORD_REQUIRED_MESSAGE =
  "Set a password: they sign in with their mobile number and it";

const employeeObject = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Employee's name")
    .max(100, "Use at most 100 characters"),
  mobile: z
    .string()
    .trim()
    .refine((value) => value === "" || normalizeMobile(value) != null, {
      message: "Enter a valid 10-digit mobile number",
    }),
  email: z
    .string()
    .trim()
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Enter a valid email address",
    }),
  gender: z.union([z.literal(""), z.enum(["male", "female", "other"])]),
  dateOfBirth: z.string(),
  fatherName: upto(100),
  bloodGroup: z.union([z.literal(""), z.enum(BLOOD_GROUP_OPTIONS)]),
  employeeCode: upto(30),
  joiningDate: z.string().min(1, "Enter the joining date"),

  /** A Department's id, `NO_DEPARTMENT`, or "" before one is chosen. */
  departmentId: z.string().min(1, "Choose a Department"),
  roleId: z.string().min(1, "Choose a Role"),

  address: upto(500),
  emergencyContact: upto(120),
  aadhaar: z
    .string()
    .trim()
    .refine((value) => value === "" || isValidAadhaar(value), {
      message: "Enter a valid 12-digit Aadhaar number",
    }),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || isValidPan(value), {
      message: "Enter a valid 10-character PAN",
    }),
  uanNumber: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{12}$/.test(value.replace(/\s/g, "")),
      { message: "The UAN is 12 digits" },
    ),
  esicNumber: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || /^(\d{10}|\d{17})$/.test(value.replace(/\s/g, "")),
      { message: "The ESIC number is 10 or 17 digits" },
    ),

  qualification: upto(100),
  experienceYears: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^\d{1,2}$/.test(value) && Number(value) >= 0 && Number(value) <= 60),
      { message: "A whole number of years, 0 to 60" },
    ),
  specialisation: upto(100),
  labourCategoryId: z.string(),
  /** Another Employee's id, or "" for none (ADR CM-0035). */
  reportsToId: z.string(),

  /** The wage set-up shared with Office Staff (`wage-schema.ts`). */
  wage: wageValuesSchema,
  openingBalance: z.string(),

  accountHolder: upto(100),
  accountNumber: z
    .string()
    .refine(
      (value) =>
        value.trim() === "" || ACCOUNT_NUMBER_RE.test(tidyAccountNumber(value)),
      { message: "Enter the account number: 6 to 30 letters and digits" },
    ),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || IFSC_RE.test(value), {
      message: "Enter an IFSC like HDFC0001234",
    }),
  bankName: upto(100),

  /** "Can sign in" (ADR CM-0055 §4). */
  canSignIn: z.boolean(),
  /** A first password; blank when none is typed. */
  password: z.union([z.literal(""), temporaryPassword]),
});

export type EmployeeFormValues = z.infer<typeof employeeObject>;

/**
 * What the form shows, and so what it checks and sends:
 *
 * - `showAmounts`: the wage amounts and the opening balance. Add always
 *   shows them (a wage is required); Edit only with Financial on
 *   Employees, since the API returns them null otherwise. Hidden ones are
 *   left out of the body, so an edit keeps them.
 * - `showBank`: the Bank card, with Financial on Employees.
 * - `hasSignIn`: Edit of an Employee who already signs in. Their password
 *   is changed with Set password, not here; turning "Can sign in" off
 *   removes the sign-in.
 */
export type EmployeeFormMode = {
  showAmounts: boolean;
  showBank: boolean;
  hasSignIn: boolean;
};

function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Client checks; the server repeats every rule. */
export function employeeFormSchema(mode: EmployeeFormMode) {
  return employeeObject.superRefine((values, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: "custom", path, message });
    };
    checkWage(values.wage, ctx, {
      ...EMPLOYEE_WAGE,
      path: ["wage"],
      showAmounts: mode.showAmounts,
    });
    if (
      mode.showAmounts &&
      values.openingBalance.trim() !== "" &&
      !isRupees(values.openingBalance, true)
    )
      issue(
        ["openingBalance"],
        "Enter an amount in rupees, like 2500 or -1000",
      );
    if (values.dateOfBirth !== "" && values.dateOfBirth >= todayIso())
      issue(["dateOfBirth"], "The date of birth must be before today");
    if (
      values.joiningDate !== "" &&
      values.dateOfBirth !== "" &&
      values.joiningDate <= values.dateOfBirth
    )
      issue(
        ["joiningDate"],
        "The joining date must be after the date of birth",
      );
    if (values.canSignIn && values.mobile === "")
      issue(["mobile"], MOBILE_REQUIRED_MESSAGE);
    if (values.canSignIn && !mode.hasSignIn && values.password === "")
      issue(["password"], PASSWORD_REQUIRED_MESSAGE);
  });
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

/**
 * The form values for a saved Employee, or a new one on `role` (Human
 * Resources → Labour when the Company has it, ADR CM-0055 §2).
 */
export function employeeFormDefaults(
  employee: EmployeeResponse | null,
  role: { departmentId: string; roleId: string } = {
    departmentId: "",
    roleId: "",
  },
): EmployeeFormValues {
  return {
    name: text(employee?.name),
    mobile: employee?.mobile?.replace(/^\+91/, "") ?? "",
    email: text(employee?.email),
    gender: employee?.gender ?? "",
    dateOfBirth: text(employee?.dateOfBirth),
    fatherName: text(employee?.fatherName),
    bloodGroup: employee?.bloodGroup ?? "",
    employeeCode: text(employee?.employeeCode),
    joiningDate: text(employee?.joiningDate),
    departmentId:
      employee == null
        ? role.departmentId
        : (employee.department?.id ?? NO_DEPARTMENT),
    roleId: employee == null ? role.roleId : employee.role.id,
    address: text(employee?.address),
    emergencyContact: text(employee?.emergencyContact),
    // Stored identifiers show only masked; blank keeps them.
    aadhaar: "",
    pan: "",
    uanNumber: text(employee?.uanNumber),
    esicNumber: text(employee?.esicNumber),
    qualification: text(employee?.qualification),
    experienceYears:
      employee?.experienceYears == null ? "" : String(employee.experienceYears),
    specialisation: text(employee?.specialisation),
    labourCategoryId: employee?.labourCategory?.id ?? "",
    reportsToId: employee?.reportsTo?.id ?? "",
    wage: wageDefaults(
      employee == null
        ? null
        : {
            type: employee.wageType,
            perDay: employee.wagePerDay,
            perMonth: employee.wagePerMonth,
            overtimePerHour: employee.overtimeWagePerHour,
            workingHoursPerDay: employee.workingHoursPerDay,
            weeklyHolidays: employee.weeklyHolidays,
          },
      EMPLOYEE_WAGE,
    ),
    openingBalance: paiseToRupees(employee?.openingBalance ?? null),
    accountHolder: text(employee?.bank?.accountHolder),
    accountNumber: "",
    ifsc: text(employee?.bank?.ifsc),
    bankName: text(employee?.bank?.bankName),
    canSignIn: employee?.canSignIn ?? false,
    password: "",
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A kept secret (Aadhaar, PAN, account number): blank on Edit leaves it out
 * so the stored one stays; blank on Add is none.
 */
function secret(
  value: string,
  keepWhenBlank: boolean,
): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed !== "") return trimmed;
  return keepWhenBlank ? undefined : null;
}

/**
 * Every text field, always: the Update API clears a text field that is
 * left out, so a blank one goes as null.
 */
function details(values: EmployeeFormValues) {
  const wage = wagePayload(values.wage);
  const experience = values.experienceYears.trim();
  return {
    name: values.name.trim(),
    employeeCode: orNull(values.employeeCode),
    roleId: values.roleId,
    fatherName: orNull(values.fatherName),
    dateOfBirth: orNull(values.dateOfBirth),
    gender: values.gender === "" ? null : values.gender,
    bloodGroup: values.bloodGroup === "" ? null : values.bloodGroup,
    joiningDate: values.joiningDate,
    mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
    email: orNull(values.email),
    address: orNull(values.address),
    emergencyContact: orNull(values.emergencyContact),
    qualification: orNull(values.qualification),
    experienceYears: experience === "" ? null : Number(experience),
    specialisation: orNull(values.specialisation),
    wageType: wage.type,
    weeklyHolidays: wage.weeklyHolidays,
    workingHoursPerDay: wage.workingHoursPerDay,
    uanNumber: orNull(values.uanNumber),
    esicNumber: orNull(values.esicNumber),
    labourCategoryId: orNull(values.labourCategoryId),
    reportsToId: orNull(values.reportsToId),
  };
}

function amounts(values: EmployeeFormValues) {
  const wage = wagePayload(values.wage);
  return {
    wagePerDay: wage.perDay,
    wagePerMonth: wage.perMonth,
    overtimeWagePerHour: wage.overtimePerHour,
    openingBalance: rupeesToPaise(values.openingBalance) ?? 0,
  };
}

function bank(values: EmployeeFormValues, keepWhenBlank: boolean) {
  return {
    bankAccountHolder: orNull(values.accountHolder),
    bankAccountNumber: secret(
      tidyAccountNumber(values.accountNumber),
      keepWhenBlank,
    ),
    bankIfsc: orNull(values.ifsc),
    bankName: orNull(values.bankName),
  };
}

/** The Add Employee request body (rupees to paise). */
export function createEmployeePayload(
  values: EmployeeFormValues,
  mode: Pick<EmployeeFormMode, "showBank">,
): EmployeeInput {
  return {
    ...details(values),
    ...amounts(values),
    ...(mode.showBank ? bank(values, false) : {}),
    aadhaar: secret(values.aadhaar, false),
    pan: secret(values.pan, false),
    signIn: values.canSignIn
      ? { canSignIn: true, password: orNull(values.password) }
      : { canSignIn: false },
  };
}

/**
 * The Edit request body. Blank Aadhaar, PAN and account number keep the
 * stored ones; amounts and bank the form does not show are left out and
 * kept. Projects are left out, so they are kept: they change from the
 * Project's Teams and with Transfer.
 */
export function updateEmployeePayload(
  values: EmployeeFormValues,
  options: EmployeeFormMode & { expectedUpdatedAt: string },
): EmployeeUpdateInput {
  return {
    ...details(values),
    ...(options.showAmounts ? amounts(values) : {}),
    ...(options.showBank ? bank(values, true) : {}),
    aadhaar: secret(values.aadhaar, true),
    pan: secret(values.pan, true),
    signIn:
      values.canSignIn && !options.hasSignIn
        ? { canSignIn: true, password: orNull(values.password) }
        : { canSignIn: values.canSignIn },
    expectedUpdatedAt: options.expectedUpdatedAt,
  };
}

export type EmployeeField = FieldPath<EmployeeFormValues>;

/** Server error codes to the field they belong to. */
const EMPLOYEE_ERROR_FIELDS: Record<string, EmployeeField> = {
  EMPLOYEE_NAME_REQUIRED: "name",
  EMPLOYEE_NAME_TOO_LONG: "name",
  EMPLOYEE_CODE_TOO_LONG: "employeeCode",
  EMPLOYEE_CODE_TAKEN: "employeeCode",
  EMPLOYEE_ROLE_NOT_FOUND: "roleId",
  EMPLOYEE_ROLE_REQUIRED: "roleId",
  FATHER_NAME_TOO_LONG: "fatherName",
  DATE_OF_BIRTH_INVALID: "dateOfBirth",
  GENDER_INVALID: "gender",
  BLOOD_GROUP_INVALID: "bloodGroup",
  JOINING_DATE_INVALID: "joiningDate",
  JOINING_DATE_AFTER_TRANSFER: "joiningDate",
  JOINING_DATE_AFTER_ATTENDANCE: "joiningDate",
  MOBILE_INVALID: "mobile",
  MOBILE_REQUIRED: "mobile",
  MOBILE_IN_USE: "mobile",
  MOBILE_LOCKED: "mobile",
  MEMBER_MOBILE_IN_USE: "mobile",
  EMAIL_INVALID: "email",
  MEMBER_EMAIL_IN_USE: "email",
  ADDRESS_TOO_LONG: "address",
  EMERGENCY_CONTACT_TOO_LONG: "emergencyContact",
  AADHAAR_INVALID: "aadhaar",
  PAN_INVALID: "pan",
  UAN_INVALID: "uanNumber",
  ESIC_INVALID: "esicNumber",
  QUALIFICATION_TOO_LONG: "qualification",
  EXPERIENCE_INVALID: "experienceYears",
  SPECIALISATION_TOO_LONG: "specialisation",
  LABOUR_CATEGORY_NOT_FOUND: "labourCategoryId",
  REPORTS_TO_NOT_FOUND: "reportsToId",
  REPORTS_TO_SELF: "reportsToId",
  REPORTS_TO_LOOP: "reportsToId",
  OPENING_BALANCE_INVALID: "openingBalance",
  ACCOUNT_HOLDER_TOO_LONG: "accountHolder",
  ACCOUNT_NUMBER_INVALID: "accountNumber",
  IFSC_INVALID: "ifsc",
  BANK_NAME_TOO_LONG: "bankName",
  PASSWORD_REQUIRED: "password",
  PASSWORD_INVALID: "password",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
};

/** The field for a wage error depends on the wage type being saved. */
export function employeeErrorFields(
  values: EmployeeFormValues,
): Record<string, EmployeeField> {
  return {
    ...EMPLOYEE_ERROR_FIELDS,
    ...wageErrorFields("wage", values.wage),
  };
}
