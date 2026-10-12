// Absence Notices (ADR-0041): the family gives and withdraws notice for
// upcoming Classes; the Owner and Teachers see expected absentees; Teachers
// get a Notification and an email. Whether a notice still applies is worked
// out on read from the schedule.

import { randomUUID } from "node:crypto";

import {
  ABSENCE_NOTICE_HORIZON_DAYS,
  ABSENCE_NOTICE_MAX_CLASSES,
  absenceNote,
  absenceReason,
  assertBeforeClassStarts,
  noticeableClasses,
  noticeStanding,
  type NoticeableClass,
  type NoticeStanding,
} from "../domain/absence-notice";
import {
  addCalendarDays,
  classAt,
  clockMinutes,
  hasStarted,
  localNow,
  type ClassSlotTime,
  type ScheduleSource,
} from "../domain/class-schedule";
import { DomainError } from "../domain/errors";
import type {
  AbsenceNoticeMailer,
  AbsenceNoticeRecord,
  AbsenceNoticeStore,
  NewAbsenceNotice,
  NewNotification,
  NoticeEnrollment,
  UserDirectory,
} from "./absence-notice-ports";
import type {
  AbsenceNoticeClassesView,
  AbsenceNoticeFamily,
  AbsenceNoticeNotificationPayload,
  AbsenceNoticeStaff,
  ExpectedAbsenceClassView,
  ExpectedAbsencesView,
  FamilyAbsenceNoticeView,
  FamilyAbsenceNoticesView,
  GiveAbsenceNoticeInput,
  NoticeClassView,
  NotificationKind,
  PickableClassView,
} from "./absence-notice-views";
import type { ClassExceptions } from "./class-change-handlers";
import {
  EnrollmentNotFoundError,
  StudentNotFoundError,
} from "./not-found-error";

/** Why a Class picked for notice can't have it, in error details. */
export type UnavailableClassStatus =
  | "started"
  | "cancelled"
  | "holiday"
  | "moved"
  | "not_scheduled"
  | "beyond_horizon";

type ClassKey = { enrollmentId: string; date: string; startTime: string };

function keyOf(value: ClassKey): string {
  return `${value.enrollmentId}|${value.date}|${value.startTime}`;
}

function scheduleOf(enrollment: NoticeEnrollment): ScheduleSource {
  return {
    batchId: enrollment.batchId,
    timings: enrollment.timings,
    firstDate: localNow(enrollment.activeFrom, enrollment.timezone).date,
  };
}

function bySlot(
  a: { date: string; startTime: string },
  b: { date: string; startTime: string },
): number {
  return (
    a.date.localeCompare(b.date) ||
    clockMinutes(a.startTime) - clockMinutes(b.startTime)
  );
}

/** UTC calendar date; every timezone's "today" is within a day of it. */
function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function notFound(): DomainError {
  return new DomainError(
    "ABSENCE_NOTICE_NOT_FOUND",
    "Absence Notice not found.",
  );
}

function classView(
  enrollment: NoticeEnrollment,
  slot: ClassSlotTime & { rescheduled: boolean },
): NoticeClassView {
  return {
    enrollmentId: enrollment.id,
    batchId: enrollment.batchId,
    batchName: enrollment.batchName,
    courseName: enrollment.courseName,
    classMode: enrollment.classMode,
    timezone: enrollment.timezone,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    rescheduled: slot.rescheduled,
  };
}

/** A notice's standing and the Class as it stands now. */
function evaluate(
  record: AbsenceNoticeRecord,
  exceptions: ClassExceptions,
): {
  standing: NoticeStanding;
  slot: ClassSlotTime & { rescheduled: boolean };
} {
  const source = scheduleOf(record.enrollment);
  const key = { date: record.date, startTime: record.startTime };
  const found = classAt(source, key, exceptions.changes, exceptions.holidays);
  const standing: NoticeStanding = record.enrollment.active
    ? noticeStanding(source, key, exceptions.changes, exceptions.holidays)
    : { status: "not_scheduled" };
  return {
    standing,
    slot: {
      date: record.date,
      startTime: record.startTime,
      endTime:
        standing.status === "applies" && found != null
          ? found.endTime
          : record.endTime,
      rescheduled: found?.rescheduled ?? false,
    },
  };
}

export class AbsenceNoticeHandlers {
  constructor(
    private readonly deps: {
      store: AbsenceNoticeStore;
      users: UserDirectory;
      mailer: AbsenceNoticeMailer;
      now: () => Date;
    },
  ) {}

  private get store(): AbsenceNoticeStore {
    return this.deps.store;
  }

