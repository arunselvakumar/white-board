import type { TrainingInstituteFeePayment as FeePaymentRecord } from "@repo/whiteboard-db";

import { EnrollmentId } from "../domain/enrollment-id";
import { FeePayment } from "../domain/fee-payment";
import { FeePaymentId } from "../domain/fee-payment-id";
import { FeePaymentMethod } from "../domain/fee-payment-method";
import { Paise } from "../domain/paise";
import { ReceiptNumber } from "../domain/receipt-number";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainFeePayment(row: FeePaymentRecord): FeePayment {
  return FeePayment.reconstitute({
    id: FeePaymentId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    enrollmentId: EnrollmentId.create(row.enrollmentId),
    recordedByUserId: UserId.create(row.recordedByUserId),
    amount: Paise.create(row.amountPaise),
    method: FeePaymentMethod.create(row.method),
    paidAt: row.paidAt,
    receiptNumber: ReceiptNumber.create(row.receiptNumber),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
