import { z } from "zod";

export const GetStudentRequestModel = z.object({
  id: z.uuid(),
});

export type GetStudentRequestModel = z.infer<typeof GetStudentRequestModel>;
