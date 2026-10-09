import type { PrismaClient } from "@repo/db";

import { classesOn, localNow } from "../domain/class-schedule";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";
import type { ClassExceptionsReader } from "./class-change-handlers";
import type { GetOwnerDashboardQuery } from "./get-owner-dashboard.query";
import type { OwnerDashboardReadModel } from "./owner-dashboard-read-model";

export class GetOwnerDashboardHandler {
  constructor(
    private readonly db: PrismaClient,
    private readonly exceptions: ClassExceptionsReader,
    /** Open Fee Follow-ups due today or earlier (ADR-0039). */
    private readonly countFeeFollowUpsDue: (
      workspaceId: string,
    ) => Promise<number>,
  ) {}

  async execute(
    query: GetOwnerDashboardQuery,
  ): Promise<OwnerDashboardReadModel> {
    const workspaceId = WorkspaceId.create(query.workspaceId).value;
    const now = query.now ?? new Date();
    const [
      activeStudentCount,
      recentStudents,
      batches,
      enrollments,
      payments,
      feeFollowUpsDueCount,
    ] = await Promise.all([
      this.db.trainingInstituteStudent.count({
        where: { workspaceId, deletedAt: null, droppedAt: null },
      }),
      this.db.trainingInstituteStudent.findMany({
        where: { workspaceId, deletedAt: null, droppedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
      }),
      this.db.trainingInstituteBatch.findMany({
        where: { workspaceId, deletedAt: null, closedAt: null },
      }),
      this.db.trainingInstituteEnrollment.findMany({
        where: { workspaceId, deletedAt: null, endedAt: null },
        select: {
          id: true,
          batchId: true,
          feePlanAmountPaise: true,
          feePlanConcessionPaise: true,
        },
      }),
      this.db.trainingInstituteFeePayment.groupBy({
        by: ["enrollmentId"],
        where: { workspaceId, deletedAt: null },
        _sum: { amountPaise: true },
      }),
      this.countFeeFollowUpsDue(workspaceId),
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

    const { changes, holidays } = await this.exceptions.forBatches(
      workspaceId,
      batches.map((batch) => batch.id),
    );
    const todayBatches = batches.flatMap((batch) => {
      const timings = WeeklyTimings.create(batch.timings);
      const todayClasses = classesOn(
        { batchId: batch.id, timings: timings.slots },
        localNow(now, batch.timezone).date,
        changes,
        holidays,
      ).filter((scheduled) => scheduled.status === "scheduled");
      if (todayClasses.length === 0) return [];
      return [
        {
          id: batch.id,
          name: batch.name,
          courseId: batch.courseId,
          classMode: batch.classMode,
          capacity: batch.capacity,
          enrolledCount: enrolledByBatch.get(batch.id) ?? 0,
          timings: timings.toJson(),
          todayClasses: todayClasses.map((scheduled) => ({
            startTime: scheduled.startTime,
            endTime: scheduled.endTime,
            rescheduled: scheduled.rescheduled,
          })),
        },
      ];
    });

    return {
      activeStudentCount,
      outstandingDuesPaise,
      feeFollowUpsDueCount,
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
