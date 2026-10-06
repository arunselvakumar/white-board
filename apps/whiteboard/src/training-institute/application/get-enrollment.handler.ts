import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { GetEnrollmentQuery } from "./get-enrollment.query";
import { EnrollmentNotFoundError } from "./not-found-error";

export class GetEnrollmentHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
  ) {}

  async execute(query: GetEnrollmentQuery): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(query.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    return toEnrollmentReadModel(enrollment, paid);
  }
}
