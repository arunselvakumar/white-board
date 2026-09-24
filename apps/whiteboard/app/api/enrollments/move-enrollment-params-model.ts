import { z } from "zod";

export const MoveEnrollmentParamsModel = z.object({ id: z.uuid() });
export type MoveEnrollmentParamsModel = z.infer<
  typeof MoveEnrollmentParamsModel
>;
