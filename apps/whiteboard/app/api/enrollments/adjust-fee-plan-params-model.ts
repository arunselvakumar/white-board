import { z } from "zod";

export const AdjustFeePlanParamsModel = z.object({ id: z.uuid() });
export type AdjustFeePlanParamsModel = z.infer<typeof AdjustFeePlanParamsModel>;
