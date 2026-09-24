import type { Course } from "../domain/course";
import { CourseId } from "../domain/course-id";
import type { CourseRepository } from "../domain/course-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toCourseReadModel,
  type CourseReadModel,
} from "./course-read-model";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type { ListCoursesQuery } from "./list-courses.query";

export type ListCoursesReadModel = {
  items: CourseReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListCoursesHandler {
  constructor(private readonly courses: CourseRepository) {}

  async execute(query: ListCoursesQuery): Promise<ListCoursesReadModel> {
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => CourseId.create(id));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => CourseId.create(id));

    const page = await this.courses.listInWorkspace({
      workspaceId: WorkspaceId.create(query.workspaceId),
      limit: query.limit,
      after,
      before,
    });

    const first = page.items[0];
    const last = page.items[page.items.length - 1];

    return {
      items: page.items.map(toCourseReadModel),
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListCoursesQuery,
  hasMore: boolean,
  last: Course | undefined,
): string | null {
  if (last == null) {
    return null;
  }
  if (query.before != null || hasMore) {
    return encodeListCursor({ createdAt: last.createdAt, id: last.id });
  }
  return null;
}

function prevCursorFor(
  query: ListCoursesQuery,
  hasMore: boolean,
  first: Course | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeListCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
