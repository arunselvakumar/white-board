import {
  AttendanceRegister,
  attendanceDate,
  localDateInTimezone,
} from "../domain/attendance-register";
import { classesOn } from "../domain/class-schedule";
import type {
  AttendanceHistoryItem,
  AttendanceRepository,
} from "../domain/attendance-repository";
import { DomainError } from "../domain/errors";
import type { ClassExceptionsReader } from "./class-change-handlers";
import { decodeListCursor, encodeListCursor } from "./list-cursor";

export type AttendanceActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

export class AttendanceHandlers {
  constructor(
    private readonly store: AttendanceRepository,
    private readonly exceptions: ClassExceptionsReader,
  ) {}

  async open(
    batchId: string,
    actor: AttendanceActor,
    requestedDate?: string,
  ): Promise<AttendanceRegister> {
    const batch = await this.batchForActor(batchId, actor);
    const now = new Date();
    const today = localDateInTimezone(now, batch.timezone);
    const date = requestedDate == null ? today : attendanceDate(requestedDate);
    if (
      date > today ||
      date < localDateInTimezone(batch.createdAt, batch.timezone)
    )
      throw new DomainError(
        "ATTENDANCE_DATE_OUT_OF_RANGE",
        "Attendance date must be between the Batch creation date and today.",
      );
    const existing = await this.store.findByBatchDate(
      batchId,
      actor.workspaceId,
      date,
    );
    if (existing != null) return existing;
    if (batch.closedAt != null)
      throw new DomainError(
        "BATCH_CLOSED",
        "Closed Batches cannot receive Attendance Registers.",
      );
    const [enrollments, { changes, holidays }] = await Promise.all([
      this.store.activeRoster(batchId, actor.workspaceId),
      this.exceptions.forBatches(actor.workspaceId, [batchId]),
    ]);
    // Students with a Class that happens on this date, including Moved Classes.
    const classes = enrollments.map((enrollment) => ({
      enrollment,
      classes: classesOn(
        { batchId, timings: enrollment.timings },
        date,
        changes,
        holidays,
      ),
    }));
    const roster = classes
      .filter(({ classes }) =>
        classes.some((scheduled) => scheduled.status === "scheduled"),
      )
      .map(({ enrollment }) => ({
        enrollmentId: enrollment.enrollmentId,
        studentId: enrollment.studentId,
        studentName: enrollment.studentName,
      }));
    if (
      roster.length === 0 &&
      classes.some(({ classes }) => classes.length > 0)
    )
      throw new DomainError(
        "ATTENDANCE_CLASS_CANCELLED",
        "Every Class on this date was cancelled, moved, or is a Holiday.",
      );
    const register = AttendanceRegister.create({
      id: crypto.randomUUID(),
      workspaceId: actor.workspaceId,
      batchId,
      date,
      timezone: batch.timezone,
      createdByUserId: actor.userId,
      roster,
      now,
    });
    await this.store.create(register);
    return (
      (await this.store.findByBatchDate(batchId, actor.workspaceId, date)) ??
      register
    );
  }

  async get(id: string, actor: AttendanceActor): Promise<AttendanceRegister> {
    const register = await this.store.findById(id, actor.workspaceId);
    if (register == null)
      throw new DomainError(
        "ATTENDANCE_REGISTER_NOT_FOUND",
        "Attendance Register not found.",
      );
    await this.batchForActor(register.batchId, actor);
    return register;
  }

  async save(
    id: string,
    marks: { enrollmentId: string; status: string; note?: string | null }[],
    actor: AttendanceActor,
  ): Promise<AttendanceRegister> {
    const register = await this.get(id, actor);
    const saved = await this.store.saveMarks(
      register.id,
      actor.workspaceId,
      marks,
      actor.userId,
    );
    if (saved == null)
      throw new DomainError(
        "ATTENDANCE_REGISTER_NOT_FOUND",
        "Attendance Register not found.",
      );
    return saved;
  }

  async listBatch(
    query: { batchId: string; limit: number; after?: string; before?: string },
    actor: AttendanceActor,
  ) {
    await this.batchForActor(query.batchId, actor);
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => ({ value: id }));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => ({ value: id }));
    const page = await this.store.listBatch({
      batchId: query.batchId,
      workspaceId: actor.workspaceId,
      limit: query.limit,
      after,
      before,
    });
    return pageWithCursors(page, query);
  }

  async studentHistory(
    query: {
      studentId: string;
      limit: number;
      after?: string;
      before?: string;
    },
    actor: AttendanceActor,
  ) {
    if (actor.role !== "owner")
      throw new DomainError(
        "ATTENDANCE_FORBIDDEN",
        "Owner access is required.",
      );
    if (!(await this.store.studentExists(query.studentId, actor.workspaceId)))
      throw new DomainError("STUDENT_NOT_FOUND", "Student not found.");
    const after =
      query.after == null
        ? undefined
        : decodeListCursor(query.after, (id) => ({ value: id }));
    const before =
      query.before == null
        ? undefined
        : decodeListCursor(query.before, (id) => ({ value: id }));
    const page = await this.store.listStudentHistory({
      studentId: query.studentId,
      workspaceId: actor.workspaceId,
      limit: query.limit,
      after,
      before,
    });
    return pageWithCursors(page, query);
  }

  private async batchForActor(batchId: string, actor: AttendanceActor) {
    const batch = await this.store.findBatch(batchId, actor.workspaceId);
    if (batch == null)
      throw new DomainError("BATCH_NOT_FOUND", "Batch not found.");
    if (
      actor.role === "teacher" &&
      !(await this.store.isAssignedTeacher(
        actor.userId,
        batchId,
        actor.workspaceId,
      ))
    ) {
      throw new DomainError("BATCH_NOT_FOUND", "Batch not found.");
    }
    return batch;
  }
}

function pageWithCursors<T extends { id: string; createdAt: Date }>(
  page: { items: T[]; total: number; hasMore: boolean },
  query: { after?: string; before?: string },
) {
  const first = page.items[0];
  const last = page.items[page.items.length - 1];
  return {
    items: page.items,
    total: page.total,
    nextCursor:
      last != null && (query.before != null || page.hasMore)
        ? encodeListCursor({
            createdAt: last.createdAt,
            id: { value: last.id },
          })
        : null,
    prevCursor:
      first != null &&
      (query.after != null || (query.before != null && page.hasMore))
        ? encodeListCursor({
            createdAt: first.createdAt,
            id: { value: first.id },
          })
        : null,
  };
}

export type StudentAttendanceHistory = AttendanceHistoryItem;
