import { z } from "zod";

export const ListCoursesRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export type ListCoursesRequestModel = z.infer<typeof ListCoursesRequestModel>;
