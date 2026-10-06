import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const CreateTrainingInstituteBatchResponseModel =
  z.object(batchResponseFields);
export type CreateTrainingInstituteBatchResponseModel = z.infer<
  typeof CreateTrainingInstituteBatchResponseModel
>;
