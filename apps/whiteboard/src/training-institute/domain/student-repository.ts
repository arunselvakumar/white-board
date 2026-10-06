import type { ListPage, ListParams } from "./list";
import type { Student } from "./student";
import type { StudentId } from "./student-id";
import type { WorkspaceId } from "./workspace-id";

export type StudentListParams = ListParams<StudentId> & {
  q?: string;
};

export type StudentRepository = {
  create(student: Student): Promise<boolean>;
  save(student: Student): Promise<void>;
  findByIdInWorkspace(
    id: StudentId,
    workspaceId: WorkspaceId,
  ): Promise<Student | null>;
  listInWorkspace(params: StudentListParams): Promise<ListPage<Student>>;
};
