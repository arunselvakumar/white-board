import { z } from "zod";

const SalutationModel = z.enum(["mr", "mrs", "ms", "miss", "mx", "dr", "prof"]);
const GenderModel = z.enum([
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
]);
const EducationStatusModel = z.enum(["school", "completed", "other"]);

const ParentInputModel = z.object({
  salutation: SalutationModel.nullish(),
  gender: GenderModel.nullish(),
  name: z.string().trim().max(200).nullish(),
  primaryPhone: z.string().trim().max(32).nullish(),
  alternatePhone: z.string().trim().max(32).nullish(),
  occupation: z.string().trim().max(200).nullish(),
  email: z.email().max(320).or(z.literal("")).nullish(),
});

const GuardianInputModel = z.object({
  salutation: SalutationModel.nullish(),
  gender: GenderModel.nullish(),
  name: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(32).nullish(),
  email: z.email().max(320).or(z.literal("")).nullish(),
});

export const studentDetailsRequestFields = {
  salutation: SalutationModel.nullish(),
  gender: GenderModel.nullish(),
  dateOfBirth: z.iso.date().nullish(),
  educationStatus: EducationStatusModel.nullish(),
  currentInstitution: z.string().trim().max(200).nullish(),
  currentGrade: z.string().trim().max(100).nullish(),
  schoolBoard: z.string().trim().max(100).nullish(),
  highestQualification: z.string().trim().max(200).nullish(),
  father: ParentInputModel.nullish(),
  mother: ParentInputModel.nullish(),
  guardians: z.array(GuardianInputModel).nullish(),
  emergencyPhone: z.string().trim().max(32).nullish(),
};

const ParentResponseModel = z.object({
  salutation: SalutationModel.nullable(),
  gender: GenderModel.nullable(),
  name: z.string().nullable(),
  primaryPhone: z.string().nullable(),
  alternatePhone: z.string().nullable(),
  occupation: z.string().nullable(),
  email: z.string().nullable(),
});

export const StudentDetailsResponseModel = z.object({
  salutation: SalutationModel.nullable(),
  gender: GenderModel.nullable(),
  dateOfBirth: z.string().nullable(),
  educationStatus: EducationStatusModel.nullable(),
  currentInstitution: z.string().nullable(),
  currentGrade: z.string().nullable(),
  schoolBoard: z.string().nullable(),
  highestQualification: z.string().nullable(),
  father: ParentResponseModel,
  mother: ParentResponseModel,
  guardians: z.array(
    z.object({
      salutation: SalutationModel.nullable(),
      gender: GenderModel.nullable(),
      name: z.string(),
      relationship: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    }),
  ),
  emergencyPhone: z.string().nullable(),
});
