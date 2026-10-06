export type ListBatchesQuery = {
  workspaceId: string;
  courseId?: string;
  limit: number;
  after?: string;
  before?: string;
};
