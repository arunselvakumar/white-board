import type { EnrollmentId } from "./enrollment-id";
import type { FeePayment } from "./fee-payment";
import type { FeePaymentId } from "./fee-payment-id";
import type { ListPage, ListParams } from "./list";
import type { WorkspaceId } from "./workspace-id";

export type FeePaymentListParams = ListParams<FeePaymentId> & {
  enrollmentId?: EnrollmentId;
};

export type FeePaymentRepository = {
  save(payment: FeePayment): Promise<void>;
  findByIdInWorkspace(
    id: FeePaymentId,
    workspaceId: WorkspaceId,
  ): Promise<FeePayment | null>;
  listInWorkspace(params: FeePaymentListParams): Promise<ListPage<FeePayment>>;
  nextReceiptSequence(workspaceId: WorkspaceId): Promise<number>;
  sumAmountPaiseForEnrollment(
    enrollmentId: EnrollmentId,
    workspaceId: WorkspaceId,
  ): Promise<number>;
};
