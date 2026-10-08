import type { z } from "zod";

import { quoteField } from "../../subscription-fields";

/** The Order Summary: Rate, Amount, Sub Total, Last Plan Discount, GST, Total. */
export const QuoteConstructionOrganizationCheckoutResponseModel = quoteField;

export type QuoteConstructionOrganizationCheckoutResponseModel = z.infer<
  typeof QuoteConstructionOrganizationCheckoutResponseModel
>;
