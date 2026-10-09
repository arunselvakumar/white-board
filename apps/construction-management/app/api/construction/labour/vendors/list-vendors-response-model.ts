import { z } from "zod";

import { ConstructionLabourVendorSummaryResponseModel } from "./vendor-models";

export const ListConstructionLabourVendorsResponseModel = z.object({
  items: z.array(ConstructionLabourVendorSummaryResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});

export type ListConstructionLabourVendorsResponseModel = z.infer<
  typeof ListConstructionLabourVendorsResponseModel
>;
