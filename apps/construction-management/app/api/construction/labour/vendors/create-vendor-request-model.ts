import { z } from "zod";

import { vendorWriteFields } from "./vendor-models";

export const CreateConstructionLabourVendorRequestModel =
  z.object(vendorWriteFields);

export type CreateConstructionLabourVendorRequestModel = z.input<
  typeof CreateConstructionLabourVendorRequestModel
>;