  /** The Class picker: each linked Student's noticeable Classes. */
  async classes(
    family: AbsenceNoticeFamily,
  ): Promise<AbsenceNoticeClassesView> {
    const now = this.deps.now();
    const students = await this.linkedStudents(family);
    if (students.length === 0) return { students: [] };
    const studentIds = students.map((student) => student.id);
    const enrollments = await this.store.activeEnrollments(
      family.workspaceId,
      studentIds,
    );
    const [exceptions, live] = await Promise.all([
      this.store.classExceptions(
        family.workspaceId,
        enrollments.map((enrollment) => enrollment.batchId),
      ),
      enrollments.length === 0
        ? []
        : this.store.liveNotices(family.workspaceId, {
            studentIds,
            from: addCalendarDays(utcDate(now), -1),
          }),
    ]);
    const noticeIds = new Map(
      live.map((notice) => [
        keyOf({ ...notice, enrollmentId: notice.enrollment.id }),
        notice.id,
      ]),
    );
    return {
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        classes: enrollments
          .filter((enrollment) => enrollment.studentId === student.id)
          .flatMap((enrollment) =>
            this.noticeable(enrollment, exceptions, now).map(
              (slot): PickableClassView => ({
                ...classView(enrollment, slot),
                noticeId:
                  noticeIds.get(
                    keyOf({ ...slot, enrollmentId: enrollment.id }),
                  ) ?? null,
              }),
            ),
          )
          .sort(
            (a, b) => bySlot(a, b) || a.batchName.localeCompare(b.batchName),
          ),
      })),
    };
  }

  /** One Absence Notice per Class picked; Teachers are told per Batch. */
  async give(
    family: AbsenceNoticeFamily,
    input: GiveAbsenceNoticeInput,
  ): Promise<{ notices: FamilyAbsenceNoticeView[] }> {
    const reason = absenceReason(input.reason);
    const note = absenceNote(input.note);
    if (input.classes.length === 0)
      throw new DomainError(
        "ABSENCE_NOTICE_NO_CLASSES",
        "Pick at least one Class.",
      );
    if (input.classes.length > ABSENCE_NOTICE_MAX_CLASSES)
      throw new DomainError(
        "ABSENCE_NOTICE_TOO_MANY_CLASSES",
        `Pick ${String(ABSENCE_NOTICE_MAX_CLASSES)} Classes or fewer at a time.`,
      );
    const picked = new Set<string>();
    for (const value of input.classes) {
      if (picked.has(keyOf(value)))
        throw new DomainError(
          "ABSENCE_NOTICE_DUPLICATE_CLASS",
          "Each Class can be picked only once.",
        );
      picked.add(keyOf(value));
    }

    const student = (await this.linkedStudents(family)).find(
      (candidate) => candidate.id === input.studentId,
    );
    if (student == null) throw new StudentNotFoundError();
    const enrollments = await this.store.activeEnrollments(family.workspaceId, [
      student.id,
    ]);
    const requested = input.classes.map((value) => {
      const enrollment = enrollments.find(
        (candidate) => candidate.id === value.enrollmentId,
      );
      if (enrollment == null) throw new EnrollmentNotFoundError();
      return { ...value, enrollment };
    });
    const batchIds = [
      ...new Set(requested.map((value) => value.enrollment.batchId)),
    ];
    const givenByName = await this.deps.users.displayName(family.userId);

    const { notices, notifications } = await this.store.withBatchLocks(
      family.workspaceId,
      batchIds,
      async (store) => {
        // Read under the lock: a Class Change can't land in between.
        const now = this.deps.now();
        const exceptions = await store.classExceptions(
          family.workspaceId,
          batchIds,
        );
        const noticeable = new Map<string, NoticeableClass[]>();
        const started: (ClassKey & { status: UnavailableClassStatus })[] = [];
        const unavailable: typeof started = [];
        const slots = requested.map((value) => {
          const { enrollment } = value;
          const local = localNow(now, enrollment.timezone);
          const key: ClassKey = {
            enrollmentId: enrollment.id,
            date: value.date,
            startTime: value.startTime,
          };
          if (hasStarted(key, local)) {
            started.push({ ...key, status: "started" });
            return null;
          }
          let classes = noticeable.get(enrollment.id);
          if (classes == null) {
            classes = this.noticeable(enrollment, exceptions, now);
            noticeable.set(enrollment.id, classes);
          }
          const slot = classes.find(
            (candidate) =>
              candidate.date === key.date &&
              candidate.startTime === key.startTime,
          );
          if (slot == null) {
            unavailable.push({
              ...key,
              status: unavailableStatus(enrollment, key, exceptions, local),
            });
            return null;
          }
          return { enrollment, slot };
        });
        if (started.length > 0)
          throw new DomainError(
            "ABSENCE_NOTICE_CLASS_STARTED",
            started.length === 1
              ? "This Class has already started."
              : "Some of these Classes have already started.",
            { classes: started },
          );
        if (unavailable.length > 0)
          throw new DomainError(
            "ABSENCE_NOTICE_CLASS_UNAVAILABLE",
            "Notice can only be given for upcoming Classes that are still scheduled.",
            { classes: unavailable },
          );
        const picks = slots.filter((value) => value != null);

        const dates = picks.map(({ slot }) => slot.date).sort();
        const existing = (
          await store.liveNotices(family.workspaceId, {
            studentIds: [student.id],
            from: dates[0] ?? utcDate(now),
            to: dates.at(-1) ?? utcDate(now),
          })
        ).filter((notice) =>
          picked.has(keyOf({ ...notice, enrollmentId: notice.enrollment.id })),
        );
        if (existing.length > 0)
          throw new DomainError(
            "ABSENCE_NOTICE_ALREADY_GIVEN",
            "Notice has already been given for some of these Classes.",
            {
              classes: existing.map((notice) => ({
                enrollmentId: notice.enrollment.id,
                date: notice.date,
                startTime: notice.startTime,
                noticeId: notice.id,
              })),
            },
          );

        const created = picks.map(({ enrollment, slot }) => {
          const notice: NewAbsenceNotice = {
            id: randomUUID(),
            studentId: student.id,
            enrollmentId: enrollment.id,
            batchId: enrollment.batchId,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            reason,
            note,
            givenAt: now,
            givenByUserId: family.userId,
            givenByRole: family.role,
            givenByName,
          };
          return { notice, enrollment, slot };
        });
        await store.insertNotices(
          family.workspaceId,
          created.map(({ notice }) => notice),
        );

        const payloads = batchIds.map((batchId) => {
          const ofBatch = picks.filter(
            ({ enrollment }) => enrollment.batchId === batchId,
          );
          const enrollment = ofBatch[0]?.enrollment;
          if (enrollment == null) throw new Error("A Batch with no Classes.");
          return this.payload(
            student,
            enrollment,
            ofBatch.map(({ slot }) => slot),
            { reason, note, by: { role: family.role, name: givenByName } },
          );
        });
        const notifications = await this.notify(
          store,
          family.workspaceId,
          "absence_notice_given",
          payloads,
          now,
        );
        return {
          notices: created,
          notifications,
        };
      },
    );
    await this.email(family.workspaceId, notifications);

    return {
      notices: notices
        .sort((a, b) => bySlot(a.slot, b.slot))
        .map(({ notice, enrollment, slot }) => ({
          id: notice.id,
          studentId: student.id,
          studentName: student.name,
          class: classView(enrollment, slot),
          reason,
          note,
          givenAt: notice.givenAt.toISOString(),
          givenBy: { role: family.role, name: givenByName },
          standing: "applies",
          movedTo: null,
          canWithdraw: true,
        })),
    };
  }

  /** Each linked Student's live notices for Classes not yet started. */
  async list(family: AbsenceNoticeFamily): Promise<FamilyAbsenceNoticesView> {
    const now = this.deps.now();
    const students = await this.linkedStudents(family);
    if (students.length === 0) return { students: [] };
    const records = (
      await this.store.liveNotices(family.workspaceId, {
        studentIds: students.map((student) => student.id),
        from: addCalendarDays(utcDate(now), -1),
      })
    ).filter(
      (record) =>
        !hasStarted(record, localNow(now, record.enrollment.timezone)),
    );
    const exceptions = await this.store.classExceptions(
      family.workspaceId,
      records.map((record) => record.batchId),
    );
    const views = records
      .map((record) => this.familyView(record, exceptions, now))
      .sort(
        (a, b) =>
          bySlot(a.class, b.class) || a.givenAt.localeCompare(b.givenAt),
      );
    return {
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        notices: views.filter((view) => view.studentId === student.id),
      })),
    };
  }

  /**
   * Any Student or Parent linked to the Student can withdraw a live notice
   * until its Class starts. A notice already withdrawn is 409
   * ABSENCE_NOTICE_ALREADY_WITHDRAWN; one for a Student the caller isn't
   * linked to is 404.
   */
  async withdraw(
    family: AbsenceNoticeFamily,
    id: string,
  ): Promise<FamilyAbsenceNoticeView> {
    const students = await this.linkedStudents(family);
    const record = await this.store.findNotice(family.workspaceId, id);
    if (
      record == null ||
      !students.some((student) => student.id === record.studentId)
    )
      throw notFound();
    if (record.withdrawnAt != null) throw alreadyWithdrawn();
    assertBeforeClassStarts(
      record,
      localNow(this.deps.now(), record.enrollment.timezone),
    );
    const byName = await this.deps.users.displayName(family.userId);

    const { exceptions, notifications, now } = await this.store.withBatchLocks(
      family.workspaceId,
      [record.batchId],
      async (store) => {
        const now = this.deps.now();
        assertBeforeClassStarts(
          record,
          localNow(now, record.enrollment.timezone),
        );
        const withdrawn = await store.withdrawNotice(
          family.workspaceId,
          id,
          { userId: family.userId, role: family.role },
          now,
        );
        if (!withdrawn) throw alreadyWithdrawn();
        const exceptions = await store.classExceptions(family.workspaceId, [
          record.batchId,
        ]);
        const { standing, slot } = evaluate(record, exceptions);
        // Teachers hear about a withdrawal only if the notice still applied.
        const notifications =
          standing.status === "applies"
            ? await this.notify(
                store,
                family.workspaceId,
                "absence_notice_withdrawn",
                [
                  this.payload(
                    { id: record.studentId, name: record.studentName },
                    record.enrollment,
                    [slot],
                    {
                      reason: record.reason,
                      note: record.note,
                      by: { role: family.role, name: byName },
                    },
                  ),
                ],
                now,
              )
            : [];
        return { exceptions, notifications, now };
      },
    );
    await this.email(family.workspaceId, notifications);
    return {
      ...this.familyView(record, exceptions, now),
      canWithdraw: false,
    };
  }

  /**
   * Upcoming Classes (next 60 days, not started) with notices that apply.
   * The Owner sees every Batch; a Teacher only assigned Batches.
   */
  async expected(staff: AbsenceNoticeStaff): Promise<ExpectedAbsencesView> {
    const now = this.deps.now();
    let batchIds: string[] | undefined;
    if (staff.role === "teacher") {
      batchIds = await this.store.assignedBatchIds(
        staff.workspaceId,
        staff.userId,
      );
      if (batchIds.length === 0) return { classes: [] };
    }
    const today = utcDate(now);
    const records = (
      await this.store.liveNotices(staff.workspaceId, {
        batchIds,
        from: addCalendarDays(today, -1),
        to: addCalendarDays(today, ABSENCE_NOTICE_HORIZON_DAYS + 1),
      })
    ).filter((record) => {
      const local = localNow(now, record.enrollment.timezone);
      return (
        !hasStarted(record, local) &&
        record.date <= addCalendarDays(local.date, ABSENCE_NOTICE_HORIZON_DAYS)
      );
    });
    const exceptions = await this.store.classExceptions(
      staff.workspaceId,
      records.map((record) => record.batchId),
    );
    const groups = new Map<string, ExpectedAbsenceClassView>();
    for (const record of records) {
      const { standing, slot } = evaluate(record, exceptions);
      if (standing.status !== "applies") continue;
      const key = `${record.batchId}|${record.date}|${record.startTime}`;
      let group = groups.get(key);
      if (group == null) {
        group = {
          batchId: record.batchId,
          batchName: record.enrollment.batchName,
          courseName: record.enrollment.courseName,
          timezone: record.enrollment.timezone,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          rescheduled: slot.rescheduled,
          absentees: [],
        };
        groups.set(key, group);
      }
      group.absentees.push({
        noticeId: record.id,
        studentId: record.studentId,
        studentName: record.studentName,
        reason: record.reason,
        note: record.note,
        givenAt: record.givenAt.toISOString(),
        givenBy: { role: record.givenBy.role, name: record.givenBy.name },
      });
    }
    return {
      classes: [...groups.values()]
        .map((group) => ({
          ...group,
          absentees: group.absentees.sort(
            (a, b) =>
              a.studentName.localeCompare(b.studentName) ||
              a.studentId.localeCompare(b.studentId),
          ),
        }))
        .sort(
          (a, b) =>
            bySlot(a, b) ||
            a.batchName.localeCompare(b.batchName) ||
            a.batchId.localeCompare(b.batchId),
        ),
    };
  }

  private linkedStudents(family: AbsenceNoticeFamily) {
    return this.store.linkedStudents(
      family.workspaceId,
      family.role,
      family.verifiedEmails,
    );
  }

  private noticeable(
    enrollment: NoticeEnrollment,
    exceptions: ClassExceptions,
    now: Date,
  ): NoticeableClass[] {
    return noticeableClasses(
      scheduleOf(enrollment),
      exceptions.changes,
      exceptions.holidays,
      localNow(now, enrollment.timezone),
    );
  }

  private familyView(
    record: AbsenceNoticeRecord,
    exceptions: ClassExceptions,
    now: Date,
  ): FamilyAbsenceNoticeView {
    const { standing, slot } = evaluate(record, exceptions);
    return {
      id: record.id,
      studentId: record.studentId,
      studentName: record.studentName,
      class: classView(record.enrollment, slot),
      reason: record.reason,
      note: record.note,
      givenAt: record.givenAt.toISOString(),
      givenBy: { role: record.givenBy.role, name: record.givenBy.name },
      standing: standing.status,
      movedTo: standing.status === "moved" ? standing.movedTo : null,
      canWithdraw:
        record.withdrawnAt == null &&
        !hasStarted(record, localNow(now, record.enrollment.timezone)),
    };
  }

  private payload(
    student: { id: string; name: string },
    enrollment: NoticeEnrollment,
    classes: ClassSlotTime[],
    notice: Pick<AbsenceNoticeNotificationPayload, "reason" | "note" | "by">,
  ): AbsenceNoticeNotificationPayload {
    return {
      studentId: student.id,
      studentName: student.name,
      batchId: enrollment.batchId,
      batchName: enrollment.batchName,
      courseName: enrollment.courseName,
      timezone: enrollment.timezone,
      classes: classes
        .map(({ date, startTime, endTime }) => ({ date, startTime, endTime }))
        .sort(bySlot),
      reason: notice.reason,
      note: notice.note,
      by: notice.by,
    };
  }

  /** One Notification per assigned Teacher per Batch, in the transaction. */
  private async notify(
    store: AbsenceNoticeStore,
    workspaceId: string,
    kind: NotificationKind,
    payloads: AbsenceNoticeNotificationPayload[],
    now: Date,
  ): Promise<NewNotification[]> {
    const teachers = await store.batchTeacherUsers(
      workspaceId,
      payloads.map((payload) => payload.batchId),
    );
    const seen = new Set<string>();
    const notifications = payloads.flatMap((payload) =>
      teachers
        .filter((teacher) => teacher.batchId === payload.batchId)
        .flatMap((teacher): NewNotification[] => {
          const key = `${payload.batchId}|${teacher.userId}`;
          if (seen.has(key)) return [];
          seen.add(key);
          return [
            {
              id: randomUUID(),
              recipientUserId: teacher.userId,
              kind,
              payload,
              createdAt: now,
            },
          ];
        }),
    );
    if (notifications.length > 0)
      await store.insertNotifications(workspaceId, notifications);
    return notifications;
  }

  /** After the commit: a failed email is logged, never the family's error. */
  private async email(
    workspaceId: string,
    notifications: readonly NewNotification[],
  ): Promise<void> {
    if (notifications.length === 0) return;
    let emails: Map<string, string>;
    try {
      emails = await this.deps.users.memberEmails(
        workspaceId,
        notifications.map((notification) => notification.recipientUserId),
      );
    } catch (error) {
      console.error("Absence Notice emails were not sent.", error);
      return;
    }
    const results = await Promise.allSettled(
      notifications.flatMap((notification) => {
        const to = emails.get(notification.recipientUserId);
        return to == null
          ? []
          : [
              this.deps.mailer.send({
                to,
                kind: notification.kind,
                payload: notification.payload,
              }),
            ];
      }),
    );
    for (const result of results)
      if (result.status === "rejected")
        console.error("An Absence Notice email failed.", result.reason);
  }
}

function unavailableStatus(
  enrollment: NoticeEnrollment,
  key: { date: string; startTime: string },
  exceptions: ClassExceptions,
  local: { date: string },
): UnavailableClassStatus {
  if (key.date > addCalendarDays(local.date, ABSENCE_NOTICE_HORIZON_DAYS))
    return "beyond_horizon";
  const standing = noticeStanding(
    scheduleOf(enrollment),
    key,
    exceptions.changes,
    exceptions.holidays,
  );
  return standing.status === "applies" ? "not_scheduled" : standing.status;
}

function alreadyWithdrawn(): DomainError {
  return new DomainError(
    "ABSENCE_NOTICE_ALREADY_WITHDRAWN",
    "This Absence Notice has already been withdrawn.",
  );
}
