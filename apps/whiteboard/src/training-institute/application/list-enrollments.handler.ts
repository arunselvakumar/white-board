import { BatchId } from "../domain/batch-id";
import type { Enrollment } from "../domain/enrollment";
import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { StudentId } from "../domain/student-id";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type { ListEnrollmentsQuery } from "./list-enrollments.query";

export type ListEnrollmentsReadModel = {
  items: EnrollmentReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListEnrollmentsHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
  ) {}

  async execute(
    query: ListEnrollmentsQuery,
  ): Promise<ListEnrollmentsReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => EnrollmentId.create(id));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => EnrollmentId.create(id));
    const page = await this.enrollments.listInWorkspace({
      workspaceId,
      studentId:
        query.studentId == null ? undefined : StudentId.create(query.studentId),
      batchId:
        query.batchId == null ? undefined : BatchId.create(query.batchId),
      limit: query.limit,
      after,
      before,
    });
    const items = await Promise.all(
      page.items.map(async (enrollment) => {
        const paid = await this.payments.sumAmountPaiseForEnrollment(
          enrollment.id,
          workspaceId,
        );
        return toEnrollmentReadModel(enrollment, paid);
      }),
    );
    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    return {
      items,
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListEnrollmentsQuery,
  hasMore: boolean,
  last: Enrollment | undefined,
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
  query: ListEnrollmentsQuery,
  hasMore: boolean,
  first: Enrollment | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeListCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
