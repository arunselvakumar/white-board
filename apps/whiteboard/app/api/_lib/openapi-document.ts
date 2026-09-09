import { buildOpenApiDocument } from "./openapi";
import { CompleteTodoRequestModel } from "../todos/complete-todo-request-model";
import { CompleteTodoResponseModel } from "../todos/complete-todo-response-model";
import { CreateTodoRequestModel } from "../todos/create-todo-request-model";
import { CreateTodoResponseModel } from "../todos/create-todo-response-model";
import { DeleteTodoRequestModel } from "../todos/delete-todo-request-model";
import { GetTodoRequestModel } from "../todos/get-todo-request-model";
import { GetTodoResponseModel } from "../todos/get-todo-response-model";
import { ListTodosRequestModel } from "../todos/list-todos-request-model";
import { ListTodosResponseModel } from "../todos/list-todos-response-model";

export const openApiDocument = buildOpenApiDocument([
  {
    method: "post",
    path: "/api/todos",
    summary: "Create a todo",
    tags: ["Todos"],
    body: CreateTodoRequestModel,
    successStatus: 201,
    successDescription: "Created",
    successSchema: CreateTodoResponseModel,
    errors: [400, 401, 403, 500],
  },
  {
    method: "get",
    path: "/api/todos",
    summary: "List todos in the active workspace",
    tags: ["Todos"],
    query: ListTodosRequestModel,
    successStatus: 200,
    successDescription: "Listed",
    successSchema: ListTodosResponseModel,
    errors: [400, 401, 403, 500],
  },
  {
    method: "get",
    path: "/api/todos/{id}",
    summary: "Get a todo",
    tags: ["Todos"],
    params: GetTodoRequestModel,
    successStatus: 200,
    successDescription: "Found",
    successSchema: GetTodoResponseModel,
    errors: [400, 401, 403, 404, 500],
  },
  {
    method: "delete",
    path: "/api/todos/{id}",
    summary: "Soft-delete a todo",
    tags: ["Todos"],
    params: DeleteTodoRequestModel,
    successStatus: 204,
    successDescription: "Deleted",
    errors: [400, 401, 403, 404, 500],
  },
  {
    method: "post",
    path: "/api/todos/{id}/complete",
    summary: "Complete a todo",
    tags: ["Todos"],
    params: CompleteTodoRequestModel,
    successStatus: 200,
    successDescription: "Completed",
    successSchema: CompleteTodoResponseModel,
    errors: [400, 401, 403, 404, 409, 500],
  },
]);
