import { z } from "zod";

export const UpdateStudentProfileRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(32),
  email: z.string().trim().max(320).nullable().optional(),
  photoUrl: z.string().trim().max(2048).nullable().optional(),
  address: z.string().trim().max(4000).nullable().optional(),
  idProofNote: z.string().trim().max(4000).nullable().optional(),
  guardianName: z.string().trim().max(200).nullable().optional(),
  guardianPhone: z.string().trim().max(32).nullable().optional(),
});

export type UpdateStudentProfileRequestModel = z.infer<
  typeof UpdateStudentProfileRequestModel
>;
