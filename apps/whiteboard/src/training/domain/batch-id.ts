import { parseUuid } from "./uuid";

export class BatchId {
  private constructor(readonly value: string) {}

  static create(raw: string): BatchId {
    return new BatchId(
      parseUuid(raw, "BATCH_ID_INVALID", "Batch id must be a UUID."),
    );
  }

  equals(other: BatchId): boolean {
    return this.value === other.value;
  }
}
