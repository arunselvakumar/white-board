import { normalizeMobile } from "@repo/auth/construction/react";
import type { FieldPath } from "react-hook-form";
import { z } from "zod";

import {
  STAFF_SALARY,
  checkWage,
  wageDefaults,
  wageErrorFields,
  wagePayload,
  wageValuesSchema,
} from "@/app/app/staff/_components/wage-schema";
import type {
  CreateSiteEngineerInput,
  SiteEngineer,
  UpdateSiteEngineerInput,
} from "@/src/queries/site-engineers";
import { isValidAadhaar, isValidPan } from "@/src/shared-kernel/tax-ids";

import { temporaryPassword } from "@/app/app/staff/office-staff/_components/sign-in-options";

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

function upto(max: number, message: string) {
  return z.string().trim().max(max, message);
}

/** An account number as the bank prints it, spaces and hyphens dropped. */
export function tidyAccountNumber(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

const siteEngineerObject = z.object({
  name: z.string().trim().min(1, "Enter the name").max(100, "Name is too long"),
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
  address: upto(500, "Address is too long"),
  emergencyContact: upto(120, "Too long"),
  invite: z.boolean(),
  // Blank means no password; otherwise a Temporary Password.
  password: z.union([z.literal(""), temporaryPassword]),

  fatherName: upto(100, "Father's name is too long"),
  dateOfBirth: z.string(),
  gender: z.union([z.literal(""), z.enum(["male", "female", "other"])]),
  bloodGroup: z.union([z.literal(""), z.enum(BLOOD_GROUP_OPTIONS)]),

  employeeCode: upto(30, "Use at most 30 characters"),
  joiningDate: z.string(),
  qualification: upto(100, "Qualification is too long"),
  experienceYears: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^\d{1,2}$/.test(value) && Number(value) >= 0 && Number(value) <= 60),
      { message: "A whole number of years, 0 to 60" },
    ),
  specialisation: upto(100, "Specialisation is too long"),

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

  salary: wageValuesSchema,

  accountHolder: upto(100, "Account holder is too long"),
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
  bankName: upto(100, "Bank name is too long"),

  projectIds: z.array(z.string()),
});

export type SiteEngineerFormValues = z.infer<typeof siteEngineerObject>;

/**
 * Which cards the form shows, and so what it checks and sends:
 *
 * - `financial`: Financial on Labours; the Salary and Bank cards.
 * - `signIn`: the Sign-in card (Add, and Edit of one without a sign-in);
 *   one of Invite them or a password is required (ADR CM-0037).
 * - `membership`: the details their sign-in holds (email, address, KYC,
 *   salary, Projects). Off for a Site Engineer who is Office Staff.
 */
export type SiteEngineerFormMode = {
  financial: boolean;
  signIn: boolean;
  membership: boolean;
};

export const SIGN_IN_REQUIRED_MESSAGE =
  "A Site Engineer signs in: invite them, or set a password for them";

/** Whether Invite them can be ticked: it needs an email and no password. */
export function inviteAvailable(values: {
  email: string;
  password: string;
}): boolean {
  return values.email.trim() !== "" && values.password === "";
}

