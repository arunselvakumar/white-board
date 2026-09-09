import { prisma, type PrismaClient } from "@repo/db";

import { CompleteTodoHandler } from "../application/complete-todo.handler";
import { CreateTodoHandler } from "../application/create-todo.handler";
import { DeleteTodoHandler } from "../application/delete-todo.handler";
import type { EventDispatcher } from "../application/event-dispatcher";
import { GetTodoHandler } from "../application/get-todo.handler";
import { ListTodosHandler } from "../application/list-todos.handler";
import { InProcessEventDispatcher } from "./in-process-event-dispatcher";
import { PrismaTodoRepository } from "./prisma-todo-repository";

export type TodoHandlers = {
  create: CreateTodoHandler;
  complete: CompleteTodoHandler;
  delete: DeleteTodoHandler;
  get: GetTodoHandler;
  list: ListTodosHandler;
};

export function createTodoHandlers(deps?: {
  prisma?: PrismaClient;
  events?: EventDispatcher;
}): TodoHandlers {
  const repository = new PrismaTodoRepository(deps?.prisma ?? prisma);
  const events = deps?.events ?? new InProcessEventDispatcher();
  return {
    create: new CreateTodoHandler(repository, events),
    complete: new CompleteTodoHandler(repository, events),
    delete: new DeleteTodoHandler(repository, events),
    get: new GetTodoHandler(repository),
    list: new ListTodosHandler(repository),
  };
}
