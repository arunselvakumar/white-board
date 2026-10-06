import { z } from "zod";

export const EndTrainingInstituteEnrollmentRequestModel = z.object({
  id: z.uuid(),
});
export type EndTrainingInstituteEnrollmentRequestModel = z.infer<
  typeof EndTrainingInstituteEnrollmentRequestModel
>;
