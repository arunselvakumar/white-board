import { z } from "zod";

export const GetBatchRequestModel = z.object({ id: z.uuid() });
export type GetBatchRequestModel = z.infer<typeof GetBatchRequestModel>;
