import { DomainError } from "./errors";

export class Capacity {
  private constructor(readonly value: number) {}

  static create(raw: number): Capacity {
    if (!Number.isInteger(raw) || raw < 1) {
      throw new DomainError(
        "CAPACITY_INVALID",
        "Capacity must be an integer of at least 1.",
      );
    }
    return new Capacity(raw);
  }
}
