import { z } from "zod";

import { feePaymentResponseFields } from "../payments/fee-payment-response-fields";

export const RecordTrainingInstituteFeePaymentResponseModel = z.object(
  feePaymentResponseFields,
);
export type RecordTrainingInstituteFeePaymentResponseModel = z.infer<
  typeof RecordTrainingInstituteFeePaymentResponseModel
>;
