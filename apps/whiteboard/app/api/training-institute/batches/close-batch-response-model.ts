import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const CloseTrainingInstituteBatchResponseModel =
  z.object(batchResponseFields);
export type CloseTrainingInstituteBatchResponseModel = z.infer<
  typeof CloseTrainingInstituteBatchResponseModel
>;
