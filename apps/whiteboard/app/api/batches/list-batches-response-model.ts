import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const ListBatchesResponseModel = z.object({
  items: z.array(z.object(batchResponseFields)),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListBatchesResponseModel = z.infer<typeof ListBatchesResponseModel>;
