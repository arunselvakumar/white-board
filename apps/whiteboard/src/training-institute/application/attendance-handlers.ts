import {
  AttendanceRegister,
  attendanceDate,
  localDateInTimezone,
} from "../domain/attendance-register";
import { noticeStanding } from "../domain/absence-notice";
import { classesOn, clockMinutes } from "../domain/class-schedule";
import type {
  AttendanceHistoryItem,
  AttendanceNoticeRecord,
  AttendanceRepository,
} from "../domain/attendance-repository";
import { DomainError } from "../domain/errors";
import type { RegisterNoticeView } from "./absence-notice-views";
import type { ClassExceptionsReader } from "./class-change-handlers";
import { decodeListCursor, encodeListCursor } from "./list-cursor";

export type AttendanceActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "teacher";
};

/**
 * A Register with the Absence Notice flag for each Enrollment that has a live
 * notice for one of that day's Classes that still applies (ADR-0041). The
 * marks themselves are untouched: a notice never marks Attendance.
 */
export type AttendanceRegisterView = {
  register: AttendanceRegister;
  notices: ReadonlyMap<string, RegisterNoticeView>;
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
  ): Promise<AttendanceRegisterView> {
    const register = await this.openRegister(batchId, actor, requestedDate);
    return this.withNotices(register, actor.workspaceId);
  }

  private async openRegister(
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

  async get(
    id: string,
    actor: AttendanceActor,
  ): Promise<AttendanceRegisterView> {
    return this.withNotices(
      await this.registerFor(id, actor),
      actor.workspaceId,
    );
  }

  private async registerFor(
    id: string,
    actor: AttendanceActor,
  ): Promise<AttendanceRegister> {
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
  ): Promise<AttendanceRegisterView> {
    const register = await this.registerFor(id, actor);
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
    return this.withNotices(saved, actor.workspaceId);
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
    const notices = await this.noticesFor(
      query.batchId,
      actor.workspaceId,
      page.items.map((register) => register.date),
    );
    return {
      ...pageWithCursors(page, query),
      items: page.items.map((register) => ({
        register,
        notices: notices.get(register.date) ?? new Map(),
      })),
    };
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
    const [page, summary] = await Promise.all([
      this.store.listStudentHistory({
        studentId: query.studentId,
        workspaceId: actor.workspaceId,
        limit: query.limit,
        after,
        before,
      }),
      this.store.studentSummary(query.studentId, actor.workspaceId),
    ]);
    return { ...pageWithCursors(page, query), summary };
  }

  private async withNotices(
    register: AttendanceRegister,
    workspaceId: string,
  ): Promise<AttendanceRegisterView> {
    const notices = await this.noticesFor(register.batchId, workspaceId, [
      register.date,
    ]);
    return { register, notices: notices.get(register.date) ?? new Map() };
  }

  /**
   * Notices that apply, by Register date and then Enrollment. A notice applies
   * while its Enrollment is active and its Class is still scheduled at that
   * date and start time; a Cancelled Class, a Holiday, or a Moved Class drops
   * it. With notices for two Classes on one day, the earlier Class's is shown.
   */
  private async noticesFor(
    batchId: string,
    workspaceId: string,
    dates: readonly string[],
  ): Promise<Map<string, Map<string, RegisterNoticeView>>> {
    const result = new Map<string, Map<string, RegisterNoticeView>>();
    const records = await this.store.liveNotices(batchId, workspaceId, [
      ...new Set(dates),
    ]);
    const candidates = records.filter(
      (
        record,
      ): record is AttendanceNoticeRecord & {
        timings: NonNullable<AttendanceNoticeRecord["timings"]>;
      } => record.timings != null,
    );
    if (candidates.length === 0) return result;
    const { changes, holidays } = await this.exceptions.forBatches(
      workspaceId,
      [batchId],
    );
    const applying = candidates
      .filter(
        (record) =>
          noticeStanding(
            { batchId, timings: record.timings },
            record,
            changes,
            holidays,
          ).status === "applies",
      )
      .sort((a, b) => clockMinutes(a.startTime) - clockMinutes(b.startTime));
    for (const record of applying) {
      const byEnrollment =
        result.get(record.date) ?? new Map<string, RegisterNoticeView>();
      result.set(record.date, byEnrollment);
      if (byEnrollment.has(record.enrollmentId)) continue;
      byEnrollment.set(record.enrollmentId, {
        noticeId: record.id,
        reason: record.reason,
        note: record.note,
        givenAt: record.givenAt.toISOString(),
        givenBy: { role: record.givenByRole, name: record.givenByName },
      });
    }
    return result;
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
