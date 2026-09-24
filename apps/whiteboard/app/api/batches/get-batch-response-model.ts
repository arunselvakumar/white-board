import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const GetBatchResponseModel = z.object(batchResponseFields);
export type GetBatchResponseModel = z.infer<typeof GetBatchResponseModel>;
