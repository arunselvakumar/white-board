import { z } from "zod";

import { vendorWriteFields } from "../../vendor-models";

export const UpdateConstructionLabourVendorRequestModel = z.object({
  ...vendorWriteFields,
  /** The `updatedAt` the form was loaded with; 409 `VENDOR_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export type UpdateConstructionLabourVendorRequestModel = z.input<
  typeof UpdateConstructionLabourVendorRequestModel
>;