function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function siteEngineerSchema(mode: SiteEngineerFormMode) {
  return siteEngineerObject.superRefine((values, ctx) => {
    const issue = (path: (string | number)[], message: string) => {
      ctx.addIssue({ code: "custom", path, message });
    };
    // Their sign-in needs one of the two (ADR CM-0030 §6).
    if (mode.membership && values.mobile === "" && values.email === "")
      issue(["mobile"], "Enter a mobile number or an email");
    if (
      mode.signIn &&
      values.password === "" &&
      !(inviteAvailable(values) && values.invite)
    )
      issue(["password"], SIGN_IN_REQUIRED_MESSAGE);
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
    if (mode.membership)
      checkWage(values.salary, ctx, {
        path: ["salary"],
        ...STAFF_SALARY,
        showAmounts: mode.financial,
      });
  });
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

/** The form values for a new Site Engineer, or a saved one. */
export function siteEngineerDefaults(
  engineer: SiteEngineer | null,
): SiteEngineerFormValues {
  const profile = engineer?.profile;
  return {
    name: text(engineer?.name),
    mobile: engineer?.mobile?.replace(/^\+91/, "") ?? "",
    email: text(engineer?.email),
    address: text(engineer?.address),
    emergencyContact: text(engineer?.emergencyContact),
    invite: true,
    password: "",
    fatherName: text(profile?.fatherName),
    dateOfBirth: text(profile?.dateOfBirth),
    gender: profile?.gender ?? "",
    bloodGroup: profile?.bloodGroup ?? "",
    employeeCode: text(profile?.employeeCode),
    joiningDate: text(profile?.joiningDate),
    qualification: text(profile?.qualification),
    experienceYears:
      profile?.experienceYears == null ? "" : String(profile.experienceYears),
    specialisation: text(profile?.specialisation),
    // Stored identifiers show only masked; blank keeps them.
    aadhaar: "",
    pan: "",
    salary: wageDefaults(
      engineer?.workingHoursPerDay == null
        ? null
        : {
            type: engineer.salaryType ?? STAFF_SALARY.defaultType,
            perDay: engineer.salaryPerDay,
            perMonth: engineer.salaryPerMonth,
            overtimePerHour: engineer.overtimeWagePerHour,
            workingHoursPerDay: engineer.workingHoursPerDay,
            weeklyHolidays: engineer.weeklyHolidays,
          },
      STAFF_SALARY,
    ),
    accountHolder: text(engineer?.bank?.accountHolder),
    accountNumber: "",
    ifsc: text(engineer?.bank?.ifsc),
    bankName: text(engineer?.bank?.bankName),
    projectIds: engineer?.projectIds ?? [],
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

type Details = Omit<CreateSiteEngineerInput, "signIn">;

/**
 * The request body's details. Without `financial` the salary and bank are
 * left out, so an edit keeps them; without `membership` only the Site
 * Engineer row's fields are sent.
 */
function detailsInput(
  values: SiteEngineerFormValues,
  mode: SiteEngineerFormMode,
  keepWhenBlank: boolean,
): Details {
  const experience = values.experienceYears.trim();
  const details: Details = {
    name: values.name.trim(),
    mobile: values.mobile === "" ? null : normalizeMobile(values.mobile),
    profile: {
      employeeCode: orNull(values.employeeCode),
      fatherName: orNull(values.fatherName),
      dateOfBirth: orNull(values.dateOfBirth),
      gender: values.gender === "" ? null : values.gender,
      bloodGroup: values.bloodGroup === "" ? null : values.bloodGroup,
      joiningDate: orNull(values.joiningDate),
      qualification: orNull(values.qualification),
      experienceYears: experience === "" ? null : Number(experience),
      specialisation: orNull(values.specialisation),
    },
  };
  if (mode.financial)
    details.bank = {
      accountHolder: orNull(values.accountHolder),
      accountNumber: secret(
        tidyAccountNumber(values.accountNumber),
        keepWhenBlank,
      ),
      ifsc: orNull(values.ifsc),
      bankName: orNull(values.bankName),
    };
  if (!mode.membership) return details;

  details.email = orNull(values.email);
  details.address = orNull(values.address);
  details.emergencyContact = orNull(values.emergencyContact);
  details.aadhaar = secret(values.aadhaar, keepWhenBlank);
  details.pan = secret(values.pan, keepWhenBlank);
  details.projectIds = values.projectIds;
  if (mode.financial) {
    const salary = wagePayload(values.salary);
    details.salaryType = salary.type;
    details.salaryPerDay = salary.perDay;
    details.salaryPerMonth = salary.perMonth;
    details.overtimeWagePerHour = salary.overtimePerHour;
    details.workingHoursPerDay = salary.workingHoursPerDay;
    details.weeklyHolidays = salary.weeklyHolidays;
  }
  return details;
}

/** Invite them goes out only when it can: an email, no password. */
export function signInInput(values: SiteEngineerFormValues) {
  return {
    invite: inviteAvailable(values) && values.invite,
    password: values.password === "" ? null : values.password,
  };
}

export function createSiteEngineerPayload(
  values: SiteEngineerFormValues,
  financial: boolean,
): CreateSiteEngineerInput {
  return {
    ...detailsInput(
      values,
      { financial, signIn: true, membership: true },
      false,
    ),
    signIn: signInInput(values),
  };
}

export function updateSiteEngineerPayload(
  values: SiteEngineerFormValues,
  mode: SiteEngineerFormMode,
  expectedUpdatedAt: string,
): UpdateSiteEngineerInput {
  return {
    ...detailsInput(values, mode, true),
    ...(mode.signIn ? { signIn: signInInput(values) } : {}),
    expectedUpdatedAt,
  };
}

/**
 * Server codes on the field they are about, for the cards `mode` shows.
 * Anything else is a form-level message.
 */
export function siteEngineerErrorFields(
  values: SiteEngineerFormValues,
  mode: SiteEngineerFormMode,
): Record<string, FieldPath<SiteEngineerFormValues>> {
  const fields: Record<string, FieldPath<SiteEngineerFormValues>> = {
    SUPERVISOR_NAME_REQUIRED: "name",
    SUPERVISOR_NAME_IN_USE: "name",
    MEMBER_NAME_REQUIRED: "name",
    MEMBER_NAME_TOO_LONG: "name",
    MOBILE_INVALID: "mobile",
    MEMBER_MOBILE_IN_USE: "mobile",
    MOBILE_LOCKED: "mobile",
    FATHER_NAME_TOO_LONG: "fatherName",
    DATE_OF_BIRTH_INVALID: "dateOfBirth",
    GENDER_INVALID: "gender",
    BLOOD_GROUP_INVALID: "bloodGroup",
    SUPERVISOR_EMPLOYEE_CODE_IN_USE: "employeeCode",
    EMPLOYEE_CODE_TOO_LONG: "employeeCode",
    JOINING_DATE_INVALID: "joiningDate",
    QUALIFICATION_TOO_LONG: "qualification",
    EXPERIENCE_INVALID: "experienceYears",
    SPECIALISATION_TOO_LONG: "specialisation",
  };
  if (mode.financial)
    Object.assign(fields, {
      ACCOUNT_HOLDER_TOO_LONG: "accountHolder",
      ACCOUNT_NUMBER_INVALID: "accountNumber",
      IFSC_INVALID: "ifsc",
      BANK_NAME_TOO_LONG: "bankName",
    });
  if (mode.membership)
    Object.assign(fields, {
      MOBILE_OR_EMAIL_REQUIRED: "mobile",
      EMAIL_INVALID: "email",
      MEMBER_EMAIL_IN_USE: "email",
      MEMBER_EMAIL_REQUIRED: "email",
      ADDRESS_TOO_LONG: "address",
      EMERGENCY_CONTACT_TOO_LONG: "emergencyContact",
      AADHAAR_INVALID: "aadhaar",
      PAN_INVALID: "pan",
      ...wageErrorFields("salary", values.salary),
    });
  if (mode.signIn)
    Object.assign(fields, {
      SIGN_IN_REQUIRED: "password",
      PASSWORD_INVALID: "password",
      PASSWORD_TOO_SHORT: "password",
      PASSWORD_TOO_LONG: "password",
    });
  return fields;
}
