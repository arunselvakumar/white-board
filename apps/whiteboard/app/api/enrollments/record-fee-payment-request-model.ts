import { z } from "zod";

export const RecordFeePaymentRequestModel = z.object({
  amountPaise: z.number().int().min(1),
  method: z.enum(["cash", "upi", "card", "other"]),
  paidAt: z.iso.datetime().optional(),
});
export type RecordFeePaymentRequestModel = z.infer<
  typeof RecordFeePaymentRequestModel
>;
