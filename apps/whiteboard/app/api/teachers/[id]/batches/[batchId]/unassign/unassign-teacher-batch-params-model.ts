import { z } from "zod";

export const UnassignTeacherBatchParamsModel = z.object({ id: z.uuid(), batchId: z.uuid() });
