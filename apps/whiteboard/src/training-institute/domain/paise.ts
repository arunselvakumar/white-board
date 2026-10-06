import { DomainError } from "./errors";

export class Paise {
  private constructor(readonly value: number) {}

  static create(raw: number): Paise {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new DomainError(
        "PAISE_INVALID",
        "Amount must be an integer of at least 0 paise.",
      );
    }
    return new Paise(raw);
  }
}
