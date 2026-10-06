import { z } from "zod";

export const DropTrainingInstituteStudentRequestModel = z.object({
  id: z.uuid(),
});

export type DropTrainingInstituteStudentRequestModel = z.infer<
  typeof DropTrainingInstituteStudentRequestModel
>;
