import { z } from "zod";

export const RecordTrainingInstituteFeePaymentRequestModel = z.object({
  amountPaise: z.number().int().min(1),
  method: z.enum(["cash", "upi", "card", "other"]),
  paidAt: z.iso.datetime().optional(),
});
export type RecordTrainingInstituteFeePaymentRequestModel = z.infer<
  typeof RecordTrainingInstituteFeePaymentRequestModel
>;
