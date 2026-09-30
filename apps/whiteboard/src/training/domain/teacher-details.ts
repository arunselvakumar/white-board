import { DomainError } from "./errors";
import { OptionalText } from "./optional-text";
import { Phone } from "./phone";
import { GENDERS, SALUTATIONS, type Gender, type Salutation } from "./student-details";
import type { WeeklySlot } from "./weekly-timings";

export const TEACHER_PAY_BASES = ["monthly", "hourly", "per_batch"] as const;
export const BACKGROUND_CHECK_STATUSES = ["not_checked", "pending", "completed", "needs_review"] as const;
export type TeacherPayBasis = (typeof TEACHER_PAY_BASES)[number];
export type BackgroundCheckStatus = (typeof BACKGROUND_CHECK_STATUSES)[number];

export type TeacherDetails = {
  salutation: Salutation | null;
  preferredName: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  address: string | null;
  alternatePhone: string | null;
  cityArea: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  teachingSpecialisms: string[];
  learnerLevels: string[];
  yearsExperience: number | null;
  highestQualification: string | null;
  certifications: string[];
  languages: string[];
  bio: string | null;
  portfolioUrl: string | null;
  startDate: string | null;
  availability: WeeklySlot[];
  idProofType: string | null;
  backgroundCheckStatus: BackgroundCheckStatus;
  backgroundCheckDate: string | null;
  backgroundCheckNote: string | null;
  payBasis: TeacherPayBasis | null;
  payRatePaise: number | null;
  bankAccountHolder: string | null;
  bankName: string | null;
  bankIfsc: string | null;
};

export type RawTeacherDetails = Partial<TeacherDetails>;

const EMPTY: TeacherDetails = {
  salutation: null, preferredName: null, gender: null, dateOfBirth: null,
  address: null, alternatePhone: null, cityArea: null, emergencyContactName: null,
  emergencyContactPhone: null, teachingSpecialisms: [], learnerLevels: [],
  yearsExperience: null, highestQualification: null, certifications: [],
  languages: [], bio: null, portfolioUrl: null, startDate: null,
  availability: [], idProofType: null, backgroundCheckStatus: "not_checked",
  backgroundCheckDate: null, backgroundCheckNote: null, payBasis: null,
  payRatePaise: null, bankAccountHolder: null, bankName: null, bankIfsc: null,
};

function optional(value: string | null | undefined, max: number, label: string): string | null {
  return OptionalText.create(value, max, "TEACHER_DETAIL_TOO_LONG", `${label} must be at most ${max} characters.`)?.value ?? null;
}

function choice<T extends string>(value: string | null | undefined, choices: readonly T[], label: string): T | null {
  if (value == null || value === "") return null;
  if (!choices.includes(value as T)) throw new DomainError("TEACHER_DETAIL_INVALID", `Invalid ${label}.`);
  return value as T;
}

