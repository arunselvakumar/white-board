export type ListFeePaymentsQuery = {
  enrollmentId: string;
  workspaceId: string;
  limit: number;
  after?: string;
  before?: string;
};
