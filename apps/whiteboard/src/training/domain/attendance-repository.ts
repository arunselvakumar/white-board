import type { AttendanceRegister } from "./attendance-register";
import type { ListCursor, ListPage } from "./list";

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
  scheduledRoster(
    batchId: string,
    workspaceId: string,
    weekday: number,
  ): Promise<
    { enrollmentId: string; studentId: string; studentName: string }[]
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
  studentExists(studentId: string, workspaceId: string): Promise<boolean>;
  listStudentHistory(params: {
    studentId: string;
    workspaceId: string;
    limit: number;
    after?: ListCursor<{ value: string }>;
    before?: ListCursor<{ value: string }>;
  }): Promise<ListPage<AttendanceHistoryItem>>;
};
