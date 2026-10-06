import type { WorkspaceId } from "./workspace-id";

export type ListCursor<TId> = {
  createdAt: Date;
  id: TId;
};

export type ListParams<TId> = {
  workspaceId: WorkspaceId;
  limit: number;
  after?: ListCursor<TId>;
  before?: ListCursor<TId>;
};

export type ListPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};
