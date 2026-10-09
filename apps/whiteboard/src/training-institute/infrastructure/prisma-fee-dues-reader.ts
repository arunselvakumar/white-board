import type { PrismaClient } from "@repo/db";

import type {
  FeeDueRecord,
  FeeDuesReader,
} from "../application/fee-dues-ports";
import type {
  FeeFollowUpChannel,
  FeeFollowUpProps,
} from "../domain/fee-follow-up";
import type { FeePlanDueDate } from "../domain/fee-plan";
import { toFeeFollowUpProps } from "./prisma-fee-follow-up-store";

type DueRow = {
  enrollment_id: string;
  student_id: string;
  student_name: string;
  course_id: string;
  course_name: string;
  batch_id: string;
  batch_name: string;
  timezone: string;
  ended_at: Date | null;
  net: bigint;
  paid: bigint;
  due_dates: FeePlanDueDate[];
  follow_up_id: string | null;
  follow_up_channel: FeeFollowUpChannel | null;
  follow_up_next_on: Date | null;
  follow_up_note: string | null;
};

export class PrismaFeeDuesReader implements FeeDuesReader {
  constructor(private readonly db: PrismaClient) {}

  async enrollmentsWithDues(workspaceId: string): Promise<FeeDueRecord[]> {
    const rows = await this.db.$queryRaw<DueRow[]>`
      WITH paid AS (
        SELECT enrollment_id, SUM(amount_paise)::bigint AS paid
          FROM training_institute.fee_payments
         WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
         GROUP BY enrollment_id
      )
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        s.name AS student_name,
        e.course_id,
        c.name AS course_name,
        e.batch_id,
        b.name AS batch_name,
        b.timezone,
        e.ended_at,
        (e.fee_plan_amount_paise - e.fee_plan_concession_paise)::bigint AS net,
        COALESCE(paid.paid, 0)::bigint AS paid,
        e.fee_plan_due_dates AS due_dates,
        f.id AS follow_up_id,
        f.channel::text AS follow_up_channel,
        f.next_follow_up_on AS follow_up_next_on,
        f.note AS follow_up_note
      FROM training_institute.enrollments e
      JOIN training_institute.students s
        ON s.id = e.student_id AND s.deleted_at IS NULL
      JOIN training_institute.courses c ON c.id = e.course_id
      JOIN training_institute.batches b ON b.id = e.batch_id
      LEFT JOIN paid ON paid.enrollment_id = e.id
      LEFT JOIN training_institute.fee_follow_ups f
        ON f.enrollment_id = e.id AND f.closed_at IS NULL
      WHERE e.workspace_id = ${workspaceId}
        AND e.deleted_at IS NULL
        AND (e.fee_plan_amount_paise - e.fee_plan_concession_paise)
            > COALESCE(paid.paid, 0)`;
    return rows.map((row) => ({
      enrollmentId: row.enrollment_id,
      studentId: row.student_id,
      studentName: row.student_name,
      courseId: row.course_id,
      courseName: row.course_name,
      batchId: row.batch_id,
      batchName: row.batch_name,
      timezone: row.timezone,
      endedAt: row.ended_at,
      netAmountPaise: Number(row.net),
      paidPaise: Number(row.paid),
      dueDates: row.due_dates,
      openFollowUp:
        row.follow_up_id == null || row.follow_up_channel == null
          ? null
          : {
              id: row.follow_up_id,
              channel: row.follow_up_channel,
              nextFollowUpOn:
                row.follow_up_next_on == null
                  ? null
                  : row.follow_up_next_on.toISOString().slice(0, 10),
              note: row.follow_up_note,
            },
    }));
  }

  async history(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<{ remainingPaise: number; followUps: FeeFollowUpProps[] } | null> {
    const enrollment = await this.db.trainingInstituteEnrollment.findFirst({
      where: { id: enrollmentId, workspaceId, deletedAt: null },
      select: { feePlanAmountPaise: true, feePlanConcessionPaise: true },
    });
    if (enrollment == null) return null;
    const [paid, followUps] = await Promise.all([
      this.db.trainingInstituteFeePayment.aggregate({
        where: { enrollmentId, workspaceId, deletedAt: null },
        _sum: { amountPaise: true },
      }),
      this.db.trainingInstituteFeeFollowUp.findMany({
        where: { enrollmentId, workspaceId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    return {
      remainingPaise: Math.max(
        0,
        enrollment.feePlanAmountPaise -
          enrollment.feePlanConcessionPaise -
          (paid._sum.amountPaise ?? 0),
      ),
      followUps: followUps.map(toFeeFollowUpProps),
    };
  }
}
