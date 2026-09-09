import { z } from "zod";

import { todoResponseFields } from "./todo-response-fields";

export const GetTodoResponseModel = z.object(todoResponseFields);

export type GetTodoResponseModel = z.infer<typeof GetTodoResponseModel>;
