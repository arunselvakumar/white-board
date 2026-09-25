import { z } from "zod";

export const TeacherParamsModel = z.object({ id: z.uuid() });
