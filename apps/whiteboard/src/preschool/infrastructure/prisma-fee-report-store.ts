import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type { FeeReportStore } from "../application/fee-ports";
import type { DuesRowView, FeeSummaryView } from "../application/fee-views";
import { fromIsoDate, toIsoDate } from "../domain/dates";

type DuesAggregate = {
  child_id: string;
  due: bigint;
  overdue: bigint;
  oldest: Date;
  invoices: bigint;
};

export class PrismaFeeReportStore implements FeeReportStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async dues(
    workspaceId: string,
    query: { centreId: string; classroomId: string | null; today: string },
  ): Promise<DuesRowView[]> {
    const rows = await this.db.$queryRaw<DuesAggregate[]>`
      SELECT i.child_id::text AS child_id,
        SUM(i.amount_paise - i.concession_paise - i.paid_paise)::bigint AS due,
        SUM(CASE WHEN i.due_on < ${query.today}::date
          THEN i.amount_paise - i.concession_paise - i.paid_paise
          ELSE 0 END)::bigint AS overdue,
        MIN(i.due_on) AS oldest,
        COUNT(*)::bigint AS invoices
      FROM preschool.invoices i
      JOIN preschool.children c ON c.id = i.child_id AND c.deleted_at IS NULL
      WHERE i.workspace_id = ${workspaceId}
        AND c.centre_id = ${query.centreId}::uuid
        AND i.cancelled_at IS NULL
        AND i.amount_paise - i.concession_paise - i.paid_paise > 0
      GROUP BY i.child_id`;
    if (rows.length === 0) return [];
    const children = await this.db.preschoolChild.findMany({
      where: {
        workspaceId,
        id: { in: rows.map((row) => row.child_id) },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,
        admissions: {
          where: { status: "active" },
          orderBy: { admittedOn: "desc" },
          take: 1,
          select: { classroom: { select: { id: true, name: true } } },
        },
      },
    });
    const byId = new Map(children.map((child) => [child.id, child]));
    return rows.flatMap((row): DuesRowView[] => {
      const child = byId.get(row.child_id);
      if (child == null) return [];
      const classroom = child.admissions[0]?.classroom ?? null;
      if (query.classroomId != null && classroom?.id !== query.classroomId)
        return [];
      return [
        {
          childId: child.id,
          firstName: child.firstName,
          lastName: child.lastName,
          admissionNumber: child.admissionNumber,
          classroom,
          fatherName: child.fatherName,
          fatherPhone: child.fatherPhone,
          motherName: child.motherName,
          motherPhone: child.motherPhone,
          duePaise: Number(row.due),
          overduePaise: Number(row.overdue),
          oldestDueOn: toIsoDate(row.oldest),
          invoiceCount: Number(row.invoices),
        },
      ];
    });
  }

  async summary(
    workspaceId: string,
    query: {
      centreIds: readonly string[];
      today: string;
      monthStartsOn: string;
    },
  ): Promise<FeeSummaryView> {
    const centreIds = [...query.centreIds];
    const collected = (from: string) =>
      this.db.preschoolFeePayment.aggregate({
        where: {
          workspaceId,
          centreId: { in: centreIds },
          cancelledAt: null,
          receivedOn: { gte: fromIsoDate(from), lte: fromIsoDate(query.today) },
        },
        _sum: { amountPaise: true },
      });
    const [today, month, dues] = await Promise.all([
      collected(query.today),
      collected(query.monthStartsOn),
      this.db.$queryRaw<
        { due: bigint | null; overdue: bigint | null; children: bigint }[]
      >`
        SELECT
          SUM(i.amount_paise - i.concession_paise - i.paid_paise)::bigint AS due,
          SUM(CASE WHEN i.due_on < ${query.today}::date
            THEN i.amount_paise - i.concession_paise - i.paid_paise
            ELSE 0 END)::bigint AS overdue,
          COUNT(DISTINCT i.child_id)::bigint AS children
        FROM preschool.invoices i
        JOIN preschool.children c ON c.id = i.child_id AND c.deleted_at IS NULL
        WHERE i.workspace_id = ${workspaceId}
          AND c.centre_id = ANY(${centreIds}::uuid[])
          AND i.cancelled_at IS NULL
          AND i.amount_paise - i.concession_paise - i.paid_paise > 0`,
    ]);
    const totals = dues[0];
    return {
      collectedTodayPaise: today._sum.amountPaise ?? 0,
      collectedThisMonthPaise: month._sum.amountPaise ?? 0,
      duePaise: Number(totals?.due ?? 0),
      overduePaise: Number(totals?.overdue ?? 0),
      childrenWithDues: Number(totals?.children ?? 0),
    };
  }
}
