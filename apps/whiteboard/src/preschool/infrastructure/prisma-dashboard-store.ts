import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  CentreDashboardFacts,
  DashboardStore,
  DashboardWindow,
} from "../application/dashboard-ports";
import { isOpenEnquiry } from "../domain/dashboard";
import {
  addDays,
  fromIsoDate,
  instantInIndia,
  toIsoDate,
} from "../domain/dates";

const OPEN_ENQUIRY: { notIn: ("admitted" | "lost")[] } = {
  notIn: ["admitted", "lost"],
};

function childName(child: { firstName: string; lastName: string | null }) {
  return [child.firstName, child.lastName]
    .filter((part) => part != null && part !== "")
    .join(" ");
}

/** The Centre Dashboard's facts, read straight from each area's tables. */
export class PrismaDashboardStore implements DashboardStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async centre(
    workspaceId: string,
    centreId: string,
    window: DashboardWindow,
  ): Promise<CentreDashboardFacts> {
    const db = this.db;
    const today = fromIsoDate(window.today);
    const monthFrom = instantInIndia(window.monthStartsOn, "00:00");
    const monthTo = instantInIndia(addDays(window.monthEndsOn, 1), "00:00");
    const year = await db.preschoolAcademicYear.findFirst({
      where: { workspaceId, isCurrent: true },
      select: { id: true, name: true },
    });

    const [
      classrooms,
      activeChildren,
      activeStaff,
      structures,
      attendance,
      reports,
      invoices,
      collectedToday,
      collectedMonth,
      openEnquiries,
      enquiriesThisMonth,
      admittedThisMonth,
      followUps,
      items,
      movements,
      upcoming,
    ] = await Promise.all([
      year == null
        ? Promise.resolve([])
        : db.preschoolClassroom.findMany({
            where: {
              workspaceId,
              centreId,
              academicYearId: year.id,
              deletedAt: null,
              archivedAt: null,
            },
            orderBy: [{ programme: { sortOrder: "asc" } }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              capacity: true,
              programme: { select: { name: true } },
              admissions: {
                where: { status: "active" },
                select: { childId: true },
              },
            },
          }),
      db.preschoolChild.count({
        where: { workspaceId, centreId, status: "active", deletedAt: null },
      }),
      db.preschoolStaff.count({
        where: { workspaceId, centreId, status: "active", deletedAt: null },
      }),
      year == null
        ? Promise.resolve(0)
        : db.preschoolFeeStructure.count({
            where: {
              workspaceId,
              academicYearId: year.id,
              OR: [{ centreId: null }, { centreId }],
            },
          }),
      db.preschoolAttendance.findMany({
        where: { workspaceId, centreId, date: today },
        select: {
          childId: true,
          classroomId: true,
          status: true,
          checkOutAt: true,
        },
      }),
      db.preschoolDailyReport.findMany({
        where: { workspaceId, centreId, date: today },
        select: { childId: true, status: true },
      }),
      db.preschoolInvoice.findMany({
        where: {
          workspaceId,
          cancelledAt: null,
          child: { centreId, deletedAt: null },
        },
        select: {
          childId: true,
          dueOn: true,
          amountPaise: true,
          concessionPaise: true,
          paidPaise: true,
          child: {
            select: {
              firstName: true,
              lastName: true,
              admissions: {
                where: { status: "active" },
                orderBy: { admittedOn: "desc" },
                take: 1,
                select: { classroom: { select: { name: true } } },
              },
            },
          },
        },
      }),
      db.preschoolFeePayment.aggregate({
        where: { workspaceId, centreId, receivedOn: today, cancelledAt: null },
        _sum: { amountPaise: true },
      }),
      db.preschoolFeePayment.aggregate({
        where: {
          workspaceId,
          centreId,
          cancelledAt: null,
          receivedOn: {
            gte: fromIsoDate(window.monthStartsOn),
            lte: fromIsoDate(window.monthEndsOn),
          },
        },
        _sum: { amountPaise: true },
      }),
      db.preschoolEnquiry.count({
        where: { workspaceId, centreId, deletedAt: null, status: OPEN_ENQUIRY },
      }),
      db.preschoolEnquiry.count({
        where: {
          workspaceId,
          centreId,
          deletedAt: null,
          createdAt: { gte: monthFrom, lt: monthTo },
        },
      }),
      db.preschoolEnquiry.count({
        where: {
          workspaceId,
          centreId,
          deletedAt: null,
          status: "admitted",
          convertedAt: { gte: monthFrom, lt: monthTo },
        },
      }),
      db.preschoolEnquiry.findMany({
        where: {
          workspaceId,
          centreId,
          deletedAt: null,
          status: OPEN_ENQUIRY,
          nextFollowUpOn: { lte: today },
        },
        orderBy: [{ nextFollowUpOn: "asc" }, { createdAt: "asc" }],
        take: 5,
        select: {
          id: true,
          childName: true,
          parentName: true,
          parentPhone: true,
          nextFollowUpOn: true,
          status: true,
        },
      }),
      db.preschoolStockItem.findMany({
        where: { workspaceId, archivedAt: null },
        select: { id: true, name: true, unit: true, reorderLevel: true },
      }),
      db.preschoolStockMovement.groupBy({
        by: ["itemId"],
        where: { workspaceId, centreId },
        _sum: { quantityDelta: true },
      }),
      db.preschoolAnnouncement.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          kind: { in: ["event", "holiday"] },
          startsOn: { gte: today },
          OR: [{ centreId: null }, { centreId }],
        },
        orderBy: [{ startsOn: "asc" }, { title: "asc" }],
        take: 3,
        select: { id: true, title: true, kind: true, startsOn: true },
      }),
    ]);

    const onHand = new Map(
      movements.map((row) => [row.itemId, row._sum.quantityDelta ?? 0]),
    );
    return {
      academicYear: year,
      classrooms: classrooms.map((classroom) => ({
        id: classroom.id,
        name: classroom.name,
        programmeName: classroom.programme.name,
        capacity: classroom.capacity,
        childIds: classroom.admissions.map((admission) => admission.childId),
      })),
      activeChildren,
      activeStaff,
      hasFeeStructure: structures > 0,
      attendance: attendance.map((mark) => ({
        childId: mark.childId,
        classroomId: mark.classroomId,
        status: mark.status,
        checkedOut: mark.checkOutAt != null,
      })),
      reports,
      outstanding: invoices
        .filter(
          (invoice) =>
            invoice.amountPaise - invoice.concessionPaise - invoice.paidPaise >
            0,
        )
        .map((invoice) => ({
          childId: invoice.childId,
          childName: childName(invoice.child),
          classroomName: invoice.child.admissions[0]?.classroom.name ?? null,
          dueOn: toIsoDate(invoice.dueOn),
          amountPaise: invoice.amountPaise,
          concessionPaise: invoice.concessionPaise,
          paidPaise: invoice.paidPaise,
        })),
      collectedTodayPaise: collectedToday._sum.amountPaise ?? 0,
      collectedThisMonthPaise: collectedMonth._sum.amountPaise ?? 0,
      openEnquiries,
      enquiriesThisMonth,
      admittedThisMonth,
      followUpsDue: followUps
        .filter((enquiry) => isOpenEnquiry(enquiry.status))
        .flatMap((enquiry) =>
          enquiry.nextFollowUpOn == null
            ? []
            : [
                {
                  id: enquiry.id,
                  childName: enquiry.childName,
                  parentName: enquiry.parentName,
                  parentPhone: enquiry.parentPhone,
                  nextFollowUpOn: toIsoDate(enquiry.nextFollowUpOn),
                },
              ],
        ),
      stock: items
        .filter((item) => onHand.has(item.id) || item.reorderLevel != null)
        .map((item) => ({
          itemId: item.id,
          name: item.name,
          unit: item.unit,
          reorderLevel: item.reorderLevel,
          onHand: onHand.get(item.id) ?? 0,
        })),
      upcoming: upcoming.flatMap((announcement) =>
        announcement.startsOn == null || announcement.kind === "notice"
          ? []
          : [
              {
                id: announcement.id,
                title: announcement.title,
                kind: announcement.kind,
                startsOn: toIsoDate(announcement.startsOn),
              },
            ],
      ),
    };
  }
}
