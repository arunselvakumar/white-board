import { z } from "zod";

export const GetCourseRequestModel = z.object({
  id: z.uuid(),
});

export type GetCourseRequestModel = z.infer<typeof GetCourseRequestModel>;
