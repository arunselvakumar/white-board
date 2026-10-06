import { z } from "zod";

export const GetTrainingInstituteBatchRequestModel = z.object({ id: z.uuid() });
export type GetTrainingInstituteBatchRequestModel = z.infer<
  typeof GetTrainingInstituteBatchRequestModel
>;
