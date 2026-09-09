import { z } from "zod";

export const CompleteTodoRequestModel = z.object({
  id: z.uuid(),
});

export type CompleteTodoRequestModel = z.infer<typeof CompleteTodoRequestModel>;
