import { z } from "zod";

export const GetTrainingInstituteEnrollmentRequestModel = z.object({
  id: z.uuid(),
});
export type GetTrainingInstituteEnrollmentRequestModel = z.infer<
  typeof GetTrainingInstituteEnrollmentRequestModel
>;
