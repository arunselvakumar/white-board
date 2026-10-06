import { DomainError } from "./errors";

export const FEE_PAYMENT_METHODS = ["cash", "upi", "card", "other"] as const;

export type FeePaymentMethodValue = (typeof FEE_PAYMENT_METHODS)[number];

export class FeePaymentMethod {
  private constructor(readonly value: FeePaymentMethodValue) {}

  static create(raw: string): FeePaymentMethod {
    if (!FEE_PAYMENT_METHODS.includes(raw as FeePaymentMethodValue)) {
      throw new DomainError(
        "FEE_PAYMENT_METHOD_INVALID",
        "Fee Payment method must be Cash, UPI, Card, or Other.",
      );
    }
    return new FeePaymentMethod(raw as FeePaymentMethodValue);
  }
}
