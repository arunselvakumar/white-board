import { z } from "zod";

export const GetTrainingInstituteCourseRequestModel = z.object({
  id: z.uuid(),
});

export type GetTrainingInstituteCourseRequestModel = z.infer<
  typeof GetTrainingInstituteCourseRequestModel
>;
