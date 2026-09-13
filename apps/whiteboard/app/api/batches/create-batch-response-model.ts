import { z } from "zod";

import { batchResponseFields } from "./batch-response-fields";

export const CreateBatchResponseModel = z.object(batchResponseFields);
export type CreateBatchResponseModel = z.infer<typeof CreateBatchResponseModel>;