function date(value: string | null | undefined, label: string, now: Date, allowFuture: boolean): string | null {
  if (value == null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError("TEACHER_DATE_INVALID", `${label} must be a valid date.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || (!allowFuture && value > now.toISOString().slice(0, 10))) {
    throw new DomainError("TEACHER_DATE_INVALID", `${label} must be a valid past date.`);
  }
  return value;
}

function tags(values: string[] | undefined, label: string): string[] {
  if (values == null) return [];
  if (!Array.isArray(values) || values.length > 20) throw new DomainError("TEACHER_DETAIL_INVALID", `${label} must have at most 20 entries.`);
  const normalized = values.map((value) => optional(value, 100, label)).filter((value): value is string => value != null);
  return [...new Set(normalized)];
}

function availability(values: WeeklySlot[] | undefined): WeeklySlot[] {
  if (values == null) return [];
  if (!Array.isArray(values) || values.length > 21) throw new DomainError("TEACHER_AVAILABILITY_INVALID", "Too many availability slots.");
  const slots = values.map((value) => {
    if (!Array.isArray(value.daysOfWeek) || value.daysOfWeek.length === 0 ||
      !value.daysOfWeek.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) || value.startTime >= value.endTime) {
      throw new DomainError("TEACHER_AVAILABILITY_INVALID", "Availability needs valid days and start/end times.");
    }
    return { daysOfWeek: [...new Set(value.daysOfWeek)], startTime: value.startTime, endTime: value.endTime };
  });
  for (let day = 0; day <= 6; day += 1) {
    const onDay = slots.filter((slot) => slot.daysOfWeek.includes(day)).sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let index = 1; index < onDay.length; index += 1) {
      const previous = onDay[index - 1];
      const current = onDay[index];
      if (previous != null && current != null && previous.endTime > current.startTime) {
        throw new DomainError("TEACHER_AVAILABILITY_OVERLAP", "Availability slots cannot overlap.");
      }
    }
  }
  return slots;
}

export function teacherDetailsFromRaw(raw: RawTeacherDetails = {}, now = new Date(), existing?: TeacherDetails): TeacherDetails {
  const value = { ...EMPTY, ...existing, ...raw };
  const yearsExperience = value.yearsExperience;
  if (yearsExperience != null && (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 70)) {
    throw new DomainError("TEACHER_EXPERIENCE_INVALID", "Years of teaching experience must be between 0 and 70.");
  }
  const payRatePaise = value.payRatePaise;
  if (payRatePaise != null && (!Number.isSafeInteger(payRatePaise) || payRatePaise < 0)) {
    throw new DomainError("TEACHER_PAY_INVALID", "Pay rate must be zero or more.");
  }
  const portfolioUrl = optional(value.portfolioUrl, 2048, "Portfolio URL");
  if (portfolioUrl != null) {
    try {
      const parsed = new URL(portfolioUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
    } catch {
      throw new DomainError("TEACHER_PORTFOLIO_INVALID", "Portfolio URL must start with http:// or https://.");
    }
  }
  const bankIfsc = optional(value.bankIfsc, 11, "Bank IFSC")?.toUpperCase() ?? null;
  if (bankIfsc != null && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankIfsc)) {
    throw new DomainError("TEACHER_IFSC_INVALID", "Bank IFSC is invalid.");
  }
  return {
    salutation: choice(value.salutation, SALUTATIONS, "salutation"),
    preferredName: optional(value.preferredName, 200, "Preferred name"),
    gender: choice(value.gender, GENDERS, "gender"),
    dateOfBirth: date(value.dateOfBirth, "Date of birth", now, false),
    address: optional(value.address, 4000, "Address"),
    alternatePhone: Phone.createOptional(value.alternatePhone)?.value ?? null,
    cityArea: optional(value.cityArea, 200, "City or area"),
    emergencyContactName: optional(value.emergencyContactName, 200, "Emergency contact name"),
    emergencyContactPhone: Phone.createOptional(value.emergencyContactPhone)?.value ?? null,
    teachingSpecialisms: tags(value.teachingSpecialisms, "Teaching specialisms"),
    learnerLevels: tags(value.learnerLevels, "Learner levels"),
    yearsExperience,
    highestQualification: optional(value.highestQualification, 200, "Highest qualification"),
    certifications: tags(value.certifications, "Certifications"),
    languages: tags(value.languages, "Languages"),
    bio: optional(value.bio, 2000, "Bio"),
    portfolioUrl,
    startDate: date(value.startDate, "Start date", now, true),
    availability: availability(value.availability),
    idProofType: optional(value.idProofType, 100, "ID proof type"),
    backgroundCheckStatus: choice(value.backgroundCheckStatus, BACKGROUND_CHECK_STATUSES, "background check status") ?? "not_checked",
    backgroundCheckDate: date(value.backgroundCheckDate, "Background check date", now, false),
    backgroundCheckNote: optional(value.backgroundCheckNote, 1000, "Background check note"),
    payBasis: choice(value.payBasis, TEACHER_PAY_BASES, "pay basis"),
    payRatePaise,
    bankAccountHolder: optional(value.bankAccountHolder, 200, "Bank account holder"),
    bankName: optional(value.bankName, 200, "Bank name"),
    bankIfsc,
  };
}

export function teacherDetailsFromStored(raw: unknown): TeacherDetails {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return teacherDetailsFromRaw();
  return teacherDetailsFromRaw(raw);
}
