import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { TimingSource } from "../domain/timing-source";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import type { MovedClassGuard } from "./moved-class-guard";
import { EnrollmentNotFoundError } from "./not-found-error";
import type { SetEnrollmentTimingsCommand } from "./set-enrollment-timings.command";

export class SetEnrollmentTimingsHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
    private readonly movedClasses: MovedClassGuard,
  ) {}

  async execute(
    command: SetEnrollmentTimingsCommand,
  ): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const timingSource = TimingSource.create(command.timingSource);
    const studentTimings = timingSource.inheritsBatch
      ? null
      : WeeklyTimings.create(command.studentTimings);
    enrollment.setTimings(timingSource, studentTimings, new Date());
    await this.movedClasses.assertTimingsKeepMovedClasses({
      workspaceId: command.workspaceId,
      batchId: enrollment.batchId.value,
      enrollment: {
        id: enrollment.id.value,
        timings: studentTimings?.slots ?? null,
      },
    });
    await this.enrollments.save(enrollment);
    await this.events.dispatch(enrollment.pullDomainEvents());
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    return toEnrollmentReadModel(enrollment, paid);
  }
}
