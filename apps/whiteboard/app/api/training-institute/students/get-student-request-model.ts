import { z } from "zod";

export const GetTrainingInstituteStudentRequestModel = z.object({
  id: z.uuid(),
});

export type GetTrainingInstituteStudentRequestModel = z.infer<
  typeof GetTrainingInstituteStudentRequestModel
>;
