import { z } from "zod";

export const CloseTrainingInstituteBatchRequestModel = z.object({
  id: z.uuid(),
});
export type CloseTrainingInstituteBatchRequestModel = z.infer<
  typeof CloseTrainingInstituteBatchRequestModel
>;
