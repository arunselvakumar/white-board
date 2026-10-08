import { z } from "zod";

/** The three fields Razorpay Checkout hands its success handler. */
export const VerifyConstructionOrganizationCheckoutRequestModel = z.object({
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(128),
});

export type VerifyConstructionOrganizationCheckoutRequestModel = z.infer<
  typeof VerifyConstructionOrganizationCheckoutRequestModel
>;
