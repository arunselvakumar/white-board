import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const UpdateBatchScheduleResponseModel = z.object(batchResponseFields);
export type UpdateBatchScheduleResponseModel = z.infer<
  typeof UpdateBatchScheduleResponseModel
>;
