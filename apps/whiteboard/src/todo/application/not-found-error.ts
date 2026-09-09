export class TodoNotFoundError extends Error {
  readonly code = "TODO_NOT_FOUND";

  constructor() {
    super("Todo not found.");
    this.name = "TodoNotFoundError";
  }
}
