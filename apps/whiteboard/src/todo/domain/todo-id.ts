import { DomainError } from "./errors";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TodoId {
  private constructor(readonly value: string) {}

  static create(raw: string): TodoId {
    if (!UUID_RE.test(raw)) {
      throw new DomainError("TODO_ID_INVALID", "Todo id must be a UUID.");
    }
    return new TodoId(raw.toLowerCase());
  }

  equals(other: TodoId): boolean {
    return this.value === other.value;
  }
}
