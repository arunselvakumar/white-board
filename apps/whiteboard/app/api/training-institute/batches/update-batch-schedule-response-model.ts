import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const UpdateTrainingInstituteBatchScheduleResponseModel =
  z.object(batchResponseFields);
export type UpdateTrainingInstituteBatchScheduleResponseModel = z.infer<
  typeof UpdateTrainingInstituteBatchScheduleResponseModel
>;
