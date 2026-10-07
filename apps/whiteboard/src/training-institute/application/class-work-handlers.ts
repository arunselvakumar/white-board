import { randomUUID } from "node:crypto";

import {
  addCalendarDays,
  classesOn,
  clockMinutes,
  localNow,
  type ClassChangeFact,
  type HolidayFact,
  type ScheduleSource,
} from "../domain/class-schedule";
import {
  attachmentCount,
  attachmentName,
  CLASS_DATE_LOOKAHEAD_DAYS,
  CLASS_DATE_LOOKBACK_DAYS,
  canSeeItem,
  familyHomeworkStatus,
  homeworkContent,
  isLate,
  isOverdue,
  owesHomework,
  remark,
  studyMaterialContent,
  submissionNote,
  UNATTACHED_UPLOAD_LIMIT,
  UNATTACHED_UPLOAD_TTL_MS,
  type BatchAccess,
} from "../domain/class-work";
import { DomainError } from "../domain/errors";
import { attachmentMimeType, checkAttachmentFile } from "./attachment-file";
import type {
  AttachmentOwner,
  BatchEnrollmentRecord,
  ClassWorkBatch,
  ClassWorkStore,
  HomeworkRecord,
  PosterRecord,
  StudyMaterialRecord,
  SubmissionRecord,
} from "./class-work-ports";
import type {
  AttachmentMimeType,
  AttachmentView,
  BatchClassWorkView,
  ClassDateView,
  ClassWorkFamily,
  ClassWorkStaff,
  FamilyBatchView,
  FamilyClassWorkView,
  FamilyHomeworkView,
  FamilyStudyMaterialView,
  HomeworkCountsView,
  HomeworkRosterRowView,
  HomeworkSubmissionsView,
  HomeworkView,
  StaffHomeworkView,
  StudyMaterialView,
  SubmissionView,
} from "./class-work-views";
import { BatchNotFoundError } from "./not-found-error";

export type ClassWorkMember = ClassWorkStaff | ClassWorkFamily;

export type StudyMaterialInput = {
  title: string;
  note?: string | null;
  linkUrl?: string | null;
  classDate?: string | null;
  attachmentIds?: readonly string[];
};

export type HomeworkInput = {
  title: string;
  instructions: string;
  classDate: string;
  dueOn: string;
  attachmentIds?: readonly string[];
};

export type SubmitHomeworkInput = {
  studentId: string;
  note?: string | null;
  attachmentIds?: readonly string[];
};

function forbidden(): DomainError {
  return new DomainError(
    "CLASS_WORK_FORBIDDEN",
    "Only the Owner and Teachers assigned to this Batch can do this.",
  );
}

function studyMaterialNotFound(): DomainError {
  return new DomainError(
    "STUDY_MATERIAL_NOT_FOUND",
    "Study Material not found.",
  );
}

function homeworkNotFound(): DomainError {
  return new DomainError("HOMEWORK_NOT_FOUND", "Homework not found.");
}

function attachmentNotFound(): DomainError {
  return new DomainError("ATTACHMENT_NOT_FOUND", "File not found.");
}

function isStaff(member: ClassWorkMember): member is ClassWorkStaff {
  return member.role === "owner" || member.role === "teacher";
}

function attachmentView(attachment: AttachmentView): AttachmentView {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
  };
}

function postedByView(poster: PosterRecord): StudyMaterialView["postedBy"] {
  return { role: poster.role, teacherName: poster.teacherName };
}

function studyMaterialView(record: StudyMaterialRecord): StudyMaterialView {
  return {
    id: record.id,
    batchId: record.batchId,
    title: record.title,
    note: record.note,
    linkUrl: record.linkUrl,
    classDate: record.classDate,
    postedBy: postedByView(record.postedBy),
    postedAt: record.postedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    removedAt: record.removedAt?.toISOString() ?? null,
    attachments: record.attachments.map(attachmentView),
  };
}

function homeworkView(record: HomeworkRecord): HomeworkView {
  return {
    id: record.id,
    batchId: record.batchId,
    title: record.title,
    instructions: record.instructions,
    classDate: record.classDate,
    dueOn: record.dueOn,
    postedBy: postedByView(record.postedBy),
    postedAt: record.postedAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    removedAt: record.removedAt?.toISOString() ?? null,
    attachments: record.attachments.map(attachmentView),
  };
}

