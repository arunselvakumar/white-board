import { DomainError } from "./errors";

export class UserId {
  private constructor(readonly value: string) {}

  static create(raw: string): UserId {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError("USER_ID_REQUIRED", "User id is required.");
    }
    return new UserId(value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }
}
