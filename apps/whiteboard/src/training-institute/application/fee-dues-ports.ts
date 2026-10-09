import type { FeeFollowUp, FeeFollowUpProps } from "../domain/fee-follow-up";
import type { FeePlanDueDate } from "../domain/fee-plan";
import type { OpenFeeFollowUpSummary } from "./fee-dues-views";

/** What the dues rules need to know about one Enrollment. */
export type EnrollmentDuesFacts = {
  enrollmentId: string;
  netAmountPaise: number;
  paidPaise: number;
  /** The Enrollment's Batch timezone; "today" is read there. */
  timezone: string;
};

/** Write side for Fee Follow-ups. */
export type FeeFollowUpStore = {
  /** Runs `work` in one transaction; every lock below lasts until it ends. */
  transaction<T>(work: (store: FeeFollowUpStore) => Promise<T>): Promise<T>;
  /**
   * Locks the Enrollment row, the same row a Fee Payment or Fee Plan change
   * locks, so a follow-up can't be logged on dues that were just cleared.
   */
  lockEnrollment(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<EnrollmentDuesFacts | null>;
  findFollowUp(workspaceId: string, id: string): Promise<FeeFollowUp | null>;
  openFollowUp(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<FeeFollowUp | null>;
  save(followUp: FeeFollowUp): Promise<void>;
};

/** One Enrollment with money owed, before the dues rules are applied. */
export type FeeDueRecord = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  batchId: string;
  batchName: string;
  timezone: string;
  endedAt: Date | null;
  netAmountPaise: number;
  paidPaise: number;
  dueDates: FeePlanDueDate[];
  openFollowUp: (OpenFeeFollowUpSummary & { note: string | null }) | null;
};

export type FeeDuesReader = {
  /** Every live Enrollment in the Workspace whose remaining dues are above zero. */
  enrollmentsWithDues(workspaceId: string): Promise<FeeDueRecord[]>;
  /** Null when the Enrollment isn't in the Workspace. */
  history(
    workspaceId: string,
    enrollmentId: string,
  ): Promise<{ remainingPaise: number; followUps: FeeFollowUpProps[] } | null>;
};

export type UserNames = {
  displayNames(userIds: string[]): Promise<Map<string, string>>;
};
