import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePayment } from "../domain/fee-payment";
import { FeePaymentId } from "../domain/fee-payment-id";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toFeePaymentReadModel,
  type FeePaymentReadModel,
} from "./fee-payment-read-model";
import { decodeListCursor, encodeListCursor } from "./list-cursor";
import type { ListFeePaymentsQuery } from "./list-fee-payments.query";
import { EnrollmentNotFoundError } from "./not-found-error";

export type ListFeePaymentsReadModel = {
  items: FeePaymentReadModel[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

export class ListFeePaymentsHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
  ) {}

  async execute(
    query: ListFeePaymentsQuery,
  ): Promise<ListFeePaymentsReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(query.enrollmentId),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => FeePaymentId.create(id));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => FeePaymentId.create(id));
    const page = await this.payments.listInWorkspace({
      workspaceId,
      enrollmentId: enrollment.id,
      limit: query.limit,
      after,
      before,
    });
    const first = page.items[0];
    const last = page.items[page.items.length - 1];
    return {
      items: page.items.map(toFeePaymentReadModel),
      nextCursor: nextCursorFor(query, page.hasMore, last),
      prevCursor: prevCursorFor(query, page.hasMore, first),
      total: page.total,
    };
  }
}

function nextCursorFor(
  query: ListFeePaymentsQuery,
  hasMore: boolean,
  last: FeePayment | undefined,
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
  query: ListFeePaymentsQuery,
  hasMore: boolean,
  first: FeePayment | undefined,
): string | null {
  if (first == null) {
    return null;
  }
  if (query.after != null || (query.before != null && hasMore)) {
    return encodeListCursor({ createdAt: first.createdAt, id: first.id });
  }
  return null;
}
