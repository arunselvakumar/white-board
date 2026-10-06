import { z } from "zod";

import { feePaymentResponseFields } from "../payments/fee-payment-response-fields";

export const ListTrainingInstituteFeePaymentsResponseModel = z.object({
  items: z.array(z.object(feePaymentResponseFields)),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListTrainingInstituteFeePaymentsResponseModel = z.infer<
  typeof ListTrainingInstituteFeePaymentsResponseModel
>;
