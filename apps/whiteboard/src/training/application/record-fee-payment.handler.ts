import { EnrollmentId } from "../domain/enrollment-id";
import type { EnrollmentRepository } from "../domain/enrollment-repository";
import { FeePayment } from "../domain/fee-payment";
import { FeePaymentId } from "../domain/fee-payment-id";
import { FeePaymentMethod } from "../domain/fee-payment-method";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { Paise } from "../domain/paise";
import { ReceiptNumber } from "../domain/receipt-number";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";
import type { EventDispatcher } from "./event-dispatcher";
import {
  toFeePaymentReadModel,
  type FeePaymentReadModel,
} from "./fee-payment-read-model";
import { EnrollmentNotFoundError } from "./not-found-error";
import type { RecordFeePaymentCommand } from "./record-fee-payment.command";

export class RecordFeePaymentHandler {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly payments: FeePaymentRepository,
    private readonly events: EventDispatcher,
  ) {}

  async execute(
    command: RecordFeePaymentCommand,
  ): Promise<FeePaymentReadModel> {
    const workspaceId = WorkspaceId.create(command.workspaceId);
    const enrollment = await this.enrollments.findByIdInWorkspace(
      EnrollmentId.create(command.enrollmentId),
      workspaceId,
    );
    if (enrollment == null) {
      throw new EnrollmentNotFoundError();
    }
    const amount = Paise.create(command.amountPaise);
    const paid = await this.payments.sumAmountPaiseForEnrollment(
      enrollment.id,
      workspaceId,
    );
    enrollment.feePlan.assertAcceptsPayment(amount, paid);
    const now = new Date();
    const sequence = await this.payments.nextReceiptSequence(workspaceId);
    const payment = FeePayment.create({
      id: FeePaymentId.create(crypto.randomUUID()),
      workspaceId,
      enrollmentId: enrollment.id,
      recordedByUserId: UserId.create(command.recordedByUserId),
      amount,
      method: FeePaymentMethod.create(command.method),
      paidAt: command.paidAt == null ? now : new Date(command.paidAt),
      receiptNumber: ReceiptNumber.fromSequence(sequence),
      now,
    });
    await this.payments.save(payment);
    await this.events.dispatch(payment.pullDomainEvents());
    return toFeePaymentReadModel(payment);
  }
}
