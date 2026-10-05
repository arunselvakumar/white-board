import { z } from "zod";

import type { TeacherProfile, TeacherWriteInput } from "@/src/queries/teachers";

const optionalDate = z.iso.date().or(z.literal(""));
const optionalInteger = z
  .string()
  .refine(
    (value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 70),
    "Enter 0 to 70 years",
  );
const optionalMoney = z
  .string()
  .refine(
    (value) => value === "" || /^\d+(?:\.\d{1,2})?$/.test(value),
    "Enter a valid amount",
  );

export const teacherFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    email: z.string().trim().max(320).pipe(z.email("Enter a valid email")),
    kind: z.enum(["centre_teacher", "visiting_tutor"]),
    phone: z.string().trim().max(32),
    qualificationSummary: z.string().trim().max(1000),
    salutation: z.enum(["mr", "mrs", "ms", "miss", "mx", "dr", "prof", ""]),
    preferredName: z.string().trim().max(200),
    gender: z.enum(["female", "male", "non_binary", "prefer_not_to_say", ""]),
    dateOfBirth: optionalDate,
    address: z.string().trim().max(4000),
    alternatePhone: z.string().trim().max(32),
    cityArea: z.string().trim().max(200),
    emergencyContactName: z.string().trim().max(200),
    emergencyContactPhone: z.string().trim().max(32),
    teachingSpecialisms: z.string().trim().max(2000),
    learnerLevels: z.string().trim().max(2000),
    yearsExperience: optionalInteger,
    highestQualification: z.string().trim().max(200),
    certifications: z.string().trim().max(2000),
    languages: z.string().trim().max(2000),
    bio: z.string().trim().max(2000),
    portfolioUrl: z.url("Enter a valid URL").or(z.literal("")),
    startDate: optionalDate,
    availability: z.array(
      z.object({
        dayOfWeek: z.string().regex(/^[0-6]$/, "Choose a day"),
        startTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a start time"),
        endTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter an end time"),
      }),
    ),
    idProofType: z.string().trim().max(100),
    idNumber: z.string().trim().max(64),
    backgroundCheckStatus: z.enum([
      "not_checked",
      "pending",
      "completed",
      "needs_review",
    ]),
    backgroundCheckDate: optionalDate,
    backgroundCheckNote: z.string().trim().max(1000),
    payBasis: z.enum(["monthly", "hourly", "per_batch", ""]),
    payRateRupees: optionalMoney,
    bankAccountHolder: z.string().trim().max(200),
    bankName: z.string().trim().max(200),
    bankIfsc: z.string().trim().max(11),
    bankAccountNumber: z.string().trim().max(64),
    documentKind: z.enum([
      "certificate",
      "identity",
      "background_check",
      "other",
    ]),
  })
  .refine(
    (value) =>
      value.availability.every((slot) => slot.startTime < slot.endTime),
    {
      path: ["availability"],
      message: "Availability end time must be after start time",
    },
  );

export type TeacherFormValues = z.infer<typeof teacherFormSchema>;

