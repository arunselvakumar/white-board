import { z } from "zod";
import { studentDetailsRequestFields } from "./student-details-model";

export const CreateStudentRequestModel = z.object({
  requestId: z.uuid().optional(),
  ...studentDetailsRequestFields,
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(32),
  email: z.string().trim().max(320).nullish(),
  photoUrl: z.string().trim().max(2048).nullish(),
  address: z.string().trim().max(4000).nullish(),
  idProofNote: z.string().trim().max(4000).nullish(),
  guardianName: z.string().trim().max(200).nullish(),
  guardianPhone: z.string().trim().max(32).nullish(),
});

export type CreateStudentRequestModel = z.infer<
  typeof CreateStudentRequestModel
>;
