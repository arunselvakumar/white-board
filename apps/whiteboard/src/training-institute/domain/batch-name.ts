import { DomainError } from "./errors";

export class BatchName {
  static readonly MAX_LENGTH = 200;

  private constructor(readonly value: string) {}

  static create(raw: string): BatchName {
    const value = raw.trim();
    if (value.length === 0) {
      throw new DomainError("BATCH_NAME_REQUIRED", "Batch name is required.");
    }
    if (value.length > BatchName.MAX_LENGTH) {
      throw new DomainError(
        "BATCH_NAME_TOO_LONG",
        `Batch name must be at most ${String(BatchName.MAX_LENGTH)} characters.`,
      );
    }
    return new BatchName(value);
  }
}
