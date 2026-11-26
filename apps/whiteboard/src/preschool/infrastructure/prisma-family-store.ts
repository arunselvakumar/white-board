import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  FamilyChildFacts,
  FamilyStore,
} from "../application/family-ports";
import type { MealEntry, ToiletEntry } from "../domain/daily-report";
import {
  fromIsoDate,
  timeInIndia,
  toIsoDate,
  type IsoDate,
} from "../domain/dates";

/** A Parent's Children, read straight from the children, attendance, report and fee tables. */
export class PrismaFamilyStore implements FamilyStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async children(
    workspaceId: string,
    childIds: readonly string[],
    today: IsoDate,
  ): Promise<FamilyChildFacts[]> {
    const ids = [...childIds];
    if (ids.length === 0) return [];
    const date = fromIsoDate(today);
    const [children, attendance, reports, invoices] = await Promise.all([
      this.db.preschoolChild.findMany({
        where: { workspaceId, id: { in: ids }, deletedAt: null },
        orderBy: [{ firstName: "asc" }, { id: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          photoUrl: true,
          dateOfBirth: true,
          admissionNumber: true,
          centre: { select: { id: true, name: true, phone: true } },
          authorisedPickups: { select: { id: true, relationship: true } },
          admissions: {
            where: { status: "active" },
            orderBy: { admittedOn: "desc" },
            take: 1,
            select: {
              programme: { select: { name: true } },
              classroom: {
                select: {
                  name: true,
                  teachers: {
                    where: {
                      staff: { status: "active", deletedAt: null },
                    },
                    select: { staff: { select: { name: true } } },
                  },
                },
              },
            },
          },
        },
      }),
      this.db.preschoolAttendance.findMany({
        where: { workspaceId, childId: { in: ids }, date },
        select: {
          childId: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          collectedByKind: true,
          collectedByName: true,
          collectedByPickupId: true,
        },
      }),
      Promise.all(
        ids.map((childId) =>
          this.db.preschoolDailyReport.findFirst({
            where: { workspaceId, childId, status: "published" },
            orderBy: { date: "desc" },
          }),
        ),
      ),
      this.db.preschoolInvoice.findMany({
        where: { workspaceId, childId: { in: ids }, cancelledAt: null },
        select: {
          childId: true,
          label: true,
          dueOn: true,
          amountPaise: true,
          concessionPaise: true,
          paidPaise: true,
        },
      }),
    ]);
    const marks = new Map(attendance.map((mark) => [mark.childId, mark]));
    const latest = new Map(
      reports.flatMap((report) =>
        report == null ? [] : [[report.childId, report] as const],
      ),
    );
    return children.map((child) => {
      const admission = child.admissions[0];
      const mark = marks.get(child.id);
      const report = latest.get(child.id);
      return {
        id: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        photoUrl: child.photoUrl,
        dateOfBirth: toIsoDate(child.dateOfBirth),
        admissionNumber: child.admissionNumber,
        classroomName: admission?.classroom.name ?? null,
        programmeName: admission?.programme.name ?? null,
        centre: child.centre,
        classTeachers: (admission?.classroom.teachers ?? [])
          .map((link) => link.staff.name)
          .sort((a, b) => a.localeCompare(b)),
        attendance:
          mark == null
            ? null
            : {
                status: mark.status,
                checkInTime:
                  mark.checkInAt == null ? null : timeInIndia(mark.checkInAt),
                checkOutTime:
                  mark.checkOutAt == null ? null : timeInIndia(mark.checkOutAt),
                collectedByKind: mark.collectedByKind,
                collectedByName: mark.collectedByName,
                pickupRelationship:
                  child.authorisedPickups.find(
                    (pickup) => pickup.id === mark.collectedByPickupId,
                  )?.relationship ?? null,
              },
        latestReport:
          report == null
            ? null
            : {
                date: toIsoDate(report.date),
                publishedAt: report.publishedAt?.toISOString() ?? null,
                meals: report.meals as MealEntry[],
                napFrom: report.napFrom,
                napTo: report.napTo,
                toilet: report.toilet as ToiletEntry[],
                mood: report.mood,
                activities: report.activities,
                note: report.note,
                photos: report.photos,
              },
        invoices: invoices
          .filter((invoice) => invoice.childId === child.id)
          .map((invoice) => ({
            label: invoice.label,
            dueOn: toIsoDate(invoice.dueOn),
            amountPaise: invoice.amountPaise,
            concessionPaise: invoice.concessionPaise,
            paidPaise: invoice.paidPaise,
          })),
      };
    });
  }
}
