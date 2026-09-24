import type { Batch } from "../domain/batch";
import { BatchId } from "../domain/batch-id";
import type { BatchRepository } from "../domain/batch-repository";
import { CourseId } from "../domain/course-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toBatchReadModel,
  type BatchReadModel,
} from "./batch-read-model";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type { ListBatchesQuery } from "./list-batches.query";

export type ListBatchesReadModel = {
  items: BatchReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListBatchesHandler {
  constructor(
    private readonly batches: BatchRepository,
    private readonly enrollments?: EnrollmentRepository,
  ) {}

  async execute(query: ListBatchesQuery): Promise<ListBatchesReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => BatchId.create(id));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => BatchId.create(id));

    const page = await this.batches.listInWorkspace({
      workspaceId,
      courseId:
        query.courseId == null ? undefined : CourseId.create(query.courseId),
      limit: query.limit,
      after,
      before,
    });

    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    const enrolledCounts =
      this.enrollments == null
        ? new Map<string, number>()
        : await this.enrollments.countActiveByBatchIds(
            page.items.map((batch) => batch.id),
            workspaceId,
          );

    return {
      items: page.items.map((batch) =>
        toBatchReadModel(batch, enrolledCounts.get(batch.id.value) ?? 0),
      ),
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListBatchesQuery,
  hasMore: boolean,
  last: Batch | undefined,
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
  query: ListBatchesQuery,
  hasMore: boolean,
  first: Batch | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeListCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
