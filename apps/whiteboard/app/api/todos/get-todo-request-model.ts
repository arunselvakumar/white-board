import { z } from "zod";

export const GetTodoRequestModel = z.object({
  id: z.uuid(),
});

export type GetTodoRequestModel = z.infer<typeof GetTodoRequestModel>;
