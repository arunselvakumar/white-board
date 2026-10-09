import type { Prisma, PrismaClient } from "@repo/whiteboard-db";

import type {
  AttachmentFile,
  AttachmentOwner,
  BatchEnrollmentRecord,
  ClassWorkBatch,
  ClassWorkStore,
  HomeworkRecord,
  PosterRecord,
  StoredAttachment,
  StudentTimingSource,
  StudyMaterialRecord,
  SubmissionRecord,
} from "../application/class-work-ports";
import type {
  AttachmentMimeType,
  AttachmentView,
  ClassWorkBatchView,
} from "../application/class-work-views";
import {
  familyEmails,
  isLinkedStudent,
  type FamilyRole,
} from "../application/family-links";
import { DomainError } from "../domain/errors";
import { WeeklyTimings } from "../domain/weekly-timings";
import { PrismaClassExceptionsReader } from "./prisma-class-change-store";

type Db = PrismaClient | Prisma.TransactionClient;

const ATTACHMENT_SELECT = {
  id: true,
  name: true,
  mimeType: true,
  sizeBytes: true,
} satisfies Prisma.TrainingInstituteAttachmentSelect;

/** Live attachments, oldest first. */
const LIVE_ATTACHMENTS = {
  where: { deletedAt: null },
  select: ATTACHMENT_SELECT,
  orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
} satisfies Prisma.TrainingInstituteAttachmentFindManyArgs;

const POSTER_INCLUDE = {
  postedByTeacher: { select: { name: true } },
  attachments: LIVE_ATTACHMENTS,
} satisfies Prisma.TrainingInstituteHomeworkInclude;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function attachmentView(row: {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}): AttachmentView {
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType as AttachmentMimeType,
    sizeBytes: row.sizeBytes,
  };
}

type PostedRow = {
  postedByUserId: string;
  postedByRole: "owner" | "teacher";
  postedByTeacherId: string | null;
  postedByTeacher: { name: string } | null;
};

function poster(row: PostedRow): PosterRecord {
  return {
    userId: row.postedByUserId,
    role: row.postedByRole,
    teacherId: row.postedByTeacherId,
    teacherName: row.postedByTeacher?.name ?? null,
  };
}

function ownerOf(row: {
  studyMaterialId: string | null;
  homeworkId: string | null;
  submissionId: string | null;
}): AttachmentOwner | null {
  if (row.studyMaterialId != null)
    return { kind: "study_material", id: row.studyMaterialId };
  if (row.homeworkId != null) return { kind: "homework", id: row.homeworkId };
  if (row.submissionId != null)
    return { kind: "submission", id: row.submissionId };
  return null;
}

function ownerWhere(
  owner: AttachmentOwner,
): Prisma.TrainingInstituteAttachmentWhereInput {
  if (owner.kind === "study_material") return { studyMaterialId: owner.id };
  if (owner.kind === "homework") return { homeworkId: owner.id };
  return { submissionId: owner.id };
}

function batchView(batch: {
  id: string;
  name: string;
  classMode: ClassWorkBatchView["classMode"];
  timezone: string;
  closedAt: Date | null;
  course: { name: string };
}): ClassWorkBatchView {
  return {
    id: batch.id,
    name: batch.name,
    courseName: batch.course.name,
    classMode: batch.classMode,
    timezone: batch.timezone,
    closed: batch.closedAt != null,
  };
}

export class PrismaClassWorkStore implements ClassWorkStore {
  constructor(
    private readonly db: Db,
    private readonly root: PrismaClient,
  ) {}

