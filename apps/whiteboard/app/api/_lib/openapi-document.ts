import { StatusCodes } from "http-status-codes";

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
    successStatus: StatusCodes.CREATED,
    successDescription: "Created",
    successSchema: CreateTodoResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/todos",
    summary: "List todos in the active workspace",
    tags: ["Todos"],
    query: ListTodosRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Listed",
    successSchema: ListTodosResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "get",
    path: "/api/todos/{id}",
    summary: "Get a todo",
    tags: ["Todos"],
    params: GetTodoRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Found",
    successSchema: GetTodoResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "delete",
    path: "/api/todos/{id}",
    summary: "Soft-delete a todo",
    tags: ["Todos"],
    params: DeleteTodoRequestModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
  {
    method: "post",
    path: "/api/todos/{id}/complete",
    summary: "Complete a todo",
    tags: ["Todos"],
    params: CompleteTodoRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Completed",
    successSchema: CompleteTodoResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.INTERNAL_SERVER_ERROR,
    ],
  },
]);
