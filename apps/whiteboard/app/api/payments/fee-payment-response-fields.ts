import { z } from "zod";

export const feePaymentResponseFields = {
  id: z.uuid(),
  enrollmentId: z.uuid(),
  amountPaise: z.number().int(),
  method: z.enum(["cash", "upi", "card", "other"]),
  paidAt: z.iso.datetime(),
  receiptNumber: z.string(),
  recordedByUserId: z.string(),
  createdAt: z.iso.datetime(),
};