function submissionView(
  record: SubmissionRecord,
  dueOn: string,
  timezone: string,
): SubmissionView {
  return {
    id: record.id,
    note: record.note,
    submittedAt: record.submittedAt.toISOString(),
    submittedBy: record.submittedByRole,
    updatedAt: record.updatedAt.toISOString(),
    late: isLate(record.submittedAt, dueOn, timezone),
    checkedAt: record.checkedAt?.toISOString() ?? null,
    remark: record.remark,
    attachments: record.attachments.map(attachmentView),
  };
}

function batchView(batch: ClassWorkBatch): BatchClassWorkView["batch"] {
  return {
    id: batch.id,
    name: batch.name,
    courseName: batch.courseName,
    classMode: batch.classMode,
    timezone: batch.timezone,
    closed: batch.closed,
  };
}

/** Whether a Student is in the Batch now, ignoring a closed Batch. */
type RosterStudent = { name: string; inBatch: boolean; start: string | null };

function rosterStudents(
  enrollments: readonly BatchEnrollmentRecord[],
  timezone: string,
): Map<string, RosterStudent> {
  const students = new Map<string, RosterStudent>();
  for (const enrollment of enrollments) {
    const active =
      enrollment.endedAt == null && enrollment.studentDroppedAt == null;
    const start = localNow(enrollment.createdAt, timezone).date;
    const current = students.get(enrollment.studentId);
    if (current == null) {
      students.set(enrollment.studentId, {
        name: enrollment.studentName,
        inBatch: active,
        start: active ? start : null,
      });
    } else if (active) {
      current.inBatch = true;
      current.start =
        current.start == null || start < current.start ? start : current.start;
    }
  }
  return students;
}

const ROSTER_ORDER = { not_submitted: 0, late: 1, submitted: 2 } as const;

function roster(
  homework: HomeworkRecord,
  timezone: string,
  students: ReadonlyMap<string, RosterStudent>,
  submissions: readonly SubmissionRecord[],
): { rows: HomeworkRosterRowView[]; counts: HomeworkCountsView } {
  const rows: HomeworkRosterRowView[] = [];
  const submitted = new Set<string>();
  for (const record of submissions) {
    if (record.homeworkId !== homework.id) continue;
    submitted.add(record.studentId);
    const submission = submissionView(record, homework.dueOn, timezone);
    const student = students.get(record.studentId);
    rows.push({
      studentId: record.studentId,
      studentName: student?.name ?? record.studentName,
      status: submission.late ? "late" : "submitted",
      inBatch: student?.inBatch ?? false,
      submission,
    });
  }
  for (const [studentId, student] of students) {
    if (
      submitted.has(studentId) ||
      !student.inBatch ||
      student.start == null ||
      !owesHomework({ start: student.start, endedAt: null }, homework.dueOn)
    )
      continue;
    rows.push({
      studentId,
      studentName: student.name,
      status: "not_submitted",
      inBatch: true,
      submission: null,
    });
  }
  rows.sort(
    (a, b) =>
      ROSTER_ORDER[a.status] - ROSTER_ORDER[b.status] ||
      a.studentName.localeCompare(b.studentName) ||
      a.studentId.localeCompare(b.studentId),
  );
  return {
    rows,
    counts: {
      submitted: rows.filter((row) => row.status === "submitted").length,
      late: rows.filter((row) => row.status === "late").length,
      notSubmitted: rows.filter((row) => row.status === "not_submitted").length,
      checked: rows.filter((row) => row.submission?.checkedAt != null).length,
    },
  };
}

type FamilyAccess = {
  students: { id: string; name: string }[];
  /** Student id → Batch id → access. */
  access: Map<string, Map<string, BatchAccess>>;
  batches: Map<string, FamilyBatchView>;
};

/** Commands and reads for Study Material, Homework, and Submissions (ADR-0033). */
export class ClassWorkHandlers {
  private readonly newId: () => string;

  constructor(
    private readonly deps: {
      store: ClassWorkStore;
      now: () => Date;
      newId?: () => string;
    },
  ) {
    this.newId = deps.newId ?? randomUUID;
  }

  private get store(): ClassWorkStore {
    return this.deps.store;
  }

  // ---------------------------------------------------------------- staff

  /** The Batch, and who posts: the Owner, or a Teacher assigned to it. */
  private async staffBatch(
    actor: ClassWorkStaff,
    batchId: string,
    store: ClassWorkStore = this.store,
  ): Promise<{ batch: ClassWorkBatch; poster: PosterRecord }> {
    const batch = await store.batch(actor.workspaceId, batchId);
    if (batch == null) throw new BatchNotFoundError();
    if (actor.role === "owner")
      return {
        batch,
        poster: {
          userId: actor.userId,
          role: "owner",
          teacherId: null,
          teacherName: null,
        },
      };
    const teacher = await store.activeTeacherForUser(
      actor.workspaceId,
      actor.userId,
    );
    if (
      teacher == null ||
      !(await store.isAssigned(actor.workspaceId, teacher.id, batchId))
    )
      throw forbidden();
    return {
      batch,
      poster: {
        userId: actor.userId,
        role: "teacher",
        teacherId: teacher.id,
        teacherName: teacher.name,
      },
    };
  }

