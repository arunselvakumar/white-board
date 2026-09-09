import { z } from "zod";

import { todoResponseFields } from "./todo-response-fields";

export const CreateTodoResponseModel = z.object(todoResponseFields);

export type CreateTodoResponseModel = z.infer<typeof CreateTodoResponseModel>;
