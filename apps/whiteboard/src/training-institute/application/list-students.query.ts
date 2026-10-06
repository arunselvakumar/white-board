export type ListStudentsQuery = {
  workspaceId: string;
  limit: number;
  q?: string;
  after?: string;
  before?: string;
};
