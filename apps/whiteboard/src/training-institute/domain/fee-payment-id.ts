import { parseUuid } from "./uuid";

export class FeePaymentId {
  private constructor(readonly value: string) {}

  static create(raw: string): FeePaymentId {
    return new FeePaymentId(
      parseUuid(
        raw,
        "FEE_PAYMENT_ID_INVALID",
        "Fee Payment id must be a UUID.",
      ),
    );
  }

  equals(other: FeePaymentId): boolean {
    return this.value === other.value;
  }
}
