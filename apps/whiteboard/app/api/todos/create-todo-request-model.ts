import { z } from "zod";

export const CreateTodoRequestModel = z.object({
  title: z.string().trim().min(1).max(200),
});

export type CreateTodoRequestModel = z.infer<typeof CreateTodoRequestModel>;