  transaction<T>(work: (store: ClassWorkStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) =>
      work(new PrismaClassWorkStore(tx, this.root)),
    );
  }

  async activeTeacherForUser(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.db.trainingInstituteTeacher.findFirst({
      where: {
        workspaceId,
        userId,
        deletedAt: null,
        deactivatedAt: null,
      },
      select: { id: true, name: true },
    });
  }

  async isAssigned(
    workspaceId: string,
    teacherId: string,
    batchId: string,
  ): Promise<boolean> {
    const count = await this.db.trainingInstituteBatchTeacherAssignment.count({
      where: {
        workspaceId,
        teacherId,
        batchId,
        unassignedAt: null,
        deletedAt: null,
      },
    });
    return count > 0;
  }

  async batch(
    workspaceId: string,
    batchId: string,
  ): Promise<ClassWorkBatch | null> {
    const row = await this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
      include: { course: { select: { name: true } } },
    });
    if (row == null) return null;
    return {
      ...batchView(row),
      timings: WeeklyTimings.create(row.timings).toJson(),
      createdAt: row.createdAt,
    };
  }

  async studentTimings(
    workspaceId: string,
    batchId: string,
  ): Promise<StudentTimingSource[]> {
    const rows = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        workspaceId,
        batchId,
        deletedAt: null,
        timingSource: "student",
      },
      select: { studentTimings: true, createdAt: true, endedAt: true },
    });
    return rows.map((row) => ({
      timings: WeeklyTimings.create(row.studentTimings ?? []).toJson(),
      from: row.createdAt,
      until: row.endedAt,
    }));
  }

  classExceptions(workspaceId: string, batchId: string) {
    return new PrismaClassExceptionsReader(this.root)
      .forBatches(workspaceId, [batchId])
      .then(({ changes, holidays }) => ({ changes, holidays }));
  }

  async studyMaterials(
    workspaceId: string,
    batchIds: readonly string[],
    includeRemoved: boolean,
  ): Promise<StudyMaterialRecord[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteStudyMaterial.findMany({
      where: {
        workspaceId,
        batchId: { in: [...batchIds] },
        ...(includeRemoved ? {} : { removedAt: null }),
      },
      include: POSTER_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => this.toStudyMaterial(row));
  }

  async homework(
    workspaceId: string,
    batchIds: readonly string[],
    includeRemoved: boolean,
  ): Promise<HomeworkRecord[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteHomework.findMany({
      where: {
        workspaceId,
        batchId: { in: [...batchIds] },
        ...(includeRemoved ? {} : { removedAt: null }),
      },
      include: POSTER_INCLUDE,
      orderBy: [{ classDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => this.toHomework(row));
  }

  async findStudyMaterial(
    workspaceId: string,
    id: string,
  ): Promise<StudyMaterialRecord | null> {
    const row = await this.db.trainingInstituteStudyMaterial.findFirst({
      where: { id, workspaceId },
      include: POSTER_INCLUDE,
    });
    return row == null ? null : this.toStudyMaterial(row);
  }

  async findHomework(
    workspaceId: string,
    id: string,
  ): Promise<HomeworkRecord | null> {
    const row = await this.db.trainingInstituteHomework.findFirst({
      where: { id, workspaceId },
      include: POSTER_INCLUDE,
    });
    return row == null ? null : this.toHomework(row);
  }

  async lockHomework(workspaceId: string, id: string): Promise<void> {
    await this.db.$queryRaw`
      SELECT id FROM training_institute.homework
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
      FOR UPDATE`;
  }

  async insertStudyMaterial(
    workspaceId: string,
    record: Omit<StudyMaterialRecord, "attachments" | "removedAt">,
  ): Promise<void> {
    await this.db.trainingInstituteStudyMaterial.create({
      data: {
        id: record.id,
        workspaceId,
        batchId: record.batchId,
        title: record.title,
        note: record.note,
        linkUrl: record.linkUrl,
        classDate: record.classDate == null ? null : dbDate(record.classDate),
        postedByUserId: record.postedBy.userId,
        postedByRole: record.postedBy.role,
        postedByTeacherId: record.postedBy.teacherId,
        updatedByUserId: record.postedBy.userId,
        createdAt: record.postedAt,
        updatedAt: record.updatedAt,
      },
    });
  }

  async updateStudyMaterial(
    workspaceId: string,
    id: string,
    content: Pick<
      StudyMaterialRecord,
      "title" | "note" | "linkUrl" | "classDate"
    >,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteStudyMaterial.updateMany({
      where: { id, workspaceId, removedAt: null },
      data: {
        title: content.title,
        note: content.note,
        linkUrl: content.linkUrl,
        classDate: content.classDate == null ? null : dbDate(content.classDate),
        updatedByUserId: userId,
        updatedAt: now,
      },
    });
  }

  async removeStudyMaterial(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteStudyMaterial.updateMany({
      where: { id, workspaceId, removedAt: null },
      data: { removedAt: now, removedByUserId: userId },
    });
  }

  async insertHomework(
    workspaceId: string,
    record: Omit<HomeworkRecord, "attachments" | "removedAt">,
  ): Promise<void> {
    await this.db.trainingInstituteHomework.create({
      data: {
        id: record.id,
        workspaceId,
        batchId: record.batchId,
        title: record.title,
        instructions: record.instructions,
        classDate: dbDate(record.classDate),
        dueOn: dbDate(record.dueOn),
        postedByUserId: record.postedBy.userId,
        postedByRole: record.postedBy.role,
        postedByTeacherId: record.postedBy.teacherId,
        updatedByUserId: record.postedBy.userId,
        createdAt: record.postedAt,
        updatedAt: record.updatedAt,
      },
    });
  }

  async updateHomework(
    workspaceId: string,
    id: string,
    content: Pick<
      HomeworkRecord,
      "title" | "instructions" | "classDate" | "dueOn"
    >,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteHomework.updateMany({
      where: { id, workspaceId, removedAt: null },
      data: {
        title: content.title,
        instructions: content.instructions,
        classDate: dbDate(content.classDate),
        dueOn: dbDate(content.dueOn),
        updatedByUserId: userId,
        updatedAt: now,
      },
    });
  }

  async removeHomework(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteHomework.updateMany({
      where: { id, workspaceId, removedAt: null },
      data: { removedAt: now, removedByUserId: userId },
    });
  }

  async batchEnrollments(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<BatchEnrollmentRecord[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        workspaceId,
        batchId: { in: [...batchIds] },
        deletedAt: null,
        student: { deletedAt: null },
      },
      include: {
        student: { select: { name: true, droppedAt: true } },
        batch: { select: { closedAt: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      studentId: row.studentId,
      studentName: row.student.name,
      batchId: row.batchId,
      createdAt: row.createdAt,
      endedAt: row.endedAt,
      studentDroppedAt: row.student.droppedAt,
      batchClosedAt: row.batch.closedAt,
    }));
  }

  private submissionInclude = {
    student: { select: { name: true } },
    attachments: LIVE_ATTACHMENTS,
  } satisfies Prisma.TrainingInstituteHomeworkSubmissionInclude;

  async submissions(
    workspaceId: string,
    homeworkIds: readonly string[],
  ): Promise<SubmissionRecord[]> {
    if (homeworkIds.length === 0) return [];
    const rows = await this.db.trainingInstituteHomeworkSubmission.findMany({
      where: {
        workspaceId,
        homeworkId: { in: [...homeworkIds] },
        withdrawnAt: null,
      },
      include: this.submissionInclude,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => this.toSubmission(row));
  }

  async liveSubmission(
    workspaceId: string,
    homeworkId: string,
    studentId: string,
  ): Promise<SubmissionRecord | null> {
    const row = await this.db.trainingInstituteHomeworkSubmission.findFirst({
      where: { workspaceId, homeworkId, studentId, withdrawnAt: null },
      include: this.submissionInclude,
    });
    return row == null ? null : this.toSubmission(row);
  }

  async findSubmission(
    workspaceId: string,
    homeworkId: string,
    id: string,
  ): Promise<SubmissionRecord | null> {
    const row = await this.db.trainingInstituteHomeworkSubmission.findFirst({
      where: { id, workspaceId, homeworkId, withdrawnAt: null },
      include: this.submissionInclude,
    });
    return row == null ? null : this.toSubmission(row);
  }

  async insertSubmission(
    workspaceId: string,
    record: {
      id: string;
      homeworkId: string;
      studentId: string;
      note: string | null;
      userId: string;
      role: "student" | "parent";
      now: Date;
    },
  ): Promise<void> {
    await this.db.trainingInstituteHomeworkSubmission.create({
      data: {
        id: record.id,
        workspaceId,
        homeworkId: record.homeworkId,
        studentId: record.studentId,
        note: record.note,
        submittedAt: record.now,
        submittedByUserId: record.userId,
        submittedByRole: record.role,
        updatedByUserId: record.userId,
        updatedByRole: record.role,
        createdAt: record.now,
        updatedAt: record.now,
      },
    });
  }

  async updateSubmission(
    workspaceId: string,
    id: string,
    change: {
      note: string | null;
      userId: string;
      role: "student" | "parent";
      now: Date;
    },
  ): Promise<void> {
    await this.db.trainingInstituteHomeworkSubmission.updateMany({
      where: { id, workspaceId, withdrawnAt: null, checkedAt: null },
      data: {
        note: change.note,
        updatedByUserId: change.userId,
        updatedByRole: change.role,
        updatedAt: change.now,
      },
    });
  }

  async withdrawSubmission(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteHomeworkSubmission.updateMany({
      where: { id, workspaceId, withdrawnAt: null, checkedAt: null },
      data: { withdrawnAt: now, withdrawnByUserId: userId, updatedAt: now },
    });
  }

  async checkSubmission(
    workspaceId: string,
    id: string,
    remark: string | null,
    userId: string,
    checkedAt: Date,
  ): Promise<void> {
    await this.db.trainingInstituteHomeworkSubmission.updateMany({
      where: { id, workspaceId, withdrawnAt: null },
      data: { remark, checkedAt, checkedByUserId: userId },
    });
  }

  async familyStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<{ id: string; name: string; droppedAt: Date | null }[]> {
    const emails = familyEmails(verifiedEmails);
    if (emails.size === 0) return [];
    const rows = await this.db.trainingInstituteStudent.findMany({
      where: { workspaceId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        profileDetails: true,
        droppedAt: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows
      .filter((row) => isLinkedStudent(row, role, emails))
      .map(({ id, name, droppedAt }) => ({ id, name, droppedAt }));
  }

  async studentEnrollments(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<(BatchEnrollmentRecord & { batch: ClassWorkBatchView })[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db.trainingInstituteEnrollment.findMany({
      where: {
        workspaceId,
        studentId: { in: [...studentIds] },
        deletedAt: null,
        batch: { workspaceId, deletedAt: null },
      },
      include: {
        student: { select: { name: true, droppedAt: true } },
        batch: { include: { course: { select: { name: true } } } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      studentId: row.studentId,
      studentName: row.student.name,
      batchId: row.batchId,
      createdAt: row.createdAt,
      endedAt: row.endedAt,
      studentDroppedAt: row.student.droppedAt,
      batchClosedAt: row.batch.closedAt,
      batch: batchView(row.batch),
    }));
  }

  async attachmentsFor(
    workspaceId: string,
    owner: AttachmentOwner | null,
    ids: readonly string[],
    userId: string,
  ): Promise<StoredAttachment[]> {
    const rows = await this.db.trainingInstituteAttachment.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          ...(owner == null ? [] : [ownerWhere(owner)]),
          {
            id: { in: [...ids] },
            uploadedByUserId: userId,
            studyMaterialId: null,
            homeworkId: null,
            submissionId: null,
          },
        ],
      },
      select: {
        ...ATTACHMENT_SELECT,
        studyMaterialId: true,
        homeworkId: true,
        submissionId: true,
        uploadedByUserId: true,
        uploadedAt: true,
      },
    });
    return rows.map((row) => ({
      ...attachmentView(row),
      owner: ownerOf(row),
      uploadedByUserId: row.uploadedByUserId,
      uploadedAt: row.uploadedAt,
    }));
  }

  async setAttachments(
    workspaceId: string,
    owner: AttachmentOwner,
    change: { attach: string[]; detach: string[] },
    userId: string,
    now: Date,
  ): Promise<void> {
    if (change.attach.length > 0) {
      const attached = await this.db.trainingInstituteAttachment.updateMany({
        where: {
          workspaceId,
          id: { in: change.attach },
          uploadedByUserId: userId,
          deletedAt: null,
          studyMaterialId: null,
          homeworkId: null,
          submissionId: null,
        },
        data: ownerWhere(
          owner,
        ) as Prisma.TrainingInstituteAttachmentUncheckedUpdateManyInput,
      });
      // Another request attached one of these first.
      if (attached.count !== change.attach.length)
        throw new DomainError(
          "ATTACHMENT_INVALID",
          "A file is missing or has expired. Upload it again.",
        );
    }
    if (change.detach.length > 0)
      await this.db.trainingInstituteAttachment.updateMany({
        where: {
          workspaceId,
          id: { in: change.detach },
          deletedAt: null,
          ...ownerWhere(owner),
        },
        data: { deletedAt: now, deletedByUserId: userId },
      });
  }

  async insertUpload(
    workspaceId: string,
    upload: AttachmentView & { bytes: Uint8Array; userId: string; now: Date },
  ): Promise<void> {
    await this.db.trainingInstituteAttachment.create({
      data: {
        id: upload.id,
        workspaceId,
        name: upload.name,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        data: Buffer.from(upload.bytes),
        uploadedByUserId: upload.userId,
        uploadedAt: upload.now,
      },
    });
  }

  async purgeUploads(
    workspaceId: string,
    userId: string,
    before: Date,
  ): Promise<number> {
    const unattached = {
      workspaceId,
      uploadedByUserId: userId,
      studyMaterialId: null,
      homeworkId: null,
      submissionId: null,
    };
    // Never attached and past their time: nobody has seen them.
    await this.db.trainingInstituteAttachment.deleteMany({
      where: { ...unattached, uploadedAt: { lt: before } },
    });
    return this.db.trainingInstituteAttachment.count({
      where: { ...unattached, deletedAt: null },
    });
  }

  async attachmentFile(
    workspaceId: string,
    id: string,
  ): Promise<AttachmentFile | null> {
    const row = await this.db.trainingInstituteAttachment.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        name: true,
        mimeType: true,
        data: true,
        studyMaterialId: true,
        homeworkId: true,
        submissionId: true,
      },
    });
    if (row == null) return null;
    return {
      name: row.name,
      mimeType: row.mimeType as AttachmentMimeType,
      bytes: row.data,
      owner: ownerOf(row),
    };
  }

  async submissionOwner(
    workspaceId: string,
    submissionId: string,
  ): Promise<{
    homeworkId: string;
    studentId: string;
    withdrawn: boolean;
  } | null> {
    const row = await this.db.trainingInstituteHomeworkSubmission.findFirst({
      where: { id: submissionId, workspaceId },
      select: { homeworkId: true, studentId: true, withdrawnAt: true },
    });
    return row == null
      ? null
      : {
          homeworkId: row.homeworkId,
          studentId: row.studentId,
          withdrawn: row.withdrawnAt != null,
        };
  }

  private toStudyMaterial(
    row: Prisma.TrainingInstituteStudyMaterialGetPayload<{
      include: typeof POSTER_INCLUDE;
    }>,
  ): StudyMaterialRecord {
    return {
      id: row.id,
      batchId: row.batchId,
      title: row.title,
      note: row.note,
      linkUrl: row.linkUrl,
      classDate: row.classDate == null ? null : dateOnly(row.classDate),
      postedBy: poster(row),
      postedAt: row.createdAt,
      updatedAt: row.updatedAt,
      removedAt: row.removedAt,
      attachments: row.attachments.map(attachmentView),
    };
  }

  private toHomework(
    row: Prisma.TrainingInstituteHomeworkGetPayload<{
      include: typeof POSTER_INCLUDE;
    }>,
  ): HomeworkRecord {
    return {
      id: row.id,
      batchId: row.batchId,
      title: row.title,
      instructions: row.instructions,
      classDate: dateOnly(row.classDate),
      dueOn: dateOnly(row.dueOn),
      postedBy: poster(row),
      postedAt: row.createdAt,
      updatedAt: row.updatedAt,
      removedAt: row.removedAt,
      attachments: row.attachments.map(attachmentView),
    };
  }

  private toSubmission(row: {
    id: string;
    homeworkId: string;
    studentId: string;
    note: string | null;
    submittedAt: Date;
    submittedByRole: "student" | "parent";
    updatedAt: Date;
    checkedAt: Date | null;
    remark: string | null;
    student: { name: string };
    attachments: {
      id: string;
      name: string;
      mimeType: string;
      sizeBytes: number;
    }[];
  }): SubmissionRecord {
    return {
      id: row.id,
      homeworkId: row.homeworkId,
      studentId: row.studentId,
      studentName: row.student.name,
      note: row.note,
      submittedAt: row.submittedAt,
      submittedByRole: row.submittedByRole,
      updatedAt: row.updatedAt,
      checkedAt: row.checkedAt,
      remark: row.remark,
      attachments: row.attachments.map(attachmentView),
    };
  }
}
