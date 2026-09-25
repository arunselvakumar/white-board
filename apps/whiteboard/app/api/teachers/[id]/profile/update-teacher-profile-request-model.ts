import { z } from "zod";

export const UpdateTeacherProfileRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().max(32).nullable().optional(),
  qualificationSummary: z.string().max(1000).nullable().optional(),
});
