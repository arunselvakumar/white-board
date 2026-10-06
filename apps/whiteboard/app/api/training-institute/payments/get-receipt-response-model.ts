import { z } from "zod";

import { feePaymentResponseFields } from "./fee-payment-response-fields";

export const GetTrainingInstituteReceiptResponseModel = z.object(
  feePaymentResponseFields,
);
export type GetTrainingInstituteReceiptResponseModel = z.infer<
  typeof GetTrainingInstituteReceiptResponseModel
>;
