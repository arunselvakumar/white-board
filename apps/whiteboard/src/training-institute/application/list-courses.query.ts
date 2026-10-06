export type ListCoursesQuery = {
  workspaceId: string;
  limit: number;
  after?: string;
  before?: string;
};
