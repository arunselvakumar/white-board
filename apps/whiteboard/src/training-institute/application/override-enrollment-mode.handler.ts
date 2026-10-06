import { ClassMode } from "../domain/class-mode";
import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { EnrollmentNotFoundError } from "./not-found-error";
import type { OverrideEnrollmentModeCommand } from "./override-enrollment-mode.command";

export class OverrideEnrollmentModeHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(
    command: OverrideEnrollmentModeCommand,
  ): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    enrollment.overrideClassMode(
      command.classModeOverride == null
        ? null
        : ClassMode.create(command.classModeOverride),
      new Date(),
    );
    await this.enrollments.save(enrollment);
    await this.events.dispatch(enrollment.pullDomainEvents());
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    return toEnrollmentReadModel(enrollment, paid);
  }
}
