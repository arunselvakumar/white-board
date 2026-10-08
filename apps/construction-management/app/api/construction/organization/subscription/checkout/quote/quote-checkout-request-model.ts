import { z } from "zod";

import { checkoutChoiceFields } from "../../subscription-fields";

export const QuoteConstructionOrganizationCheckoutRequestModel = z.object({
  ...checkoutChoiceFields,
  stateCode: z
    .string()
    .regex(/^\d{2}$/)
    .describe("Buyer's GST state code: CGST+SGST or IGST"),
});

export type QuoteConstructionOrganizationCheckoutRequestModel = z.infer<
  typeof QuoteConstructionOrganizationCheckoutRequestModel
>;
