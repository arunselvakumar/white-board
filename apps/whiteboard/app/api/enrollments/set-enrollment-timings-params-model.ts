import { z } from "zod";

export const SetEnrollmentTimingsParamsModel = z.object({ id: z.uuid() });
export type SetEnrollmentTimingsParamsModel = z.infer<
  typeof SetEnrollmentTimingsParamsModel
>;
