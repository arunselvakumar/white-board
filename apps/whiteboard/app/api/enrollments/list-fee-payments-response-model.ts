import { z } from "zod";

import { feePaymentResponseFields } from "../payments/fee-payment-response-fields";

export const ListFeePaymentsResponseModel = z.object({
  items: z.array(z.object(feePaymentResponseFields)),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListFeePaymentsResponseModel = z.infer<
  typeof ListFeePaymentsResponseModel
>;
