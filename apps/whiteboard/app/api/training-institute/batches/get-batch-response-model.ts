import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const GetTrainingInstituteBatchResponseModel =
  z.object(batchResponseFields);
export type GetTrainingInstituteBatchResponseModel = z.infer<
  typeof GetTrainingInstituteBatchResponseModel
>;
