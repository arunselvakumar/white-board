import type { Course } from "./course";
import type { CourseId } from "./course-id";
import type { ListPage, ListParams } from "./list";
import type { WorkspaceId } from "./workspace-id";

export type CourseListParams = ListParams<CourseId>;

export type CourseRepository = {
  save(course: Course): Promise<void>;
  findByIdInWorkspace(
    id: CourseId,
    workspaceId: WorkspaceId,
  ): Promise<Course | null>;
  listInWorkspace(params: CourseListParams): Promise<ListPage<Course>>;
};
