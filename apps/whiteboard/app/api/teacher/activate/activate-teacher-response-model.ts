import { z } from "zod";

export const ActivateTeacherResponseModel = z.object({ teacherId: z.uuid() });
