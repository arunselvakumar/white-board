import type { ListCursor, ListPage } from "./list";
import type { Teacher } from "./teacher";

export type TeacherListParams = {
  workspaceId: string;
  limit: number;
  after?: ListCursor<{ value: string }>;
  before?: ListCursor<{ value: string }>;
};

export type TeacherRepository = {
  create(teacher: Teacher, changes?: TeacherPersistenceChanges): Promise<void>;
  save(teacher: Teacher, changes?: TeacherPersistenceChanges): Promise<void>;
  findByIdInWorkspace(id: string, workspaceId: string): Promise<Teacher | null>;
  findPhotoByIdInWorkspace(
    id: string,
    workspaceId: string,
  ): Promise<{ mimeType: string; bytes: Uint8Array } | null>;
  findByClerkUserInWorkspace(
    clerkUserId: string,
    workspaceId: string,
  ): Promise<Teacher | null>;
  listInWorkspace(params: TeacherListParams): Promise<ListPage<Teacher>>;
};

export type TeacherPersistenceChanges = {
  photoData?: Uint8Array;
  idNumber?: string | null;
  bankAccountNumber?: string | null;
};