  private static assertOpen(batch: ClassWorkBatch): void {
    if (batch.closed)
      throw new DomainError(
        "BATCH_CLOSED",
        "This Batch is closed. Nothing new can be posted or changed.",
      );
  }

  /** Schedules whose Classes count as this Batch's Class dates. */
  private async scheduleSources(
    workspaceId: string,
    batch: ClassWorkBatch,
  ): Promise<{
    sources: (ScheduleSource & { lastDate: string | null })[];
    changes: ClassChangeFact[];
    holidays: HolidayFact[];
  }> {
    const [studentTimings, exceptions] = await Promise.all([
      this.store.studentTimings(workspaceId, batch.id),
      this.store.classExceptions(workspaceId, batch.id),
    ]);
    return {
      sources: [
        {
          batchId: batch.id,
          timings: batch.timings,
          firstDate: localNow(batch.createdAt, batch.timezone).date,
          lastDate: null,
        },
        ...studentTimings.map((source) => ({
          batchId: batch.id,
          timings: source.timings,
          firstDate: localNow(source.from, batch.timezone).date,
          lastDate:
            source.until == null
              ? null
              : localNow(source.until, batch.timezone).date,
        })),
      ],
      changes: exceptions.changes,
      holidays: exceptions.holidays,
    };
  }

  private static classesOnDate(
    schedule: Awaited<ReturnType<ClassWorkHandlers["scheduleSources"]>>,
    date: string,
  ): ClassDateView[] {
    const found = new Map<string, ClassDateView>();
    for (const source of schedule.sources) {
      if (source.lastDate != null && date > source.lastDate) continue;
      for (const scheduled of classesOn(
        source,
        date,
        schedule.changes,
        schedule.holidays,
      ))
        if (scheduled.status === "scheduled")
          found.set(scheduled.startTime, {
            date,
            startTime: scheduled.startTime,
            endTime: scheduled.endTime,
          });
    }
    return [...found.values()].sort(
      (a, b) => clockMinutes(a.startTime) - clockMinutes(b.startTime),
    );
  }

  private async classDates(
    workspaceId: string,
    batch: ClassWorkBatch,
  ): Promise<ClassDateView[]> {
    const schedule = await this.scheduleSources(workspaceId, batch);
    const today = localNow(this.deps.now(), batch.timezone).date;
    const dates: ClassDateView[] = [];
    for (
      let offset = CLASS_DATE_LOOKAHEAD_DAYS;
      offset >= -CLASS_DATE_LOOKBACK_DAYS;
      offset -= 1
    ) {
      const date = addCalendarDays(today, offset);
      dates.push(...ClassWorkHandlers.classesOnDate(schedule, date).reverse());
    }
    return dates;
  }

  private async assertClassDate(
    workspaceId: string,
    batch: ClassWorkBatch,
    date: string,
  ): Promise<void> {
    const schedule = await this.scheduleSources(workspaceId, batch);
    if (ClassWorkHandlers.classesOnDate(schedule, date).length === 0)
      throw new DomainError(
        "CLASS_DATE_INVALID",
        `${batch.name} has no Class on that date.`,
      );
  }

  /**
   * Makes `ids` the item's files: keeps ones it has, attaches this User's
   * recent uploads, and removes the rest.
   */
  private async syncAttachments(
    store: ClassWorkStore,
    workspaceId: string,
    owner: AttachmentOwner,
    ids: readonly string[],
    userId: string,
    isNew: boolean,
  ): Promise<void> {
    const wanted = [...new Set(ids)];
    attachmentCount(wanted.length);
    const now = this.deps.now();
    const available = await store.attachmentsFor(
      workspaceId,
      isNew ? null : owner,
      wanted,
      userId,
    );
    const current = available.filter(
      (attachment) =>
        attachment.owner?.kind === owner.kind &&
        attachment.owner.id === owner.id,
    );
    const usable = new Set(
      available
        .filter(
          (attachment) =>
            (attachment.owner?.kind === owner.kind &&
              attachment.owner.id === owner.id) ||
            (attachment.owner == null &&
              attachment.uploadedByUserId === userId &&
              now.getTime() - attachment.uploadedAt.getTime() <
                UNATTACHED_UPLOAD_TTL_MS),
        )
        .map((attachment) => attachment.id),
    );
    if (wanted.some((id) => !usable.has(id)))
      throw new DomainError(
        "ATTACHMENT_INVALID",
        "A file is missing or has expired. Upload it again.",
      );
    const currentIds = new Set(current.map((attachment) => attachment.id));
    const attach = wanted.filter((id) => !currentIds.has(id));
    const detach = [...currentIds].filter((id) => !wanted.includes(id));
    if (attach.length > 0 || detach.length > 0)
      await store.setAttachments(
        workspaceId,
        owner,
        { attach, detach },
        userId,
        now,
      );
  }

