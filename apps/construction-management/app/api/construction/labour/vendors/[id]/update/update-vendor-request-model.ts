import { z } from "zod";

import { vendorWriteFields } from "../../vendor-models";

export const UpdateConstructionLabourVendorRequestModel = z.object({
  ...vendorWriteFields,
  /**
   * Left out keeps the vendor's Projects: they are put on a Project from
   * the Project's Resources. Sent, it replaces them.
   */
  projectIds: z.array(z.uuid()).max(500).optional(),
  /** The `updatedAt` the form was loaded with; 409 `VENDOR_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export type UpdateConstructionLabourVendorRequestModel = z.input<
  typeof UpdateConstructionLabourVendorRequestModel
>;
