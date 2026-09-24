import type { WeeklySlot } from "../domain/weekly-timings";

export type DashboardBatchReadModel = {
  id: string;
  name: string;
  courseId: string;
  classMode: string;
  capacity: number;
  enrolledCount: number;
  timings: WeeklySlot[];
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
  todayBatches: DashboardBatchReadModel[];
  recentStudents: DashboardStudentReadModel[];
};
