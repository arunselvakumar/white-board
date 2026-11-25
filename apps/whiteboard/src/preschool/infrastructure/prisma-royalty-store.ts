import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  RoyaltyAllocation,
  RoyaltyCentre,
  RoyaltyFeeHead,
  RoyaltyStore,
} from "../application/royalty-ports";
import { fromIsoDate, toIsoDate, type IsoDate } from "../domain/dates";

export class PrismaRoyaltyStore implements RoyaltyStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  centres(workspaceId: string, centreId?: string): Promise<RoyaltyCentre[]> {
    return this.db.preschoolCentre.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(centreId == null ? {} : { id: centreId }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        ownership: true,
        status: true,
        franchiseeName: true,
        royaltyBps: true,
      },
    });
  }

  feeHeads(workspaceId: string): Promise<RoyaltyFeeHead[]> {
    return this.db.preschoolFeeHead.findMany({
      where: { workspaceId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, royaltyBearing: true, sortOrder: true },
    });
  }

  async allocations(
    workspaceId: string,
    centreIds: readonly string[],
    span: { startsOn: IsoDate; endsOn: IsoDate },
  ): Promise<RoyaltyAllocation[]> {
    if (centreIds.length === 0) return [];
    const rows = await this.db.preschoolFeePaymentAllocation.findMany({
      where: {
        workspaceId,
        payment: {
          centreId: { in: [...centreIds] },
          receivedOn: {
            gte: fromIsoDate(span.startsOn),
            lte: fromIsoDate(span.endsOn),
          },
        },
      },
      select: {
        amountPaise: true,
        invoice: { select: { feeHeadId: true } },
        payment: {
          select: {
            id: true,
            centreId: true,
            receiptNumber: true,
            receivedOn: true,
            childId: true,
            child: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      centreId: row.payment.centreId,
      paymentId: row.payment.id,
      receiptNumber: row.payment.receiptNumber,
      receivedOn: toIsoDate(row.payment.receivedOn),
      childId: row.payment.childId,
      childName: [row.payment.child.firstName, row.payment.child.lastName]
        .filter((part) => part != null && part !== "")
        .join(" "),
      feeHeadId: row.invoice.feeHeadId,
      amountPaise: row.amountPaise,
    }));
  }
}
