import type { Student } from "../domain/student";
import { StudentId } from "../domain/student-id";
import type { StudentRepository } from "../domain/student-repository";
import { WorkspaceId } from "../domain/workspace-id";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type { ListStudentsQuery } from "./list-students.query";
import {
  toStudentReadModel,
  type StudentReadModel,
} from "./student-read-model";

export type ListStudentsReadModel = {
  items: StudentReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListStudentsHandler {
  constructor(private readonly students: StudentRepository) {}

  async execute(query: ListStudentsQuery): Promise<ListStudentsReadModel> {
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => StudentId.create(id));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => StudentId.create(id));

    const page = await this.students.listInWorkspace({
      workspaceId: WorkspaceId.create(query.workspaceId),
      limit: query.limit,
      q: query.q,
      after,
      before,
    });

    const first = page.items[0];
    const last = page.items[page.items.length - 1];

    return {
      items: page.items.map((student) => toStudentReadModel(student)),
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListStudentsQuery,
  hasMore: boolean,
  last: Student | undefined,
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
  query: ListStudentsQuery,
  hasMore: boolean,
  first: Student | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeListCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
