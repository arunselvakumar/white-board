import { z } from "zod";

export const UnassignTrainingInstituteTeacherBatchParamsModel = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
});
