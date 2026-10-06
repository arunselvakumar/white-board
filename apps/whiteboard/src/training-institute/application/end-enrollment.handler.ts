import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { EndEnrollmentCommand } from "./end-enrollment.command";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { EnrollmentNotFoundError } from "./not-found-error";

export class EndEnrollmentHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: EndEnrollmentCommand): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    enrollment.end(UserId.create(command.endedByUserId), new Date());
    await this.enrollments.save(enrollment);
    await this.events.dispatch(enrollment.pullDomainEvents());
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    return toEnrollmentReadModel(enrollment, paid);
  }
}
