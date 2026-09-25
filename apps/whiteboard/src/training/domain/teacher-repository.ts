import type { ListCursor, ListPage } from "./list";
import type { Teacher } from "./teacher";

export type TeacherListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor<{ value: string }>;
  before?: ListCursor<{ value: string }>;
};

export type TeacherRepository = {
  create(teacher: Teacher): Promise<void>;
  save(teacher: Teacher): Promise<void>;
  findByIdInWorkspace(id: string, workspaceId: string): Promise<Teacher | null>;
  findByClerkUserInWorkspace(clerkUserId: string, workspaceId: string): Promise<Teacher | null>;
  listInWorkspace(params: TeacherListParams): Promise<ListPage<Teacher>>;
};
