export type ListEnrollmentsQuery = {
  workspaceId: string;
  studentId?: string;
  batchId?: string;
  limit: number;
  after?: string;
  before?: string;
};
