import { z } from "zod";

export const ListTrainingInstituteFeePaymentsParamsModel = z.object({
  id: z.uuid(),
});
export type ListTrainingInstituteFeePaymentsParamsModel = z.infer<
  typeof ListTrainingInstituteFeePaymentsParamsModel
>;
