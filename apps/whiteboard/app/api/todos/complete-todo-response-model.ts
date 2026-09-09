import { z } from "zod";

import { todoResponseFields } from "./todo-response-fields";

export const CompleteTodoResponseModel = z.object(todoResponseFields);

export type CompleteTodoResponseModel = z.infer<
  typeof CompleteTodoResponseModel
>;
