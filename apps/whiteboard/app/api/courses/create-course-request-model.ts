import { z } from "zod";

export const CreateCourseRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  duration: z.string().trim().min(1).max(80),
  description: z.string().trim().max(4000).nullish(),
  defaultFeeAmountPaise: z.number().int().min(0),
});

export type CreateCourseRequestModel = z.infer<typeof CreateCourseRequestModel>;
