export type ListTodosQuery = {
  workspaceId: string;
  limit: number;
  after?: string;
  before?: string;
};
