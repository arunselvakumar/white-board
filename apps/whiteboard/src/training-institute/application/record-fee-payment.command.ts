export type RecordFeePaymentCommand = {
  enrollmentId: string;
  amountPaise: number;
  method: string;
  paidAt?: string;
  workspaceId: string;
  recordedByUserId: string;
};
