import type { DueDatesClarity } from "../domain/fee-dues";
import type {
  FeeFollowUpChannel,
  FeeFollowUpCloseReason,
} from "../domain/fee-follow-up";
import type { FeePlanDueDate } from "../domain/fee-plan";

/** The Owner acting in the Active Workspace. Fee chasing is Owner-only. */
export type FeeDuesActor = { workspaceId: string; userId: string };

export const FEE_DUES_FILTERS = ["overdue", "due_soon", "all"] as const;
export type FeeDuesFilter = (typeof FEE_DUES_FILTERS)[number];

export const FEE_DUES_SORTS = ["amount", "due_date"] as const;
export type FeeDuesSort = (typeof FEE_DUES_SORTS)[number];

export type OpenFeeFollowUpSummary = {
  id: string;
  channel: FeeFollowUpChannel;
  nextFollowUpOn: string | null;
};

export type FeeDueView = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchName: string;
  /** Ended Enrollments still appear while money is owed (ADR-0039 §3). */
  enrollmentEnded: boolean;
  remainingPaise: number;
  overduePaise: number;
  overdue: boolean;
  dueSoon: boolean;
  dueDatesClarity: DueDatesClarity;
  oldestUnpaidDueOn: string | null;
  nextUnpaidDueOn: string | null;
  /** The plan's dates, shown as a guide when they're unclear. */
  dueDates: FeePlanDueDate[];
  openFollowUp: OpenFeeFollowUpSummary | null;
};

export type FeeDuesView = {
  filter: FeeDuesFilter;
  sort: FeeDuesSort;
  items: FeeDueView[];
  counts: { overdue: number; dueSoon: number; all: number };
  /** Across every Enrollment with a balance, whatever the filter. */
  totalRemainingPaise: number;
};

export type FeeFollowUpDueView = {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseName: string;
  batchName: string;
  remainingPaise: number;
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string;
  /** 0 when due today; more when the date has passed. */
  daysOverdue: number;
};

export type UserNameView = { userId: string; name: string };

export type FeeFollowUpView = {
  id: string;
  enrollmentId: string;
  channel: FeeFollowUpChannel;
  note: string | null;
  nextFollowUpOn: string | null;
  open: boolean;
  /** ISO date-times. */
  loggedAt: string;
  loggedBy: UserNameView;
  editedAt: string | null;
  editedBy: UserNameView | null;
  closedAt: string | null;
  closeReason: FeeFollowUpCloseReason | null;
};

export type FeeFollowUpHistoryView = {
  enrollmentId: string;
  remainingPaise: number;
  /** Newest first. */
  items: FeeFollowUpView[];
};
