import { z } from "zod";

export const MoveTrainingInstituteEnrollmentRequestModel = z.object({
  batchId: z.uuid(),
});
export type MoveTrainingInstituteEnrollmentRequestModel = z.infer<
  typeof MoveTrainingInstituteEnrollmentRequestModel
>;
