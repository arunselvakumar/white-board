import { z } from "zod";

export const ActivateTrainingInstituteTeacherResponseModel = z.object({
  teacherId: z.uuid(),
});
