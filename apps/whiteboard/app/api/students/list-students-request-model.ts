import { z } from "zod";

export const ListStudentsRequestModel = z
  .object({
    q: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export type ListStudentsRequestModel = z.infer<typeof ListStudentsRequestModel>;
