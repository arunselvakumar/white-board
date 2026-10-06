import { z } from "zod";

export const TrainingInstituteTeacherParamsModel = z.object({ id: z.uuid() });
