import { z } from "zod";

import { ListTodoItemResponseModel } from "./list-todo-item-response-model";

export const ListTodosResponseModel = z.object({
  items: z.array(ListTodoItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListTodosResponseModel = z.infer<typeof ListTodosResponseModel>;
