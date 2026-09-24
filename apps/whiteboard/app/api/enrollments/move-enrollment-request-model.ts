import { z } from "zod";

export const MoveEnrollmentRequestModel = z.object({
  batchId: z.uuid(),
});
export type MoveEnrollmentRequestModel = z.infer<
  typeof MoveEnrollmentRequestModel
>;
