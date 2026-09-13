import { z } from "zod";

export const UpdateCourseParamsModel = z.object({
  id: z.uuid(),
});

export type UpdateCourseParamsModel = z.infer<typeof UpdateCourseParamsModel>;
