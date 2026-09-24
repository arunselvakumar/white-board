import { z } from "zod";

export const UpdateBatchScheduleParamsModel = z.object({ id: z.uuid() });
export type UpdateBatchScheduleParamsModel = z.infer<
  typeof UpdateBatchScheduleParamsModel
>;
