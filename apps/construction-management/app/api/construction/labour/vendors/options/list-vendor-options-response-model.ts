import { z } from "zod";

import { ConstructionLabourVendorOptionResponseModel } from "../vendor-models";

export const ListConstructionLabourVendorOptionsResponseModel = z.object({
  items: z.array(ConstructionLabourVendorOptionResponseModel),
});

export type ListConstructionLabourVendorOptionsResponseModel = z.infer<
  typeof ListConstructionLabourVendorOptionsResponseModel
>;
