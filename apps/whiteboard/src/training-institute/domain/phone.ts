import { DomainError } from "./errors";

export class Phone {
  static readonly MAX_LENGTH = 32;

  private constructor(readonly value: string) {}

  static create(raw: string, requiredCode = "PHONE_REQUIRED"): Phone {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError(requiredCode, "Phone is required.");
    }
    if (value.length > Phone.MAX_LENGTH) {
      throw new DomainError(
        "PHONE_TOO_LONG",
        `Phone must be at most ${String(Phone.MAX_LENGTH)} characters.`,
      );
    }
    return new Phone(value);
  }

  static createOptional(raw: string | null | undefined): Phone | null {
    if (raw == null || raw.trim().length === 0) {
      return null;
    }
    return Phone.create(raw);
  }
}
