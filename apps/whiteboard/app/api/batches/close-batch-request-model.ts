import { z } from "zod";

export const CloseBatchRequestModel = z.object({ id: z.uuid() });
export type CloseBatchRequestModel = z.infer<typeof CloseBatchRequestModel>;
