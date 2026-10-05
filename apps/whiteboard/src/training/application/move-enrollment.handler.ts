import { BatchId } from "../domain/batch-id";
import type { BatchRepository } from "../domain/batch-repository";
import { DomainError } from "../domain/errors";
import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { BatchNotFoundError, EnrollmentNotFoundError } from "./not-found-error";
import type { MoveEnrollmentCommand } from "./move-enrollment.command";

export class MoveEnrollmentHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly batches: BatchRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: MoveEnrollmentCommand): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const batch = await this.batches.findByIdInWorkspace(
      BatchId.create(command.batchId),
      workspaceId,
    );
    if (batch == null) {
      throw new BatchNotFoundError();
    }
    if (!batch.id.equals(enrollment.batchId)) {
      const existing = await this.enrollments.findActiveByStudentAndBatch(
        enrollment.studentId,
        batch.id,
        workspaceId,
      );
      if (existing != null) {
        throw new DomainError(
          "STUDENT_ALREADY_ENROLLED",
          "This Student is already in that Batch.",
        );
      }
    }
    enrollment.moveTo(batch, new Date());
    await this.enrollments.saveGuardingCapacity(
      enrollment,
      batch.capacity.value,
    );
    await this.events.dispatch(enrollment.pullDomainEvents());
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    return toEnrollmentReadModel(enrollment, paid);
  }
}
