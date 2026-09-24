import { z } from "zod";

export const DropStudentRequestModel = z.object({
  id: z.uuid(),
});

export type DropStudentRequestModel = z.infer<typeof DropStudentRequestModel>;
