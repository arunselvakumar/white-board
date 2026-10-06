import { z } from "zod";

export const SetTrainingInstituteEnrollmentTimingsParamsModel = z.object({
  id: z.uuid(),
});
export type SetTrainingInstituteEnrollmentTimingsParamsModel = z.infer<
  typeof SetTrainingInstituteEnrollmentTimingsParamsModel
>;
