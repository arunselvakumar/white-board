import { z } from "zod";

export const ListTrainingInstituteEnrollmentsRequestModel = z
  .object({
    studentId: z.uuid().optional(),
    batchId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });
export type ListTrainingInstituteEnrollmentsRequestModel = z.infer<
  typeof ListTrainingInstituteEnrollmentsRequestModel
>;
