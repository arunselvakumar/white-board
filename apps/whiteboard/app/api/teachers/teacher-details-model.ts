import { z } from "zod";

const Salutation = z.enum(["mr", "mrs", "ms", "miss", "mx", "dr", "prof"]);
const Gender = z.enum(["female", "male", "non_binary", "prefer_not_to_say"]);
const WeeklySlot = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const TeacherDetailsResponseModel = z.object({
  salutation: Salutation.nullable(),
  preferredName: z.string().nullable(),
  gender: Gender.nullable(),
  dateOfBirth: z.iso.date().nullable(),
  address: z.string().nullable(),
  alternatePhone: z.string().nullable(),
  cityArea: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  teachingSpecialisms: z.array(z.string()),
  learnerLevels: z.array(z.string()),
  yearsExperience: z.number().int().nullable(),
  highestQualification: z.string().nullable(),
  certifications: z.array(z.string()),
  languages: z.array(z.string()),
  bio: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  startDate: z.iso.date().nullable(),
  availability: z.array(WeeklySlot),
  idProofType: z.string().nullable(),
  backgroundCheckStatus: z.enum([
    "not_checked",
    "pending",
    "completed",
    "needs_review",
  ]),
  backgroundCheckDate: z.iso.date().nullable(),
  backgroundCheckNote: z.string().nullable(),
  payBasis: z.enum(["monthly", "hourly", "per_batch"]).nullable(),
  payRatePaise: z.number().int().nullable(),
  bankAccountHolder: z.string().nullable(),
  bankName: z.string().nullable(),
  bankIfsc: z.string().nullable(),
});

export const TeacherDetailsRequestModel = TeacherDetailsResponseModel.partial();

export const TeacherPrivateDetailsRequestModel = z.object({
  idNumber: z.string().max(64).nullable().optional(),
  bankAccountNumber: z.string().max(64).nullable().optional(),
});

export const TeacherPhotoRequestModel = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  dataBase64: z.string().min(1).max(2_800_000),
});