  async batchClassWork(
    actor: ClassWorkStaff,
    batchId: string,
  ): Promise<BatchClassWorkView> {
    const { batch } = await this.staffBatch(actor, batchId);
    const owner = actor.role === "owner";
    const [classDates, materials, homework, enrollments] = await Promise.all([
      this.classDates(actor.workspaceId, batch),
      this.store.studyMaterials(actor.workspaceId, [batch.id], owner),
      this.store.homework(actor.workspaceId, [batch.id], owner),
      this.store.batchEnrollments(actor.workspaceId, [batch.id]),
    ]);
    const submissions = await this.store.submissions(
      actor.workspaceId,
      homework.map((item) => item.id),
    );
    const students = rosterStudents(enrollments, batch.timezone);
    return {
      batch: batchView(batch),
      today: localNow(this.deps.now(), batch.timezone).date,
      canEdit: !batch.closed,
      classDates,
      materials: materials.map(studyMaterialView),
      homework: homework.map((item): StaffHomeworkView => ({
        ...homeworkView(item),
        counts: roster(item, batch.timezone, students, submissions).counts,
      })),
    };
  }

  async postStudyMaterial(
    actor: ClassWorkStaff,
    batchId: string,
    input: StudyMaterialInput,
  ): Promise<StudyMaterialView> {
    const { batch, poster } = await this.staffBatch(actor, batchId);
    ClassWorkHandlers.assertOpen(batch);
    const ids = [...new Set(input.attachmentIds ?? [])];
    const content = studyMaterialContent(input, ids.length);
    if (content.classDate != null)
      await this.assertClassDate(actor.workspaceId, batch, content.classDate);
    const id = this.newId();
    const now = this.deps.now();
    await this.store.transaction(async (store) => {
      await store.insertStudyMaterial(actor.workspaceId, {
        id,
        batchId: batch.id,
        ...content,
        postedBy: poster,
        postedAt: now,
        updatedAt: now,
      });
      await this.syncAttachments(
        store,
        actor.workspaceId,
        { kind: "study_material", id },
        ids,
        actor.userId,
        true,
      );
    });
    return this.studyMaterial(actor, id);
  }

