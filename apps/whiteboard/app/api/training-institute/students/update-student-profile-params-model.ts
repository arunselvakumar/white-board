import { z } from "zod";

export const UpdateTrainingInstituteStudentProfileParamsModel = z.object({
  id: z.uuid(),
});

export type UpdateTrainingInstituteStudentProfileParamsModel = z.infer<
  typeof UpdateTrainingInstituteStudentProfileParamsModel
>;
