import { z } from "zod";

export const MoveTrainingInstituteEnrollmentParamsModel = z.object({
  id: z.uuid(),
});
export type MoveTrainingInstituteEnrollmentParamsModel = z.infer<
  typeof MoveTrainingInstituteEnrollmentParamsModel
>;
