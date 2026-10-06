import type { FeePaymentReadModel } from "@/src/training-institute/application/fee-payment-read-model";

export function mapFeePaymentResponse(payment: FeePaymentReadModel) {
  return {
    id: payment.id,
    enrollmentId: payment.enrollmentId,
    amountPaise: payment.amountPaise,
    method: payment.method,
    paidAt: payment.paidAt.toISOString(),
    receiptNumber: payment.receiptNumber,
    recordedByUserId: payment.recordedByUserId,
    createdAt: payment.createdAt.toISOString(),
  };
}
