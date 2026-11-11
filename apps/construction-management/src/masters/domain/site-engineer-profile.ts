import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * A Site Engineer's own profile (ADR CM-0037): what the Site Engineer row
 * keeps beyond the name and mobile. Contact, Aadhaar, PAN, salary and
 * Projects live on their sign-in membership in the organization context.
 */

export type Gender = "male" | "female" | "other";

export const GENDERS: readonly Gender[] = ["male", "female", "other"];

export const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export type SiteEngineerProfile = {
  /** The Company's own code; unique among live Site Engineers. */
  employeeCode: string | null;
  fatherName: string | null;
  dateOfBirth: CalendarDate | null;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
  joiningDate: CalendarDate | null;
  /** B.E. Civil, Diploma in Civil Engineering … */
  qualification: string | null;
  /** Whole years in the trade before joining. */
  experienceYears: number | null;
  /** Civil, steel / PEB, MEP …; free text. */
  specialisation: string | null;
};

export type SiteEngineerProfileInput = {
  employeeCode?: string | null;
  fatherName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  bloodGroup?: string | null;
  joiningDate?: string | null;
  qualification?: string | null;
  experienceYears?: number | null;
  specialisation?: string | null;
};

export const NO_PROFILE: SiteEngineerProfile = {
  employeeCode: null,
  fatherName: null,
  dateOfBirth: null,
  gender: null,
  bloodGroup: null,
  joiningDate: null,
  qualification: null,
  experienceYears: null,
  specialisation: null,
};

/**
 * Where the salary is paid. The account number is plain in memory and
 * stored encrypted; screens see only the last four digits.
 */
export type SiteEngineerBank = {
  accountHolder: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
};

export type SiteEngineerBankInput = {
  accountHolder?: string | null;
  /** Left out keeps the stored number (screens hold only the mask). */
  accountNumber?: string | null;
  ifsc?: string | null;
  bankName?: string | null;
};

export const NO_BANK: SiteEngineerBank = {
  accountHolder: null,
  accountNumber: null,
  ifsc: null,
  bankName: null,
};

function text(
  value: string | null | undefined,
  max: number,
  code: string,
  label: string,
): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  if (trimmed === "") return null;
  if (trimmed.length > max)
    throw new DomainError(
      code,
      `${label} must be at most ${String(max)} characters.`,
    );
  return trimmed;
}

function date(
  value: string | null | undefined,
  code: string,
  label: string,
): CalendarDate | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return null;
  if (!isCalendarDate(trimmed))
    throw new DomainError(code, `Enter the ${label} as a real date.`);
  return trimmed;
}

/** Validates and tidies a profile; `today` bounds the dates. */
export function siteEngineerProfile(
  input: SiteEngineerProfileInput,
  today: CalendarDate,
): SiteEngineerProfile {
  const employeeCode = text(
    input.employeeCode,
    30,
    "EMPLOYEE_CODE_TOO_LONG",
    "Employee code",
  );
  const dateOfBirth = date(
    input.dateOfBirth,
    "DATE_OF_BIRTH_INVALID",
    "date of birth",
  );
  if (dateOfBirth != null && dateOfBirth >= today)
    throw new DomainError(
      "DATE_OF_BIRTH_INVALID",
      "The date of birth must be before today.",
    );
  const joiningDate = date(
    input.joiningDate,
    "JOINING_DATE_INVALID",
    "joining date",
  );
  if (joiningDate != null && dateOfBirth != null && joiningDate <= dateOfBirth)
    throw new DomainError(
      "JOINING_DATE_INVALID",
      "The joining date must be after the date of birth.",
    );
  const gender = input.gender?.trim() ?? "";
  if (gender !== "" && !GENDERS.includes(gender as Gender))
    throw new DomainError("GENDER_INVALID", "Choose Male, Female or Other.");
  const bloodGroup = input.bloodGroup?.trim().toUpperCase() ?? "";
  if (bloodGroup !== "" && !BLOOD_GROUPS.includes(bloodGroup as BloodGroup))
    throw new DomainError(
      "BLOOD_GROUP_INVALID",
      "Choose a blood group like A+ or O-.",
    );
  const experience = input.experienceYears ?? null;
  if (
    experience != null &&
    (!Number.isInteger(experience) || experience < 0 || experience > 60)
  )
    throw new DomainError(
      "EXPERIENCE_INVALID",
      "Experience is a whole number of years, 0 to 60.",
    );
  return {
    employeeCode,
    fatherName: text(
      input.fatherName,
      100,
      "FATHER_NAME_TOO_LONG",
      "Father's name",
    ),
    dateOfBirth,
    gender: gender === "" ? null : (gender as Gender),
    bloodGroup: bloodGroup === "" ? null : (bloodGroup as BloodGroup),
    joiningDate,
    qualification: text(
      input.qualification,
      100,
      "QUALIFICATION_TOO_LONG",
      "Qualification",
    ),
    experienceYears: experience,
    specialisation: text(
      input.specialisation,
      100,
      "SPECIALISATION_TOO_LONG",
      "Specialisation",
    ),
  };
}

/** IFSC: four letters, a zero, six letters or digits. */
function isIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
}

/** Validates and tidies bank details; `current` fills a left-out number. */
export function siteEngineerBank(
  input: SiteEngineerBankInput,
  current: SiteEngineerBank = NO_BANK,
): SiteEngineerBank {
  const rawNumber =
    input.accountNumber === undefined
      ? (current.accountNumber ?? "")
      : (input.accountNumber?.replace(/[\s-]/g, "").toUpperCase() ?? "");
  if (rawNumber !== "" && !/^[A-Z0-9]{6,30}$/.test(rawNumber))
    throw new DomainError(
      "ACCOUNT_NUMBER_INVALID",
      "Enter the account number: 6 to 30 letters and digits.",
    );
  const ifsc = input.ifsc?.trim().toUpperCase() ?? "";
  if (ifsc !== "" && !isIfsc(ifsc))
    throw new DomainError(
      "IFSC_INVALID",
      "An IFSC is four letters, a zero, then six letters or digits (like HDFC0001234).",
    );
  return {
    accountHolder: text(
      input.accountHolder,
      100,
      "ACCOUNT_HOLDER_TOO_LONG",
      "Account holder",
    ),
    accountNumber: rawNumber === "" ? null : rawNumber,
    ifsc: ifsc === "" ? null : ifsc,
    bankName: text(input.bankName, 100, "BANK_NAME_TOO_LONG", "Bank name"),
  };
}

/** The last four characters of an account number, for screens and audit. */
export function accountLast4(accountNumber: string | null): string | null {
  return accountNumber == null ? null : accountNumber.slice(-4);
}
