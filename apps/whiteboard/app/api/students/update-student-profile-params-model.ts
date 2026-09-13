import { z } from "zod";

export const UpdateStudentProfileParamsModel = z.object({
  id: z.uuid(),
});

export type UpdateStudentProfileParamsModel = z.infer<
  typeof UpdateStudentProfileParamsModel
>;
