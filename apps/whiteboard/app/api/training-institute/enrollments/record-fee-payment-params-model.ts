import { z } from "zod";

export const RecordTrainingInstituteFeePaymentParamsModel = z.object({
  id: z.uuid(),
});
export type RecordTrainingInstituteFeePaymentParamsModel = z.infer<
  typeof RecordTrainingInstituteFeePaymentParamsModel
>;
