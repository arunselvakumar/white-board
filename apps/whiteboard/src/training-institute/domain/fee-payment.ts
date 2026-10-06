import type { EnrollmentId } from "./enrollment-id";
import type { DomainEvent } from "./events";
import type { FeePaymentId } from "./fee-payment-id";
import type { FeePaymentMethod } from "./fee-payment-method";
import type { Paise } from "./paise";
import type { ReceiptNumber } from "./receipt-number";
import type { UserId } from "./user-id";
import type { WorkspaceId } from "./workspace-id";

export type FeePaymentProps = {
  id: FeePaymentId;
  workspaceId: WorkspaceId;
  enrollmentId: EnrollmentId;
  recordedByUserId: UserId;
  amount: Paise;
  method: FeePaymentMethod;
  paidAt: Date;
  receiptNumber: ReceiptNumber;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedByUserId: UserId | null;
};

export class FeePayment {
  private events: DomainEvent[] = [];

  private constructor(private props: FeePaymentProps) {}

  static create(input: {
    id: FeePaymentId;
    workspaceId: WorkspaceId;
    enrollmentId: EnrollmentId;
    recordedByUserId: UserId;
    amount: Paise;
    method: FeePaymentMethod;
    paidAt: Date;
    receiptNumber: ReceiptNumber;
    now: Date;
  }): FeePayment {
    const payment = new FeePayment({
      id: input.id,
      workspaceId: input.workspaceId,
      enrollmentId: input.enrollmentId,
      recordedByUserId: input.recordedByUserId,
      amount: input.amount,
      method: input.method,
      paidAt: input.paidAt,
      receiptNumber: input.receiptNumber,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedByUserId: null,
    });
    payment.events.push({
      type: "FeePaymentRecorded",
      feePaymentId: input.id.value,
      enrollmentId: input.enrollmentId.value,
      receiptNumber: input.receiptNumber.value,
      workspaceId: input.workspaceId.value,
      occurredAt: input.now,
    });
    return payment;
  }

  static reconstitute(props: FeePaymentProps): FeePayment {
    return new FeePayment(props);
  }

  get id(): FeePaymentId {
    return this.props.id;
  }

  get workspaceId(): WorkspaceId {
    return this.props.workspaceId;
  }

  get enrollmentId(): EnrollmentId {
    return this.props.enrollmentId;
  }

  get recordedByUserId(): UserId {
    return this.props.recordedByUserId;
  }

  get amount(): Paise {
    return this.props.amount;
  }

  get method(): FeePaymentMethod {
    return this.props.method;
  }

  get paidAt(): Date {
    return this.props.paidAt;
  }

  get receiptNumber(): ReceiptNumber {
    return this.props.receiptNumber;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get deletedByUserId(): UserId | null {
    return this.props.deletedByUserId;
  }

  pullDomainEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
