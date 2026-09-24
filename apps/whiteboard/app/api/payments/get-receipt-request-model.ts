import { z } from "zod";

export const GetReceiptRequestModel = z.object({ id: z.uuid() });
export type GetReceiptRequestModel = z.infer<typeof GetReceiptRequestModel>;
