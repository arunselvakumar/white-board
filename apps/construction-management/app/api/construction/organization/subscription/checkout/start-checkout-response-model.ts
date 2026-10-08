import { z } from "zod";

import { quoteField } from "../subscription-fields";

export const StartConstructionOrganizationCheckoutResponseModel = z.object({
  orderId: z.uuid(),
  quote: quoteField,
  /** What the browser opens Razorpay Checkout with. */
  razorpay: z.object({
    keyId: z.string(),
    orderId: z.string(),
    amountPaise: z.number().int(),
    currency: z.string().length(3),
  }),
});

export type StartConstructionOrganizationCheckoutResponseModel = z.infer<
  typeof StartConstructionOrganizationCheckoutResponseModel
>;
