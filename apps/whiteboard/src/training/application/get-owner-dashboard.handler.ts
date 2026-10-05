import type { PrismaClient } from "@repo/db";

import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import type { GetOwnerDashboardQuery } from "./get-owner-dashboard.query";
import type { OwnerDashboardReadModel } from "./owner-dashboard-read-model";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export class GetOwnerDashboardHandler {
  constructor(private readonly db: PrismaClient) {}

  async execute(
    query: GetOwnerDashboardQuery,
  ): Promise<OwnerDashboardReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId).value;
    const now = query.now ?? new Date();
    const [activeStudentCount, recentStudents, batches, enrollments, payments] =
      await Promise.all([
        this.db.student.count({
          where: { workspaceId, deletedAt: null, droppedAt: null },
        }),
        this.db.student.findMany({
          where: { workspaceId, deletedAt: null, droppedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 5,
        }),
        this.db.batch.findMany({
          where: { workspaceId, deletedAt: null, closedAt: null },
        }),
        this.db.enrollment.findMany({
          where: { workspaceId, deletedAt: null, endedAt: null },
          select: {
            id: true,
            batchId: true,
            feePlanAmountPaise: true,
            feePlanConcessionPaise: true,
          },
        }),
        this.db.feePayment.groupBy({
          by: ["enrollmentId"],
          where: { workspaceId, deletedAt: null },
          _sum: { amountPaise: true },
        }),
      ]);

    const paidByEnrollment = new Map(
      payments.map((row) => [row.enrollmentId, row._sum.amountPaise ?? 0]),
    );
    const outstandingDuesPaise = enrollments.reduce((total, enrollment) => {
      const paid = paidByEnrollment.get(enrollment.id) ?? 0;
      const remaining = Math.max(
        0,
        enrollment.feePlanAmountPaise -
          enrollment.feePlanConcessionPaise -
          paid,
      );
      return total + remaining;
    }, 0);
    const enrolledByBatch = new Map<string, number>();
    for (const enrollment of enrollments) {
      enrolledByBatch.set(
        enrollment.batchId,
        (enrolledByBatch.get(enrollment.batchId) ?? 0) + 1,
      );
    }

    const todayBatches = batches
      .filter((batch) => {
        const timings = WeeklyTimings.create(batch.timings);
        const weekday = weekdayInZone(now, batch.timezone);
        return timings.slots.some((slot) => slot.daysOfWeek.includes(weekday));
      })
      .map((batch) => ({
        id: batch.id,
        name: batch.name,
        courseId: batch.courseId,
        classMode: batch.classMode,
        capacity: batch.capacity,
        enrolledCount: enrolledByBatch.get(batch.id) ?? 0,
        timings: WeeklyTimings.create(batch.timings).toJson(),
      }));

    return {
      activeStudentCount,
      outstandingDuesPaise,
      todayBatches,
      recentStudents: recentStudents.map((student) => ({
        id: student.id,
        name: student.name,
        phone: student.phone,
        createdAt: student.createdAt,
      })),
    };
  }
}

function weekdayInZone(now: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);
  const index = WEEKDAYS.indexOf(label);
  return index === -1 ? now.getUTCDay() : index;
}
