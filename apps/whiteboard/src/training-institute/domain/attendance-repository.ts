import type { AbsenceGiverRole, AbsenceReason } from "./absence-notice";
import type {
  AttendanceRegister,
  AttendanceSummary,
} from "./attendance-register";
import type { ListCursor, ListPage } from "./list";
import type { WeeklySlot } from "./weekly-timings";

export type AttendanceBatch = {
  id: string;
  timezone: string;
  timings: unknown;
  closedAt: Date | null;
  createdAt: Date;
};

export type AttendanceHistoryItem = {
  id: string;
  registerId: string;
  batchId: string;
  batchName: string;
  date: string;
  status: string;
  note: string | null;
  createdAt: Date;
};

/**
 * A live (not withdrawn) Absence Notice for a Register's date, with the
 * Enrollment's effective weekly Timings while it is active in the Batch, or
 * null once it isn't (then the notice no longer applies).
 */
export type AttendanceNoticeRecord = {
  id: string;
  enrollmentId: string;
  date: string;
  startTime: string;
  reason: AbsenceReason;
  note: string | null;
  givenAt: Date;
  givenByRole: AbsenceGiverRole;
  givenByName: string;
  timings: WeeklySlot[] | null;
};

export type AttendanceRepository = {
  findBatch(
    batchId: string,
    workspaceId: string,
  ): Promise<AttendanceBatch | null>;
  isAssignedTeacher(
    userId: string,
    batchId: string,
    workspaceId: string,
  ): Promise<boolean>;
  findByBatchDate(
    batchId: string,
    workspaceId: string,
    date: string,
  ): Promise<AttendanceRegister | null>;
  /** Active Enrollments with their effective weekly Timings. */
  activeRoster(
    batchId: string,
    workspaceId: string,
  ): Promise<
    {
      enrollmentId: string;
      studentId: string;
      studentName: string;
      timings: WeeklySlot[];
    }[]
  >;
  create(register: AttendanceRegister): Promise<void>;
  findById(id: string, workspaceId: string): Promise<AttendanceRegister | null>;
  saveMarks(
    id: string,
    workspaceId: string,
    marks: { enrollmentId: string; status: string; note?: string | null }[],
    userId: string,
  ): Promise<AttendanceRegister | null>;
  listBatch(params: {
    batchId: string;
    workspaceId: string;
    limit: number;
    after?: ListCursor<{ value: string }>;
    before?: ListCursor<{ value: string }>;
  }): Promise<ListPage<AttendanceRegister>>;
  /** Live Absence Notices for the Batch on any of these local dates. */
  liveNotices(
    batchId: string,
    workspaceId: string,
    dates: readonly string[],
  ): Promise<AttendanceNoticeRecord[]>;
  studentExists(studentId: string, workspaceId: string): Promise<boolean>;
  /** Counts over every mark of the Student, across all Registers. */
  studentSummary(
    studentId: string,
    workspaceId: string,
  ): Promise<AttendanceSummary>;
  listStudentHistory(params: {
    studentId: string;
    workspaceId: string;
    limit: number;
    after?: ListCursor<{ value: string }>;
    before?: ListCursor<{ value: string }>;
  }): Promise<ListPage<AttendanceHistoryItem>>;
};
