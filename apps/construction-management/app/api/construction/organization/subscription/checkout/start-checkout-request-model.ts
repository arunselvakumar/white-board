import { z } from "zod";

import {
  billingAddressField,
  checkoutChoiceFields,
} from "../subscription-fields";

export const StartConstructionOrganizationCheckoutRequestModel = z.object({
  ...checkoutChoiceFields,
  billingAddress: billingAddressField,
});

export type StartConstructionOrganizationCheckoutRequestModel = z.infer<
  typeof StartConstructionOrganizationCheckoutRequestModel
>;