export function teacherToFormValues(
  teacher?: TeacherProfile,
): TeacherFormValues {
  const details = teacher?.details;
  return {
    name: teacher?.name ?? "",
    email: teacher?.email ?? "",
    kind: teacher?.kind ?? "centre_teacher",
    phone: teacher?.phone ?? "",
    qualificationSummary: teacher?.qualificationSummary ?? "",
    salutation: details?.salutation ?? "",
    preferredName: details?.preferredName ?? "",
    gender: details?.gender ?? "",
    dateOfBirth: details?.dateOfBirth ?? "",
    address: details?.address ?? "",
    alternatePhone: details?.alternatePhone ?? "",
    cityArea: details?.cityArea ?? "",
    emergencyContactName: details?.emergencyContactName ?? "",
    emergencyContactPhone: details?.emergencyContactPhone ?? "",
    teachingSpecialisms: details?.teachingSpecialisms.join(", ") ?? "",
    learnerLevels: details?.learnerLevels.join(", ") ?? "",
    yearsExperience: details?.yearsExperience?.toString() ?? "",
    highestQualification: details?.highestQualification ?? "",
    certifications: details?.certifications.join(", ") ?? "",
    languages: details?.languages.join(", ") ?? "",
    bio: details?.bio ?? "",
    portfolioUrl: details?.portfolioUrl ?? "",
    startDate: details?.startDate ?? "",
    availability:
      details?.availability.flatMap((slot) =>
        slot.daysOfWeek.map((day) => ({
          dayOfWeek: String(day),
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      ) ?? [],
    idProofType: details?.idProofType ?? "",
    idNumber: "",
    backgroundCheckStatus: details?.backgroundCheckStatus ?? "not_checked",
    backgroundCheckDate: details?.backgroundCheckDate ?? "",
    backgroundCheckNote: details?.backgroundCheckNote ?? "",
    payBasis: details?.payBasis ?? "",
    payRateRupees:
      details?.payRatePaise == null
        ? ""
        : (details.payRatePaise / 100).toFixed(2),
    bankAccountHolder: details?.bankAccountHolder ?? "",
    bankName: details?.bankName ?? "",
    bankIfsc: details?.bankIfsc ?? "",
    bankAccountNumber: "",
    documentKind: "certificate",
  };
}

const nullable = (value: string): string | null => value.trim() || null;
const entries = (value: string): string[] =>
  value
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

export function teacherFormToWriteInput(
  values: TeacherFormValues,
  teacher?: TeacherProfile,
  clear?: { idNumber: boolean; bankAccountNumber: boolean },
): TeacherWriteInput {
  return {
    name: values.name.trim(),
    ...(teacher == null ? { email: values.email.trim().toLowerCase() } : {}),
    kind: values.kind,
    phone: nullable(values.phone),
    qualificationSummary: nullable(values.qualificationSummary),
    details: {
      salutation: nullable(
        values.salutation,
      ) as TeacherProfile["details"]["salutation"],
      preferredName: nullable(values.preferredName),
      gender: nullable(values.gender) as TeacherProfile["details"]["gender"],
      dateOfBirth: nullable(values.dateOfBirth),
      address: nullable(values.address),
      alternatePhone: nullable(values.alternatePhone),
      cityArea: nullable(values.cityArea),
      emergencyContactName: nullable(values.emergencyContactName),
      emergencyContactPhone: nullable(values.emergencyContactPhone),
      teachingSpecialisms: entries(values.teachingSpecialisms),
      learnerLevels: entries(values.learnerLevels),
      yearsExperience:
        values.yearsExperience === "" ? null : Number(values.yearsExperience),
      highestQualification: nullable(values.highestQualification),
      certifications: entries(values.certifications),
      languages: entries(values.languages),
      bio: nullable(values.bio),
      portfolioUrl: nullable(values.portfolioUrl),
      startDate: nullable(values.startDate),
      availability: values.availability.map((slot) => ({
        daysOfWeek: [Number(slot.dayOfWeek)],
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
      idProofType: nullable(values.idProofType),
      backgroundCheckStatus: values.backgroundCheckStatus,
      backgroundCheckDate: nullable(values.backgroundCheckDate),
      backgroundCheckNote: nullable(values.backgroundCheckNote),
      payBasis: nullable(
        values.payBasis,
      ) as TeacherProfile["details"]["payBasis"],
      payRatePaise:
        values.payRateRupees === ""
          ? null
          : Math.round(Number(values.payRateRupees) * 100),
      bankAccountHolder: nullable(values.bankAccountHolder),
      bankName: nullable(values.bankName),
      bankIfsc: nullable(values.bankIfsc),
    },
    privateDetails: {
      ...(values.idNumber.trim()
        ? { idNumber: values.idNumber.trim() }
        : clear?.idNumber
          ? { idNumber: null }
          : {}),
      ...(values.bankAccountNumber.trim()
        ? { bankAccountNumber: values.bankAccountNumber.trim() }
        : clear?.bankAccountNumber
          ? { bankAccountNumber: null }
          : {}),
    },
  };
}
