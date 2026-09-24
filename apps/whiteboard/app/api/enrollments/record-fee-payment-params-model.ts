import { z } from "zod";

export const RecordFeePaymentParamsModel = z.object({ id: z.uuid() });
export type RecordFeePaymentParamsModel = z.infer<
  typeof RecordFeePaymentParamsModel
>;
