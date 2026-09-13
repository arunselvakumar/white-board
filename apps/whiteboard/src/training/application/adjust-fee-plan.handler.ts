import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import { FeePlan } from "../domain/fee-plan";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { Paise } from "../domain/paise";
import { WorkspaceId } from "../domain/workspace-id";
import type { AdjustFeePlanCommand } from "./adjust-fee-plan.command";
import {
  toEnrollmentReadModel,
  type EnrollmentReadModel,
} from "./enrollment-read-model";
import type { EventDispatcher } from "./event-dispatcher";
import { EnrollmentNotFoundError } from "./not-found-error";

export class AdjustFeePlanHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(command: AdjustFeePlanCommand): Promise<EnrollmentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.id),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    const plan = FeePlan.create({
      type: command.type,
      amount: Paise.create(command.amountPaise),
      concession: Paise.create(command.concessionPaise),
      installmentCount: command.installmentCount ?? null,
      dueDates: command.dueDates,
    });
    plan.assertCoversPayments(paid);
    enrollment.adjustFeePlan(plan, new Date());
    await this.enrollments.save(enrollment);
    await this.events.dispatch(enrollment.pullDomainEvents());
    return toEnrollmentReadModel(enrollment, paid);
  }
}
