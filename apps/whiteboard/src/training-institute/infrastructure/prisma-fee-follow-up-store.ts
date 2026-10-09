import { Prisma, type PrismaClient } from "@repo/db";

import type {
  EnrollmentDuesFacts,
  FeeFollowUpStore,
} from "../application/fee-dues-ports";
import { DomainError } from "../domain/errors";
import { FeeFollowUp, type FeeFollowUpProps } from "../domain/fee-follow-up";

type Db = PrismaClient | Prisma.TransactionClient;
type FollowUpRow = Prisma.TrainingInstituteFeeFollowUpGetPayload<object>;

const dateValue = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

export function toFeeFollowUpProps(row: FollowUpRow): FeeFollowUpProps {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    enrollmentId: row.enrollmentId,
    channel: row.channel,
    note: row.note,
    nextFollowUpOn:
      row.nextFollowUpOn == null ? null : dateKey(row.nextFollowUpOn),
    loggedByUserId: row.loggedByUserId,
    editedByUserId: row.editedByUserId,
    editedAt: row.editedAt,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Locks the Enrollment row and reads what the dues rules need. Fee Payments,
 * Fee Plan changes, and Fee Follow-ups all take this lock first.
 */
export async function lockEnrollmentDues(
  db: Db,
  workspaceId: string,
  enrollmentId: string,
): Promise<EnrollmentDuesFacts | null> {
  const rows = await db.$queryRaw<
    { net: bigint; paid: bigint; timezone: string }[]
  >`
    SELECT
      (e.fee_plan_amount_paise - e.fee_plan_concession_paise)::bigint AS net,
      (SELECT COALESCE(SUM(p.amount_paise), 0)::bigint
         FROM training_institute.fee_payments p
        WHERE p.enrollment_id = e.id AND p.deleted_at IS NULL) AS paid,
      b.timezone
    FROM training_institute.enrollments e
    JOIN training_institute.batches b ON b.id = e.batch_id
    WHERE e.id = ${enrollmentId}::uuid
      AND e.workspace_id = ${workspaceId}
      AND e.deleted_at IS NULL
    FOR UPDATE OF e`;
  const row = rows[0];
  if (row == null) return null;
  return {
    enrollmentId,
    netAmountPaise: Number(row.net),
    paidPaise: Number(row.paid),
    timezone: row.timezone,
  };
}

/**
 * Closes the Enrollment's open Fee Follow-up once its remaining dues are zero
 * (ADR-0039). Run inside the transaction that recorded the Fee Payment or
 * changed the Fee Plan, after the Enrollment row is locked or updated.
 */
export async function closeFeeFollowUpsWhenDuesCleared(
  db: Db,
  workspaceId: string,
  enrollmentId: string,
  now: Date,
): Promise<void> {
  await db.$executeRaw`
    UPDATE training_institute.fee_follow_ups f
       SET closed_at = ${now}, close_reason = 'dues_cleared', updated_at = ${now}
     WHERE f.enrollment_id = ${enrollmentId}::uuid
       AND f.workspace_id = ${workspaceId}
       AND f.closed_at IS NULL
       AND (
         SELECT e.fee_plan_amount_paise - e.fee_plan_concession_paise
           FROM training_institute.enrollments e
          WHERE e.id = f.enrollment_id
       ) <= (
         SELECT COALESCE(SUM(p.amount_paise), 0)
           FROM training_institute.fee_payments p
          WHERE p.enrollment_id = f.enrollment_id AND p.deleted_at IS NULL
       )`;
}

export class PrismaFeeFollowUpStore implements FeeFollowUpStore {
  constructor(private readonly db: Db) {}

  transaction<T>(work: (store: FeeFollowUpStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaFeeFollowUpStore(tx)));
  }

  lockEnrollment(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<EnrollmentDuesFacts | null> {
    return lockEnrollmentDues(this.db, workspaceId, enrollmentId);
  }

  async findFollowUp(
    workspaceId: string,
    id: string,
  ): Promise<FeeFollowUp | null> {
    const row = await this.db.trainingInstituteFeeFollowUp.findFirst({
      where: { id, workspaceId },
    });
    return row == null ? null : FeeFollowUp.rehydrate(toFeeFollowUpProps(row));
  }

  async openFollowUp(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<FeeFollowUp | null> {
    const row = await this.db.trainingInstituteFeeFollowUp.findFirst({
      where: { workspaceId, enrollmentId, closedAt: null },
    });
    return row == null ? null : FeeFollowUp.rehydrate(toFeeFollowUpProps(row));
  }

  async save(followUp: FeeFollowUp): Promise<void> {
    const props = followUp.toProps();
    const mutable = {
      channel: props.channel,
      note: props.note,
      nextFollowUpOn:
        props.nextFollowUpOn == null ? null : dateValue(props.nextFollowUpOn),
      editedByUserId: props.editedByUserId,
      editedAt: props.editedAt,
      closedAt: props.closedAt,
      closedByUserId: props.closedByUserId,
      closeReason: props.closeReason,
      updatedAt: props.updatedAt,
    };
    try {
      await this.db.trainingInstituteFeeFollowUp.upsert({
        where: { id: props.id },
        update: mutable,
        create: {
          id: props.id,
          workspaceId: props.workspaceId,
          enrollmentId: props.enrollmentId,
          loggedByUserId: props.loggedByUserId,
          createdAt: props.createdAt,
          ...mutable,
        },
      });
    } catch (error) {
      // The one-open-per-Enrollment index; the Enrollment lock should prevent it.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new DomainError(
          "FEE_FOLLOW_UP_CONFLICT",
          "Someone else just logged a follow-up for this Enrollment. Reload and try again.",
        );
      }
      throw error;
    }
  }
}
