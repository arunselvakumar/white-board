import { DomainError } from "./errors";

const RECEIPT_RE = /^R-\d{4,}$/;

export class ReceiptNumber {
  private constructor(readonly value: string) {}

  static create(raw: string): ReceiptNumber {
    const value = raw.trim();
    if (!RECEIPT_RE.test(value)) {
      throw new DomainError(
        "RECEIPT_NUMBER_INVALID",
        "Receipt number must look like R-0001.",
      );
    }
    return new ReceiptNumber(value);
  }

  static fromSequence(sequence: number): ReceiptNumber {
    if (!Number.isInteger(sequence) || sequence < 1) {
      throw new DomainError(
        "RECEIPT_NUMBER_INVALID",
        "Receipt sequence must be an integer of at least 1.",
      );
    }
    return new ReceiptNumber(`R-${String(sequence).padStart(4, "0")}`);
  }
}
