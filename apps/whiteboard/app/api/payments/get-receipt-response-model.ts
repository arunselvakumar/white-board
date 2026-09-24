import { z } from "zod";

import { feePaymentResponseFields } from "./fee-payment-response-fields";

export const GetReceiptResponseModel = z.object(feePaymentResponseFields);
export type GetReceiptResponseModel = z.infer<typeof GetReceiptResponseModel>;
