import { DomainError } from "./errors";

export class EmailAddress {
  static readonly MAX_LENGTH = 320;

  private constructor(readonly value: string) {}

  static create(raw: string | null | undefined): EmailAddress | null {
    if (raw == null) {
      return null;
    }
    const value = raw.trim();
    if (value.length === 0) {
      return null;
    }
    if (value.length > EmailAddress.MAX_LENGTH || !value.includes("@")) {
      throw new DomainError("EMAIL_INVALID", "Email is invalid.");
    }
    return new EmailAddress(value);
  }
}
