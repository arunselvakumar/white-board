import { z } from "zod";

export const DeleteTodoRequestModel = z.object({
  id: z.uuid(),
});

export type DeleteTodoRequestModel = z.infer<typeof DeleteTodoRequestModel>;
