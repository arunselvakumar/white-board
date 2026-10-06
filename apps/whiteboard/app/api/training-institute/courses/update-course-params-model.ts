import { z } from "zod";

export const UpdateTrainingInstituteCourseParamsModel = z.object({
  id: z.uuid(),
});

export type UpdateTrainingInstituteCourseParamsModel = z.infer<
  typeof UpdateTrainingInstituteCourseParamsModel
>;
