import type { WeeklySlot } from "../domain/weekly-timings";

export type DashboardBatchReadModel = {
  id: string;
  name: string;
  courseId: string;
  classMode: string;
  capacity: number;
  enrolledCount: number;
  timings: WeeklySlot[];
  /** Classes that happen today after Class Changes and Holidays. */
  todayClasses: { startTime: string; endTime: string; rescheduled: boolean }[];
};

export type DashboardStudentReadModel = {
  id: string;
  name: string;
  phone: string;
  createdAt: Date;
};

export type OwnerDashboardReadModel = {
  activeStudentCount: number;
  outstandingDuesPaise: number;
  /** Open Fee Follow-ups whose next date is today or earlier. */
  feeFollowUpsDueCount: number;
  todayBatches: DashboardBatchReadModel[];
  recentStudents: DashboardStudentReadModel[];
};
