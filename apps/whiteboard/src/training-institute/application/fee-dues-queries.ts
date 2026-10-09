import { daysBetween, localNow } from "../domain/class-schedule";
import { assessFeeDues } from "../domain/fee-dues";
import type { FeeFollowUpProps } from "../domain/fee-follow-up";
import type { FeeDueRecord, FeeDuesReader, UserNames } from "./fee-dues-ports";
import type {
  FeeDuesActor,
  FeeDuesFilter,
  FeeDuesSort,
  FeeDuesView,
  FeeDueView,
  FeeFollowUpDueView,
  FeeFollowUpHistoryView,
  FeeFollowUpView,
} from "./fee-dues-views";
import { EnrollmentNotFoundError } from "./not-found-error";

/** Reads for the dues list and Fee Follow-ups (ADR-0039). */
export class FeeDuesQueries {
  constructor(
    private readonly deps: {
      reader: FeeDuesReader;
      names: UserNames;
      now: () => Date;
    },
  ) {}

  async dues(
    actor: FeeDuesActor,
    input: { filter: FeeDuesFilter; sort: FeeDuesSort },
  ): Promise<FeeDuesView> {
    const now = this.deps.now();
    const records = await this.deps.reader.enrollmentsWithDues(
      actor.workspaceId,
    );
    const all = records
      .map((record) => toDueView(record, localNow(now, record.timezone).date))
      .filter((row) => row.remainingPaise > 0);
    const items = all.filter((row) => {
      if (input.filter === "overdue") return row.overdue;
      if (input.filter === "due_soon") return row.dueSoon;
      return true;
    });
    items.sort(input.sort === "due_date" ? byDueDate : byAmountOwed);
    return {
      filter: input.filter,
      sort: input.sort,
      items,
      counts: {
        overdue: all.filter((row) => row.overdue).length,
        dueSoon: all.filter((row) => row.dueSoon).length,
        all: all.length,
      },
      totalRemainingPaise: all.reduce(
        (sum, row) => sum + row.remainingPaise,
        0,
      ),
    };
  }

  /** Open Fee Follow-ups whose next date is today or earlier, oldest first. */
  async followUpsDue(
    actor: Pick<FeeDuesActor, "workspaceId">,
  ): Promise<FeeFollowUpDueView[]> {
    const now = this.deps.now();
    const records = await this.deps.reader.enrollmentsWithDues(
      actor.workspaceId,
    );
    const due: FeeFollowUpDueView[] = [];
    for (const record of records) {
      const followUp = record.openFollowUp;
      if (followUp?.nextFollowUpOn == null) continue;
      const today = localNow(now, record.timezone).date;
      if (followUp.nextFollowUpOn > today) continue;
      due.push({
        id: followUp.id,
        enrollmentId: record.enrollmentId,
        studentId: record.studentId,
        studentName: record.studentName,
        courseName: record.courseName,
        batchName: record.batchName,
        remainingPaise: Math.max(0, record.netAmountPaise - record.paidPaise),
        channel: followUp.channel,
        note: followUp.note,
        nextFollowUpOn: followUp.nextFollowUpOn,
        daysOverdue: daysBetween(followUp.nextFollowUpOn, today),
      });
    }
    return due.sort(
      (a, b) =>
        a.nextFollowUpOn.localeCompare(b.nextFollowUpOn) ||
        a.studentName.localeCompare(b.studentName),
    );
  }

  async history(
    actor: FeeDuesActor,
    enrollmentId: string,
  ): Promise<FeeFollowUpHistoryView> {
    const found = await this.deps.reader.history(
      actor.workspaceId,
      enrollmentId,
    );
    if (found == null) throw new EnrollmentNotFoundError();
    return {
      enrollmentId,
      remainingPaise: found.remainingPaise,
      items: await this.views(found.followUps),
    };
  }

  async views(followUps: FeeFollowUpProps[]): Promise<FeeFollowUpView[]> {
    const names = await this.deps.names.displayNames(
      followUps.flatMap(namedUserIds),
    );
    return followUps.map((item) => toFollowUpView(item, names));
  }

  async view(followUp: FeeFollowUpProps): Promise<FeeFollowUpView> {
    const names = await this.deps.names.displayNames(namedUserIds(followUp));
    return toFollowUpView(followUp, names);
  }
}

/** The Users a Fee Follow-up names: who logged it and who last edited it. */
function namedUserIds(item: FeeFollowUpProps): string[] {
  return item.editedByUserId == null
    ? [item.loggedByUserId]
    : [item.loggedByUserId, item.editedByUserId];
}

function toFollowUpView(
  item: FeeFollowUpProps,
  names: Map<string, string>,
): FeeFollowUpView {
  const named = (userId: string) => ({
    userId,
    name: names.get(userId) ?? "User",
  });
  return {
    id: item.id,
    enrollmentId: item.enrollmentId,
    channel: item.channel,
    note: item.note,
    nextFollowUpOn: item.nextFollowUpOn,
    open: item.closedAt == null,
    loggedAt: item.createdAt.toISOString(),
    loggedBy: named(item.loggedByUserId),
    editedAt: item.editedAt?.toISOString() ?? null,
    editedBy: item.editedByUserId == null ? null : named(item.editedByUserId),
    closedAt: item.closedAt?.toISOString() ?? null,
    closeReason: item.closeReason,
  };
}

function toDueView(record: FeeDueRecord, today: string): FeeDueView {
  const standing = assessFeeDues({
    netAmountPaise: record.netAmountPaise,
    paidPaise: record.paidPaise,
    dueDates: record.dueDates,
    today,
  });
  return {
    enrollmentId: record.enrollmentId,
    studentId: record.studentId,
    studentName: record.studentName,
    courseId: record.courseId,
    courseName: record.courseName,
    batchId: record.batchId,
    batchName: record.batchName,
    enrollmentEnded: record.endedAt != null,
    remainingPaise: standing.remainingPaise,
    overduePaise: standing.overduePaise,
    overdue: standing.overdue,
    dueSoon: standing.dueSoon,
    dueDatesClarity: standing.clarity,
    oldestUnpaidDueOn: standing.oldestUnpaidDueOn,
    nextUnpaidDueOn: standing.nextUnpaidDueOn,
    dueDates: [...record.dueDates].sort((a, b) =>
      a.dueOn.localeCompare(b.dueOn),
    ),
    openFollowUp:
      record.openFollowUp == null
        ? null
        : {
            id: record.openFollowUp.id,
            channel: record.openFollowUp.channel,
            nextFollowUpOn: record.openFollowUp.nextFollowUpOn,
          },
  };
}

/** The date a row is chased by: its oldest missed date, else its next one. */
function rowDueOn(row: FeeDueView): string | null {
  return row.oldestUnpaidDueOn ?? row.nextUnpaidDueOn;
}

function byAmountOwed(a: FeeDueView, b: FeeDueView): number {
  return (
    b.remainingPaise - a.remainingPaise ||
    a.studentName.localeCompare(b.studentName)
  );
}

function byDueDate(a: FeeDueView, b: FeeDueView): number {
  const left = rowDueOn(a);
  const right = rowDueOn(b);
  if (left !== right) {
    if (left == null) return 1;
    if (right == null) return -1;
    return left.localeCompare(right);
  }
  return byAmountOwed(a, b);
}
