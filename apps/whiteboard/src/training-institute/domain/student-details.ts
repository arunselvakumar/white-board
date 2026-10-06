import { DomainError } from "./errors";
import { EmailAddress } from "./email-address";
import { OptionalText } from "./optional-text";
import { Phone } from "./phone";

export const SALUTATIONS = [
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
] as const;
export const GENDERS = [
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
] as const;
export const EDUCATION_STATUSES = ["school", "completed", "other"] as const;

export type Salutation = (typeof SALUTATIONS)[number];
export type Gender = (typeof GENDERS)[number];
export type EducationStatus = (typeof EDUCATION_STATUSES)[number];

export type ParentDetails = {
  salutation: Salutation | null;
  gender: Gender | null;
  name: string | null;
  primaryPhone: string | null;
  alternatePhone: string | null;
  occupation: string | null;
  email: string | null;
};

export type GuardianDetails = {
  salutation: Salutation | null;
  gender: Gender | null;
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
};

export type StudentDetails = {
  salutation: Salutation | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  educationStatus: EducationStatus | null;
  currentInstitution: string | null;
  currentGrade: string | null;
  schoolBoard: string | null;
  highestQualification: string | null;
  father: ParentDetails;
  mother: ParentDetails;
  guardians: GuardianDetails[];
  emergencyPhone: string | null;
};

export type RawStudentDetails = {
  salutation?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  educationStatus?: string | null;
  currentInstitution?: string | null;
  currentGrade?: string | null;
  schoolBoard?: string | null;
  highestQualification?: string | null;
  father?: Partial<Record<keyof ParentDetails, string | null>> | null;
  mother?: Partial<Record<keyof ParentDetails, string | null>> | null;
  guardians?:
    | {
        salutation?: string | null;
        gender?: string | null;
        name: string;
        relationship?: string | null;
        phone?: string | null;
        email?: string | null;
      }[]
    | null;
  emergencyPhone?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
};

function optional(
  raw: string | null | undefined,
  max: number,
  label: string,
): string | null {
  return (
    OptionalText.create(
      raw,
      max,
      "STUDENT_DETAIL_TOO_LONG",
      `${label} must be at most ${String(max)} characters.`,
    )?.value ?? null
  );
}

function choice<T extends string>(
  raw: string | null | undefined,
  values: readonly T[],
  label: string,
): T | null {
  if (raw == null || raw.trim() === "") return null;
  if (!values.includes(raw as T)) {
    throw new DomainError("INVALID_STUDENT_DETAIL", `Invalid ${label}.`);
  }
  return raw as T;
}

function parent(raw: RawStudentDetails["father"]): ParentDetails {
  return {
    salutation: choice(raw?.salutation, SALUTATIONS, "salutation"),
    gender: choice(raw?.gender, GENDERS, "gender"),
    name: optional(raw?.name, 200, "Parent name"),
    primaryPhone: Phone.createOptional(raw?.primaryPhone)?.value ?? null,
    alternatePhone: Phone.createOptional(raw?.alternatePhone)?.value ?? null,
    occupation: optional(raw?.occupation, 200, "Occupation"),
    email: EmailAddress.create(raw?.email)?.value ?? null,
  };
}

export function studentDetailsFromRaw(raw: RawStudentDetails): StudentDetails {
  const legacyGuardianName = raw.guardianName?.trim();
  const guardians =
    raw.guardians ??
    (raw.guardianName || raw.guardianPhone
      ? [
          {
            name:
              legacyGuardianName != null && legacyGuardianName.length > 0
                ? legacyGuardianName
                : "Guardian",
            phone: raw.guardianPhone,
          },
        ]
      : []);
  const dateOfBirth = optional(raw.dateOfBirth, 10, "Date of birth");
  const parsedBirthDate =
    dateOfBirth == null ? null : new Date(`${dateOfBirth}T00:00:00Z`);
  if (
    dateOfBirth != null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) ||
      parsedBirthDate == null ||
      Number.isNaN(parsedBirthDate.getTime()) ||
      parsedBirthDate.toISOString().slice(0, 10) !== dateOfBirth)
  ) {
    throw new DomainError(
      "INVALID_DATE_OF_BIRTH",
      "Date of birth must be a valid date.",
    );
  }
  return {
    salutation: choice(raw.salutation, SALUTATIONS, "salutation"),
    gender: choice(raw.gender, GENDERS, "gender"),
    dateOfBirth,
    educationStatus: choice(
      raw.educationStatus,
      EDUCATION_STATUSES,
      "education status",
    ),
    currentInstitution: optional(
      raw.currentInstitution,
      200,
      "School or college",
    ),
    currentGrade: optional(raw.currentGrade, 100, "Class or grade"),
    schoolBoard: optional(raw.schoolBoard, 100, "School board"),
    highestQualification: optional(
      raw.highestQualification,
      200,
      "Qualification",
    ),
    father: parent(raw.father),
    mother: parent(raw.mother),
    guardians: guardians.map((guardian) => {
      const name = optional(guardian.name, 200, "Guardian name");
      if (name == null) {
        throw new DomainError(
          "GUARDIAN_NAME_REQUIRED",
          "Guardian name is required.",
        );
      }
      return {
        salutation: choice(guardian.salutation, SALUTATIONS, "salutation"),
        gender: choice(guardian.gender, GENDERS, "gender"),
        name,
        relationship: optional(
          guardian.relationship,
          100,
          "Guardian relationship",
        ),
        phone: Phone.createOptional(guardian.phone)?.value ?? null,
        email: EmailAddress.create(guardian.email)?.value ?? null,
      };
    }),
    emergencyPhone: Phone.createOptional(raw.emergencyPhone)?.value ?? null,
  };
}

export function studentDetailsFromStored(
  value: unknown,
  legacy: { guardianName: string | null; guardianPhone: string | null },
): StudentDetails {
  const stored =
    value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as RawStudentDetails)
      : {};
  return studentDetailsFromRaw({
    ...stored,
    guardianName: legacy.guardianName,
    guardianPhone: legacy.guardianPhone,
  });
}
