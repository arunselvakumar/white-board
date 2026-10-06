import { FeePaymentId } from "../domain/fee-payment-id";
import type { FeePaymentRepository } from "../domain/fee-payment-repository";
import { WorkspaceId } from "../domain/workspace-id";
import {
  toFeePaymentReadModel,
  type FeePaymentReadModel,
} from "./fee-payment-read-model";
import type { GetReceiptQuery } from "./get-receipt.query";
import { FeePaymentNotFoundError } from "./not-found-error";

export class GetReceiptHandler {
  constructor(private readonly payments: FeePaymentRepository) {}

  async execute(query: GetReceiptQuery): Promise<FeePaymentReadModel> {
    const payment = await this.payments.findByIdInWorkspace(
      FeePaymentId.create(query.id),
      WorkspaceId.create(query.workspaceId),
    );
    if (payment == null) {
      throw new FeePaymentNotFoundError();
    }
    return toFeePaymentReadModel(payment);
  }
}
