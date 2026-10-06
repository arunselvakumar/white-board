import { DomainError } from "./errors";

export class OptionalText {
  private constructor(readonly value: string) {}

  static create(
    raw: string | null | undefined,
    maxLength: number,
    tooLongCode: string,
    tooLongMessage: string,
  ): OptionalText | null {
    if (raw == null) {
      return null;
    }
    const value = raw.trim();
    if (value.length === 0) {
      return null;
    }
    if (value.length > maxLength) {
      throw new DomainError(tooLongCode, tooLongMessage);
    }
    return new OptionalText(value);
  }
}
