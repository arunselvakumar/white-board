import { z } from "zod";

export const ListFeePaymentsParamsModel = z.object({ id: z.uuid() });
export type ListFeePaymentsParamsModel = z.infer<
  typeof ListFeePaymentsParamsModel
>;