  private async studyMaterialFor(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<{ material: StudyMaterialRecord; batch: ClassWorkBatch }> {
    const material = await this.store.findStudyMaterial(actor.workspaceId, id);
    if (
      material == null ||
      (material.removedAt != null && actor.role !== "owner")
    )
      throw studyMaterialNotFound();
    const { batch } = await this.staffBatch(actor, material.batchId);
    return { material, batch };
  }

  private async studyMaterial(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<StudyMaterialView> {
    return studyMaterialView((await this.studyMaterialFor(actor, id)).material);
  }

  async updateStudyMaterial(
    actor: ClassWorkStaff,
    id: string,
    input: StudyMaterialInput,
  ): Promise<StudyMaterialView> {
    const { material, batch } = await this.studyMaterialFor(actor, id);
    ClassWorkHandlers.assertOpen(batch);
    if (material.removedAt != null)
      throw new DomainError(
        "STUDY_MATERIAL_REMOVED",
        "This Study Material was removed.",
      );
    const ids = [...new Set(input.attachmentIds ?? [])];
    const content = studyMaterialContent(input, ids.length);
    // A Class that was later cancelled doesn't block other edits.
    if (content.classDate != null && content.classDate !== material.classDate)
      await this.assertClassDate(actor.workspaceId, batch, content.classDate);
    await this.store.transaction(async (store) => {
      await store.updateStudyMaterial(
        actor.workspaceId,
        id,
        content,
        actor.userId,
        this.deps.now(),
      );
      await this.syncAttachments(
        store,
        actor.workspaceId,
        { kind: "study_material", id },
        ids,
        actor.userId,
        false,
      );
    });
    return this.studyMaterial(actor, id);
  }

  async removeStudyMaterial(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<StudyMaterialView> {
    const { material, batch } = await this.studyMaterialFor(actor, id);
    ClassWorkHandlers.assertOpen(batch);
    if (material.removedAt == null)
      await this.store.removeStudyMaterial(
        actor.workspaceId,
        id,
        actor.userId,
        this.deps.now(),
      );
    const removed = await this.store.findStudyMaterial(actor.workspaceId, id);
    if (removed == null) throw studyMaterialNotFound();
    return studyMaterialView(removed);
  }

  async setHomework(
    actor: ClassWorkStaff,
    batchId: string,
    input: HomeworkInput,
  ): Promise<HomeworkView> {
    const { batch, poster } = await this.staffBatch(actor, batchId);
    ClassWorkHandlers.assertOpen(batch);
    const ids = [...new Set(input.attachmentIds ?? [])];
    const content = homeworkContent(input, ids.length);
    await this.assertClassDate(actor.workspaceId, batch, content.classDate);
    const id = this.newId();
    const now = this.deps.now();
    await this.store.transaction(async (store) => {
      await store.insertHomework(actor.workspaceId, {
        id,
        batchId: batch.id,
        ...content,
        postedBy: poster,
        postedAt: now,
        updatedAt: now,
      });
      await this.syncAttachments(
        store,
        actor.workspaceId,
        { kind: "homework", id },
        ids,
        actor.userId,
        true,
      );
    });
    return homeworkView((await this.homeworkFor(actor, id)).homework);
  }

  private async homeworkFor(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<{ homework: HomeworkRecord; batch: ClassWorkBatch }> {
    const homework = await this.store.findHomework(actor.workspaceId, id);
    if (
      homework == null ||
      (homework.removedAt != null && actor.role !== "owner")
    )
      throw homeworkNotFound();
    const { batch } = await this.staffBatch(actor, homework.batchId);
    return { homework, batch };
  }

  async updateHomework(
    actor: ClassWorkStaff,
    id: string,
    input: HomeworkInput,
  ): Promise<HomeworkView> {
    const { homework, batch } = await this.homeworkFor(actor, id);
    ClassWorkHandlers.assertOpen(batch);
    if (homework.removedAt != null)
      throw new DomainError("HOMEWORK_REMOVED", "This Homework was removed.");
    const ids = [...new Set(input.attachmentIds ?? [])];
    const content = homeworkContent(input, ids.length);
    if (content.classDate !== homework.classDate)
      await this.assertClassDate(actor.workspaceId, batch, content.classDate);
    await this.store.transaction(async (store) => {
      await store.lockHomework(actor.workspaceId, id);
      await store.updateHomework(
        actor.workspaceId,
        id,
        content,
        actor.userId,
        this.deps.now(),
      );
      await this.syncAttachments(
        store,
        actor.workspaceId,
        { kind: "homework", id },
        ids,
        actor.userId,
        false,
      );
    });
    return homeworkView((await this.homeworkFor(actor, id)).homework);
  }

  async removeHomework(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<HomeworkView> {
    const { homework, batch } = await this.homeworkFor(actor, id);
    ClassWorkHandlers.assertOpen(batch);
    if (homework.removedAt == null)
      await this.store.removeHomework(
        actor.workspaceId,
        id,
        actor.userId,
        this.deps.now(),
      );
    const removed = await this.store.findHomework(actor.workspaceId, id);
    if (removed == null) throw homeworkNotFound();
    return homeworkView(removed);
  }

  async homeworkSubmissions(
    actor: ClassWorkStaff,
    homeworkId: string,
  ): Promise<HomeworkSubmissionsView> {
    const { homework, batch } = await this.homeworkFor(actor, homeworkId);
    const [enrollments, submissions] = await Promise.all([
      this.store.batchEnrollments(actor.workspaceId, [batch.id]),
      this.store.submissions(actor.workspaceId, [homework.id]),
    ]);
    const { rows, counts } = roster(
      homework,
      batch.timezone,
      rosterStudents(enrollments, batch.timezone),
      submissions,
    );
    return {
      batch: batchView(batch),
      today: localNow(this.deps.now(), batch.timezone).date,
      homework: homeworkView(homework),
      counts,
      students: rows,
    };
  }

  async checkSubmission(
    actor: ClassWorkStaff,
    homeworkId: string,
    submissionId: string,
    input: { remark?: string | null },
  ): Promise<SubmissionView> {
    const { homework, batch } = await this.homeworkFor(actor, homeworkId);
    const text = remark(input.remark);
    const now = this.deps.now();
    const checked = await this.store.transaction(async (store) => {
      await store.lockHomework(actor.workspaceId, homework.id);
      const submission = await store.findSubmission(
        actor.workspaceId,
        homework.id,
        submissionId,
      );
      if (submission == null)
        throw new DomainError(
          "HOMEWORK_SUBMISSION_NOT_FOUND",
          "Submission not found.",
        );
      // Changing the remark keeps the first check time.
      await store.checkSubmission(
        actor.workspaceId,
        submission.id,
        text,
        actor.userId,
        submission.checkedAt ?? now,
      );
      return store.findSubmission(
        actor.workspaceId,
        homework.id,
        submission.id,
      );
    });
    if (checked == null)
      throw new DomainError(
        "HOMEWORK_SUBMISSION_NOT_FOUND",
        "Submission not found.",
      );
    return submissionView(checked, homework.dueOn, batch.timezone);
  }

  // ---------------------------------------------------------------- family

  private async familyAccess(
    family: ClassWorkFamily,
    store: ClassWorkStore = this.store,
  ): Promise<FamilyAccess> {
    const students = await store.familyStudents(
      family.workspaceId,
      family.role,
      family.verifiedEmails,
    );
    const enrollments =
      students.length === 0
        ? []
        : await store.studentEnrollments(
            family.workspaceId,
            students.map((student) => student.id),
          );
    const access = new Map<string, Map<string, BatchAccess>>();
    const batches = new Map<string, FamilyBatchView>();
    for (const student of students) {
      const byBatch = new Map<string, BatchAccess>();
      for (const enrollment of enrollments) {
        if (enrollment.studentId !== student.id) continue;
        const { batch } = enrollment;
        const ends = [
          enrollment.endedAt,
          enrollment.batchClosedAt,
          student.droppedAt,
        ].filter((date): date is Date => date != null);
        const endedAt =
          ends.length === 0
            ? null
            : new Date(Math.min(...ends.map((date) => date.getTime())));
        const start = localNow(enrollment.createdAt, batch.timezone).date;
        const current = byBatch.get(batch.id);
        // Several Enrollments in one Batch: an active one wins; otherwise the
        // latest end counts. The earliest active start counts for owing.
        const merged: BatchAccess =
          current == null
            ? { start, endedAt }
            : current.endedAt == null && endedAt == null
              ? {
                  start: start < current.start ? start : current.start,
                  endedAt: null,
                }
              : current.endedAt == null
                ? current
                : endedAt == null
                  ? { start, endedAt: null }
                  : {
                      start: start < current.start ? start : current.start,
                      endedAt:
                        endedAt > current.endedAt ? endedAt : current.endedAt,
                    };
        byBatch.set(batch.id, merged);
        batches.set(batch.id, {
          id: batch.id,
          name: batch.name,
          courseName: batch.courseName,
          timezone: batch.timezone,
          access: "active",
        });
      }
      access.set(student.id, byBatch);
    }
    return {
      students: students.map(({ id, name }) => ({ id, name })),
      access,
      batches,
    };
  }

  private familyHomework(
    homework: HomeworkRecord,
    batch: FamilyBatchView,
    access: BatchAccess,
    submission: SubmissionRecord | null,
  ): FamilyHomeworkView {
    const now = this.deps.now();
    const view = submission
      ? submissionView(submission, homework.dueOn, batch.timezone)
      : null;
    const { removedAt: _removedAt, ...item } = homeworkView(homework);
    return {
      ...item,
      status: familyHomeworkStatus({
        owed: owesHomework(access, homework.dueOn),
        overdue: isOverdue(homework.dueOn, now, batch.timezone),
        submission:
          view == null
            ? null
            : { late: view.late, checked: view.checkedAt != null },
      }),
      canSubmit: access.endedAt == null && view?.checkedAt == null,
      submission: view,
    };
  }

  async familyClassWork(family: ClassWorkFamily): Promise<FamilyClassWorkView> {
    const { students, access, batches } = await this.familyAccess(family);
    const batchIds = [...batches.keys()];
    if (batchIds.length === 0)
      return {
        students: students.map((student) => ({
          ...student,
          batches: [],
          homework: [],
          materials: [],
        })),
      };
    const [materials, homework] = await Promise.all([
      this.store.studyMaterials(family.workspaceId, batchIds, false),
      this.store.homework(family.workspaceId, batchIds, false),
    ]);
    const submissions = await this.store.submissions(
      family.workspaceId,
      homework.map((item) => item.id),
    );
    return {
      students: students.map((student) => {
        const byBatch =
          access.get(student.id) ?? new Map<string, BatchAccess>();
        const studentBatches = [...byBatch.entries()]
          .map(([batchId, batchAccess]): FamilyBatchView => {
            const batch = batches.get(batchId);
            if (batch == null) throw new BatchNotFoundError();
            return {
              ...batch,
              access: batchAccess.endedAt == null ? "active" : "ended",
            };
          })
          .sort(
            (a, b) =>
              (a.access === b.access ? 0 : a.access === "active" ? -1 : 1) ||
              a.name.localeCompare(b.name),
          );
        const visible = (item: { batchId: string; postedAt: Date }) => {
          const batchAccess = byBatch.get(item.batchId);
          return batchAccess != null && canSeeItem(batchAccess, item.postedAt);
        };
        return {
          ...student,
          batches: studentBatches,
          homework: homework.filter(visible).map((item) => {
            const batch = studentBatches.find(
              (candidate) => candidate.id === item.batchId,
            );
            const batchAccess = byBatch.get(item.batchId);
            if (batch == null || batchAccess == null)
              throw new BatchNotFoundError();
            return this.familyHomework(
              item,
              batch,
              batchAccess,
              submissions.find(
                (submission) =>
                  submission.homeworkId === item.id &&
                  submission.studentId === student.id,
              ) ?? null,
            );
          }),
          materials: materials
            .filter(visible)
            .map((item): FamilyStudyMaterialView => {
              const { removedAt: _removedAt, ...view } =
                studyMaterialView(item);
              return view;
            }),
        };
      }),
    };
  }

  /** The Homework, the Student's access to it, and their Batch. */
  private async familyHomeworkAccess(
    family: ClassWorkFamily,
    store: ClassWorkStore,
    homeworkId: string,
    studentId: string,
  ): Promise<{
    homework: HomeworkRecord;
    access: BatchAccess;
    batch: FamilyBatchView;
  }> {
    const homework = await store.findHomework(family.workspaceId, homeworkId);
    if (homework == null || homework.removedAt != null)
      throw homeworkNotFound();
    const { access, batches } = await this.familyAccess(family, store);
    const batchAccess = access.get(studentId)?.get(homework.batchId);
    const batch = batches.get(homework.batchId);
    if (
      batchAccess == null ||
      batch == null ||
      !canSeeItem(batchAccess, homework.postedAt)
    )
      throw homeworkNotFound();
    return {
      homework,
      access: batchAccess,
      batch: {
        ...batch,
        access: batchAccess.endedAt == null ? "active" : "ended",
      },
    };
  }

  private static assertCanChange(
    access: BatchAccess,
    submission: SubmissionRecord | null,
  ): void {
    if (access.endedAt != null)
      throw new DomainError(
        "HOMEWORK_ACCESS_ENDED",
        "The Student is no longer in this Batch, so this Homework can't be changed.",
      );
    if (submission?.checkedAt != null)
      throw new DomainError(
        "HOMEWORK_SUBMISSION_CHECKED",
        "The Teacher has checked this Homework, so it can't be changed.",
      );
  }

  private static submitterRole(family: ClassWorkFamily): "student" | "parent" {
    return family.role === "org:parent" ? "parent" : "student";
  }

  async submitHomework(
    family: ClassWorkFamily,
    homeworkId: string,
    input: SubmitHomeworkInput,
  ): Promise<FamilyHomeworkView> {
    const note = submissionNote(input.note);
    const ids = [...new Set(input.attachmentIds ?? [])];
    attachmentCount(ids.length);
    const now = this.deps.now();
    return this.store.transaction(async (store) => {
      await store.lockHomework(family.workspaceId, homeworkId);
      const { homework, access, batch } = await this.familyHomeworkAccess(
        family,
        store,
        homeworkId,
        input.studentId,
      );
      const existing = await store.liveSubmission(
        family.workspaceId,
        homework.id,
        input.studentId,
      );
      ClassWorkHandlers.assertCanChange(access, existing);
      const role = ClassWorkHandlers.submitterRole(family);
      const id = existing?.id ?? this.newId();
      if (existing == null)
        await store.insertSubmission(family.workspaceId, {
          id,
          homeworkId: homework.id,
          studentId: input.studentId,
          note,
          userId: family.userId,
          role,
          now,
        });
      else
        await store.updateSubmission(family.workspaceId, id, {
          note,
          userId: family.userId,
          role,
          now,
        });
      await this.syncAttachments(
        store,
        family.workspaceId,
        { kind: "submission", id },
        ids,
        family.userId,
        existing == null,
      );
      return this.familyHomework(
        homework,
        batch,
        access,
        await store.liveSubmission(
          family.workspaceId,
          homework.id,
          input.studentId,
        ),
      );
    });
  }

  async undoSubmission(
    family: ClassWorkFamily,
    homeworkId: string,
    input: { studentId: string },
  ): Promise<FamilyHomeworkView> {
    return this.store.transaction(async (store) => {
      await store.lockHomework(family.workspaceId, homeworkId);
      const { homework, access, batch } = await this.familyHomeworkAccess(
        family,
        store,
        homeworkId,
        input.studentId,
      );
      const existing = await store.liveSubmission(
        family.workspaceId,
        homework.id,
        input.studentId,
      );
      ClassWorkHandlers.assertCanChange(access, existing);
      if (existing == null)
        throw new DomainError(
          "HOMEWORK_NOT_SUBMITTED",
          "This Homework hasn't been marked done.",
        );
      await store.withdrawSubmission(
        family.workspaceId,
        existing.id,
        family.userId,
        this.deps.now(),
      );
      return this.familyHomework(homework, batch, access, null);
    });
  }

  // ---------------------------------------------------------------- files

  /** Stores an upload until an item or Submission attaches it. */
  async upload(
    member: { workspaceId: string; userId: string },
    input: { name: string | null; mimeType: string | null; bytes: Uint8Array },
  ): Promise<AttachmentView> {
    const mimeType: AttachmentMimeType = attachmentMimeType(input.mimeType);
    await checkAttachmentFile(mimeType, input.bytes);
    const now = this.deps.now();
    const waiting = await this.store.purgeUploads(
      member.workspaceId,
      member.userId,
      new Date(now.getTime() - UNATTACHED_UPLOAD_TTL_MS),
    );
    if (waiting >= UNATTACHED_UPLOAD_LIMIT)
      throw new DomainError(
        "ATTACHMENT_UPLOAD_LIMIT",
        "Too many files are waiting to be attached. Save or discard your changes first.",
      );
    const upload: AttachmentView = {
      id: this.newId(),
      name: attachmentName(input.name),
      mimeType,
      sizeBytes: input.bytes.length,
    };
    await this.store.insertUpload(member.workspaceId, {
      ...upload,
      bytes: input.bytes,
      userId: member.userId,
      now,
    });
    return upload;
  }

  /** The file, if the User can see the item or Submission it belongs to. */
  async download(
    member: ClassWorkMember,
    attachmentId: string,
  ): Promise<{
    name: string;
    mimeType: AttachmentMimeType;
    bytes: Uint8Array;
  }> {
    const file = await this.store.attachmentFile(
      member.workspaceId,
      attachmentId,
    );
    if (file?.owner == null) throw attachmentNotFound();
    let item: { batchId: string; postedAt: Date; removedAt: Date | null };
    let submitter: string | null = null;
    if (file.owner.kind === "study_material") {
      const material = await this.store.findStudyMaterial(
        member.workspaceId,
        file.owner.id,
      );
      if (material == null) throw attachmentNotFound();
      item = material;
    } else {
      let homeworkId = file.owner.id;
      if (file.owner.kind === "submission") {
        const owner = await this.store.submissionOwner(
          member.workspaceId,
          file.owner.id,
        );
        if (owner == null || owner.withdrawn) throw attachmentNotFound();
        homeworkId = owner.homeworkId;
        submitter = owner.studentId;
      }
      const homework = await this.store.findHomework(
        member.workspaceId,
        homeworkId,
      );
      if (homework == null) throw attachmentNotFound();
      item = homework;
    }
    if (isStaff(member)) {
      if (item.removedAt != null && member.role !== "owner")
        throw attachmentNotFound();
      try {
        await this.staffBatch(member, item.batchId);
      } catch {
        throw attachmentNotFound();
      }
    } else {
      if (item.removedAt != null) throw attachmentNotFound();
      const { access } = await this.familyAccess(member);
      const allowed = [...access.entries()].some(([studentId, byBatch]) => {
        const batchAccess = byBatch.get(item.batchId);
        return (
          batchAccess != null &&
          canSeeItem(batchAccess, item.postedAt) &&
          (submitter == null || submitter === studentId)
        );
      });
      if (!allowed) throw attachmentNotFound();
    }
    return { name: file.name, mimeType: file.mimeType, bytes: file.bytes };
  }
}
