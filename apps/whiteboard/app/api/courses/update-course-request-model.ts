import { z } from "zod";

export const UpdateCourseRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  duration: z.string().trim().min(1).max(80),
  description: z.string().trim().max(4000).nullable().optional(),
  defaultFeeAmountPaise: z.number().int().min(0),
});

export type UpdateCourseRequestModel = z.infer<typeof UpdateCourseRequestModel>;
