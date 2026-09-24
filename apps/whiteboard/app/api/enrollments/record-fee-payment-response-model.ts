import { z } from "zod";

import { feePaymentResponseFields } from "../payments/fee-payment-response-fields";

export const RecordFeePaymentResponseModel = z.object(feePaymentResponseFields);
export type RecordFeePaymentResponseModel = z.infer<
  typeof RecordFeePaymentResponseModel
>;
