import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const CloseBatchResponseModel = z.object(batchResponseFields);
export type CloseBatchResponseModel = z.infer<typeof CloseBatchResponseModel>;
