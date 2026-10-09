import { Prisma, type PrismaClient } from "@repo/db";

import {
  EnrollmentNotFoundError,
  FeePaymentNotFoundError,
} from "../application/not-found-error";
import type { EnrollmentId } from "../domain/enrollment-id";
import { DomainError } from "../domain/errors";
import type { FeePayment } from "../domain/fee-payment";
import type { FeePaymentId } from "../domain/fee-payment-id";
import type {
  FeePaymentListParams,
  FeePaymentRepository,
} from "../domain/fee-payment-repository";
import type { ListPage } from "../domain/list";
import type { WorkspaceId } from "../domain/workspace-id";
import { toDomainFeePayment } from "./prisma-fee-payment-mapper";
import {
  closeFeeFollowUpsWhenDuesCleared,
  lockEnrollmentDues,
} from "./prisma-fee-follow-up-store";

export class PrismaFeePaymentRepository implements FeePaymentRepository {
  constructor(private readonly db: PrismaClient) {}

  async save(payment: FeePayment): Promise<void> {
    const mutable = {
      amountPaise: payment.amount.value,
      method: payment.method.value,
      paidAt: payment.paidAt,
      receiptNumber: payment.receiptNumber.value,
      updatedAt: payment.updatedAt,
      deletedAt: payment.deletedAt,
      deletedByUserId: payment.deletedByUserId?.value ?? null,
    };

    const updated = await this.db.trainingInstituteFeePayment.updateMany({
      where: { id: payment.id.value, deletedAt: null },
      data: mutable,
    });
    if (updated.count > 0) {
      return;
    }
    if (payment.deletedAt != null) {
      throw new FeePaymentNotFoundError();
    }
    try {
      await this.db.trainingInstituteFeePayment.create({
        data: {
          id: payment.id.value,
          workspaceId: payment.workspaceId.value,
          enrollmentId: payment.enrollmentId.value,
          recordedByUserId: payment.recordedByUserId.value,
          createdAt: payment.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new FeePaymentNotFoundError();
      }
      throw error;
    }
  }

  async createWithNextReceipt(
    workspaceId: WorkspaceId,
    build: (sequence: number) => FeePayment,
  ): Promise<FeePayment> {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId.value}))`;
      const count = await tx.trainingInstituteFeePayment.count({
        where: { workspaceId: workspaceId.value },
      });
      const payment = build(count + 1);
      // The Enrollment lock Fee Follow-ups take, so one can't be logged on
      // dues this payment clears.
      const dues = await lockEnrollmentDues(
        tx,
        workspaceId.value,
        payment.enrollmentId.value,
      );
      if (dues == null) throw new EnrollmentNotFoundError();
      // Checked again under the lock: two payments at once can't overpay.
      if (payment.amount.value > dues.netAmountPaise - dues.paidPaise) {
        throw new DomainError(
          "FEE_OVERPAY",
          "Fee Payment cannot exceed remaining dues.",
        );
      }
      await tx.trainingInstituteFeePayment.create({
        data: {
          id: payment.id.value,
          workspaceId: payment.workspaceId.value,
          enrollmentId: payment.enrollmentId.value,
          recordedByUserId: payment.recordedByUserId.value,
          createdAt: payment.createdAt,
          amountPaise: payment.amount.value,
          method: payment.method.value,
          paidAt: payment.paidAt,
          receiptNumber: payment.receiptNumber.value,
          updatedAt: payment.updatedAt,
          deletedAt: payment.deletedAt,
          deletedByUserId: payment.deletedByUserId?.value ?? null,
        },
      });
      await closeFeeFollowUpsWhenDuesCleared(
        tx,
        workspaceId.value,
        payment.enrollmentId.value,
        payment.createdAt,
      );
      return payment;
    });
  }

  async findByIdInWorkspace(
    id: FeePaymentId,
    workspaceId: WorkspaceId,
  ): Promise<FeePayment | null> {
    const row = await this.db.trainingInstituteFeePayment.findFirst({
      where: {
        id: id.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
    });
    return row == null ? null : toDomainFeePayment(row);
  }

  async listInWorkspace(
    params: FeePaymentListParams,
  ): Promise<ListPage<FeePayment>> {
    const cursor = cursorWhere(params);
    const where: Prisma.TrainingInstituteFeePaymentWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.enrollmentId != null
        ? { enrollmentId: params.enrollmentId.value }
        : {}),
      ...cursor,
    };
    const orderBy = listOrderBy(params.before != null);
    const countWhere: Prisma.TrainingInstituteFeePaymentWhereInput = {
      workspaceId: params.workspaceId.value,
      deletedAt: null,
      ...(params.enrollmentId != null
        ? { enrollmentId: params.enrollmentId.value }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.trainingInstituteFeePayment.findMany({
        where,
        orderBy,
        take: params.limit + 1,
      }),
      this.db.trainingInstituteFeePayment.count({ where: countWhere }),
    ]);
    const hasMore = rows.length > params.limit;
    const pageRows = hasMore ? rows.slice(0, params.limit) : rows;
    const inDisplayOrder =
      params.before != null ? [...pageRows].reverse() : pageRows;
    return {
      items: inDisplayOrder.map(toDomainFeePayment),
      total,
      hasMore,
    };
  }

  async nextReceiptSequence(workspaceId: WorkspaceId): Promise<number> {
    const count = await this.db.trainingInstituteFeePayment.count({
      where: { workspaceId: workspaceId.value },
    });
    return count + 1;
  }

  async sumAmountPaiseForEnrollment(
    enrollmentId: EnrollmentId,
    workspaceId: WorkspaceId,
  ): Promise<number> {
    const result = await this.db.trainingInstituteFeePayment.aggregate({
      where: {
        enrollmentId: enrollmentId.value,
        workspaceId: workspaceId.value,
        deletedAt: null,
      },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0;
  }
}

function cursorWhere(
  params: FeePaymentListParams,
):
  | Pick<Prisma.TrainingInstituteFeePaymentWhereInput, "OR">
  | Record<string, never> {
  if (params.after != null) {
    return {
      OR: [
        { createdAt: { lt: params.after.createdAt } },
        {
          createdAt: params.after.createdAt,
          id: { lt: params.after.id.value },
        },
      ],
    };
  }
  if (params.before != null) {
    return {
      OR: [
        { createdAt: { gt: params.before.createdAt } },
        {
          createdAt: params.before.createdAt,
          id: { gt: params.before.id.value },
        },
      ],
    };
  }
  return {};
}

function listOrderBy(
  ascending: boolean,
): Prisma.TrainingInstituteFeePaymentOrderByWithRelationInput[] {
  const direction = ascending ? "asc" : "desc";
  return [{ createdAt: direction }, { id: direction }];
}
