import { z } from "zod";

import { todoResponseFields } from "./todo-response-fields";

export const ListTodoItemResponseModel = z.object(todoResponseFields);

export type ListTodoItemResponseModel = z.infer<
  typeof ListTodoItemResponseModel
>;
