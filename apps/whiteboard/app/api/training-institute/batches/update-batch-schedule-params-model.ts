import { z } from "zod";

export const UpdateTrainingInstituteBatchScheduleParamsModel = z.object({
  id: z.uuid(),
});
export type UpdateTrainingInstituteBatchScheduleParamsModel = z.infer<
  typeof UpdateTrainingInstituteBatchScheduleParamsModel
>;
