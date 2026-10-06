import type { FeePayment } from "../domain/fee-payment";

export type FeePaymentReadModel = {
  id: string;
  enrollmentId: string;
  amountPaise: number;
  method: string;
  paidAt: Date;
  receiptNumber: string;
  recordedByUserId: string;
  createdAt: Date;
};

export function toFeePaymentReadModel(
  payment: FeePayment,
): FeePaymentReadModel {
  return {
    id: payment.id.value,
    enrollmentId: payment.enrollmentId.value,
    amountPaise: payment.amount.value,
    method: payment.method.value,
    paidAt: payment.paidAt,
    receiptNumber: payment.receiptNumber.value,
    recordedByUserId: payment.recordedByUserId.value,
    createdAt: payment.createdAt,
  };
}
