import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  HeadOfficeCentreFacts,
  HeadOfficeStore,
} from "../application/head-office-ports";
import { fromIsoDate, toIsoDate, type IsoDate } from "../domain/dates";

function countBy(
  rows: readonly { centreId: string; _count: { _all: number } }[],
): Map<string, number> {
  return new Map(rows.map((row) => [row.centreId, row._count._all]));
}

export class PrismaHeadOfficeStore implements HeadOfficeStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async facts(
    workspaceId: string,
    centreIds: readonly string[],
    window: { today: IsoDate; startsOn: IsoDate; endsOn: IsoDate },
  ): Promise<HeadOfficeCentreFacts[]> {
    const ids = [...centreIds];
    if (ids.length === 0) return [];
    const db = this.db;
    const inCentres = { in: ids };
    const month = {
      gte: fromIsoDate(window.startsOn),
      lte: fromIsoDate(window.endsOn),
    };
    const [
      children,
      classrooms,
      present,
      collected,
      invoices,
      enquiries,
      admissions,
    ] = await Promise.all([
      db.preschoolChild.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: inCentres,
          status: "active",
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      db.preschoolClassroom.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: inCentres,
          deletedAt: null,
          archivedAt: null,
          academicYear: { isCurrent: true },
        },
        _sum: { capacity: true },
      }),
      db.preschoolAttendance.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: inCentres,
          date: fromIsoDate(window.today),
          status: "present",
        },
        _count: { _all: true },
      }),
      db.preschoolFeePayment.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: inCentres,
          receivedOn: month,
          cancelledAt: null,
        },
        _sum: { amountPaise: true },
      }),
      db.preschoolInvoice.findMany({
        where: {
          workspaceId,
          cancelledAt: null,
          child: { centreId: inCentres, deletedAt: null },
        },
        select: {
          dueOn: true,
          amountPaise: true,
          concessionPaise: true,
          paidPaise: true,
          child: { select: { centreId: true } },
        },
      }),
      db.preschoolEnquiry.groupBy({
        by: ["centreId"],
        where: {
          workspaceId,
          centreId: inCentres,
          deletedAt: null,
          status: { notIn: ["admitted", "lost"] },
        },
        _count: { _all: true },
      }),
      db.preschoolAdmission.groupBy({
        by: ["centreId"],
        where: { workspaceId, centreId: inCentres, admittedOn: month },
        _count: { _all: true },
      }),
    ]);
    const childCount = countBy(children);
    const capacity = new Map(
      classrooms.map((row) => [row.centreId, row._sum.capacity ?? 0]),
    );
    const presentCount = countBy(present);
    const collectedPaise = new Map(
      collected.map((row) => [row.centreId, row._sum.amountPaise ?? 0]),
    );
    const enquiryCount = countBy(enquiries);
    const admissionCount = countBy(admissions);
    return ids.map((id) => ({
      id,
      activeChildren: childCount.get(id) ?? 0,
      capacity: capacity.get(id) ?? 0,
      presentToday: presentCount.get(id) ?? 0,
      collectedPaise: collectedPaise.get(id) ?? 0,
      outstanding: invoices
        .filter(
          (invoice) =>
            invoice.child.centreId === id &&
            invoice.amountPaise - invoice.concessionPaise - invoice.paidPaise >
              0,
        )
        .map((invoice) => ({
          dueOn: toIsoDate(invoice.dueOn),
          amountPaise: invoice.amountPaise,
          concessionPaise: invoice.concessionPaise,
          paidPaise: invoice.paidPaise,
        })),
      openEnquiries: enquiryCount.get(id) ?? 0,
      admissions: admissionCount.get(id) ?? 0,
    }));
  }
}
