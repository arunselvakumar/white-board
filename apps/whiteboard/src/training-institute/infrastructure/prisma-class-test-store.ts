import { Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  ClassTestBatch,
  ClassTestRecord,
  ClassTestStore,
  FamilyTestResultRecord,
  TestResultChangeRecord,
  TestResultRecord,
} from "../application/class-test-ports";
import type { TestStudentView } from "../application/class-test-views";
import type { BatchEnrollmentRecord } from "../application/class-work-ports";
import {
  familyEmails,
  isLinkedStudent,
  type FamilyRole,
} from "../application/family-links";
import type { TestDetails, TestResult } from "../domain/class-test";

type Db = PrismaClient | Prisma.TransactionClient;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dbDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function marksOf(value: Prisma.Decimal | null): number | null {
  return value == null ? null : value.toNumber();
}

function dbMarks(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}

const BATCH_INCLUDE = {
  course: { select: { name: true } },
} satisfies Prisma.TrainingInstituteBatchInclude;

function batchOf(
  row: Prisma.TrainingInstituteBatchGetPayload<{
    include: typeof BATCH_INCLUDE;
  }>,
): ClassTestBatch {
  return {
    id: row.id,
    name: row.name,
    courseName: row.course.name,
    timezone: row.timezone,
    closed: row.closedAt != null,
    createdAt: row.createdAt,
  };
}

const TEST_INCLUDE = {
  student: { select: { id: true, name: true } },
  createdByTeacher: { select: { name: true } },
} satisfies Prisma.TrainingInstituteClassTestInclude;

function testOf(
  row: Prisma.TrainingInstituteClassTestGetPayload<{
    include: typeof TEST_INCLUDE;
  }>,
): ClassTestRecord {
  return {
    id: row.id,
    batchId: row.batchId,
    scope: row.scope,
    student: row.student,
    name: row.name,
    heldOn: dateOnly(row.heldOn),
    maxMarks: row.maxMarks,
    passMarks: row.passMarks,
    topic: row.topic,
    createdBy: {
      userId: row.createdByUserId,
      role: row.createdByRole,
      teacherId: row.createdByTeacherId,
      teacherName: row.createdByTeacher?.name ?? null,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

const RESULT_INCLUDE = {
  student: { select: { name: true } },
} satisfies Prisma.TrainingInstituteTestResultInclude;

function resultOf(
  row: Prisma.TrainingInstituteTestResultGetPayload<{
    include: typeof RESULT_INCLUDE;
  }>,
): TestResultRecord {
  return {
    id: row.id,
    testId: row.testId,
    studentId: row.studentId,
    studentName: row.student.name,
    status: row.status,
    marks: marksOf(row.marks),
    remark: row.remark,
    updatedAt: row.updatedAt,
  };
}

const LIVE_TEST = {
  deletedAt: null,
  batch: { deletedAt: null },
} satisfies Prisma.TrainingInstituteClassTestWhereInput;

export class PrismaClassTestStore implements ClassTestStore {
  constructor(private readonly db: Db) {}

  transaction<T>(work: (store: ClassTestStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaClassTestStore(tx)));
  }

  async activeTeacherForUser(
    workspaceId: string,
    userId: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.db.trainingInstituteTeacher.findFirst({
      where: { workspaceId, userId, deletedAt: null, deactivatedAt: null },
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

  async assignedBatchIds(
    workspaceId: string,
    teacherId: string,
  ): Promise<string[]> {
    const rows = await this.db.trainingInstituteBatchTeacherAssignment.findMany(
      {
        where: { workspaceId, teacherId, unassignedAt: null, deletedAt: null },
        select: { batchId: true },
      },
    );
    return [...new Set(rows.map((row) => row.batchId))];
  }

  async batch(
    workspaceId: string,
    batchId: string,
  ): Promise<ClassTestBatch | null> {
    const row = await this.db.trainingInstituteBatch.findFirst({
      where: { id: batchId, workspaceId, deletedAt: null },
      include: BATCH_INCLUDE,
    });
    return row == null ? null : batchOf(row);
  }

  async batches(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassTestBatch[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteBatch.findMany({
      where: { id: { in: [...batchIds] }, workspaceId, deletedAt: null },
      include: BATCH_INCLUDE,
    });
    return rows.map(batchOf);
  }

  async student(
    workspaceId: string,
    studentId: string,
  ): Promise<TestStudentView | null> {
    return this.db.trainingInstituteStudent.findFirst({
      where: { id: studentId, workspaceId, deletedAt: null },
      select: { id: true, name: true },
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

  /**
   * Batches from the Student's Enrollments, plus Batches of Tests they have a
   * result on or are the Student of: a moved Enrollment keeps no record of
   * its old Batch, but the results there are still theirs.
   */
  async studentBatchIds(
    workspaceId: string,
    studentId: string,
  ): Promise<string[]> {
    const [enrollments, tests] = await Promise.all([
      this.db.trainingInstituteEnrollment.findMany({
        where: { workspaceId, studentId, deletedAt: null },
        select: { batchId: true },
      }),
      this.db.trainingInstituteClassTest.findMany({
        where: {
          workspaceId,
          ...LIVE_TEST,
          OR: [{ studentId }, { results: { some: { studentId } } }],
        },
        select: { batchId: true },
      }),
    ]);
    return [...new Set([...enrollments, ...tests].map((row) => row.batchId))];
  }

  async tests(
    workspaceId: string,
    batchIds: readonly string[],
  ): Promise<ClassTestRecord[]> {
    if (batchIds.length === 0) return [];
    const rows = await this.db.trainingInstituteClassTest.findMany({
      where: { workspaceId, batchId: { in: [...batchIds] }, ...LIVE_TEST },
      include: TEST_INCLUDE,
      orderBy: [{ heldOn: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(testOf);
  }

  async findTest(
    workspaceId: string,
    id: string,
  ): Promise<ClassTestRecord | null> {
    const row = await this.db.trainingInstituteClassTest.findFirst({
      where: { id, workspaceId, ...LIVE_TEST },
      include: TEST_INCLUDE,
    });
    return row == null ? null : testOf(row);
  }

  async lockTest(workspaceId: string, id: string): Promise<void> {
    await this.db.$queryRaw`
      SELECT id FROM training_institute.class_tests
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
      FOR UPDATE`;
  }

  async insertTest(
    workspaceId: string,
    record: Omit<ClassTestRecord, "updatedAt" | "publishedAt">,
  ): Promise<void> {
    await this.db.trainingInstituteClassTest.create({
      data: {
        id: record.id,
        workspaceId,
        batchId: record.batchId,
        scope: record.scope,
        studentId: record.student?.id ?? null,
        name: record.name,
        heldOn: dbDate(record.heldOn),
        maxMarks: record.maxMarks,
        passMarks: record.passMarks,
        topic: record.topic,
        createdByUserId: record.createdBy.userId,
        createdByRole: record.createdBy.role,
        createdByTeacherId: record.createdBy.teacherId,
        updatedByUserId: record.createdBy.userId,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
      },
    });
  }

  async updateTest(
    workspaceId: string,
    id: string,
    details: TestDetails,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteClassTest.updateMany({
      where: { id, workspaceId, deletedAt: null },
      data: {
        name: details.name,
        heldOn: dbDate(details.heldOn),
        maxMarks: details.maxMarks,
        passMarks: details.passMarks,
        topic: details.topic,
        updatedByUserId: userId,
        updatedAt: now,
      },
    });
  }

  async publishTest(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteClassTest.updateMany({
      where: { id, workspaceId, deletedAt: null, publishedAt: null },
      data: { publishedAt: now, publishedByUserId: userId, updatedAt: now },
    });
  }

  async deleteTest(
    workspaceId: string,
    id: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteClassTest.updateMany({
      where: { id, workspaceId, deletedAt: null, publishedAt: null },
      data: { deletedAt: now, deletedByUserId: userId },
    });
  }

  async results(
    workspaceId: string,
    testIds: readonly string[],
  ): Promise<TestResultRecord[]> {
    if (testIds.length === 0) return [];
    const rows = await this.db.trainingInstituteTestResult.findMany({
      where: {
        workspaceId,
        testId: { in: [...testIds] },
        student: { deletedAt: null },
      },
      include: RESULT_INCLUDE,
    });
    return rows.map(resultOf);
  }

  async insertResult(
    workspaceId: string,
    record: {
      id: string;
      testId: string;
      studentId: string;
      result: TestResult;
      userId: string;
      now: Date;
    },
  ): Promise<void> {
    await this.db.trainingInstituteTestResult.create({
      data: {
        id: record.id,
        workspaceId,
        testId: record.testId,
        studentId: record.studentId,
        status: record.result.status,
        marks: dbMarks(record.result.marks),
        remark: record.result.remark,
        updatedByUserId: record.userId,
        createdAt: record.now,
        updatedAt: record.now,
      },
    });
  }

  async updateResult(
    workspaceId: string,
    id: string,
    result: TestResult,
    userId: string,
    now: Date,
  ): Promise<void> {
    await this.db.trainingInstituteTestResult.updateMany({
      where: { id, workspaceId },
      data: {
        status: result.status,
        marks: dbMarks(result.marks),
        remark: result.remark,
        updatedByUserId: userId,
        updatedAt: now,
      },
    });
  }

  /** A draft result cleared back to blank; drafts have no history. */
  async deleteResult(workspaceId: string, id: string): Promise<void> {
    await this.db.trainingInstituteTestResult.deleteMany({
      where: { id, workspaceId, changes: { none: {} } },
    });
  }

  async insertChange(
    workspaceId: string,
    change: {
      id: string;
      resultId: string;
      before: TestResult;
      after: TestResult;
      changedBy: {
        userId: string;
        role: "owner" | "teacher";
        teacherId: string | null;
      };
      now: Date;
    },
  ): Promise<void> {
    await this.db.trainingInstituteTestResultChange.create({
      data: {
        id: change.id,
        workspaceId,
        resultId: change.resultId,
        oldStatus: change.before.status,
        newStatus: change.after.status,
        oldMarks: dbMarks(change.before.marks),
        newMarks: dbMarks(change.after.marks),
        oldRemark: change.before.remark,
        newRemark: change.after.remark,
        changedByUserId: change.changedBy.userId,
        changedByRole: change.changedBy.role,
        changedByTeacherId: change.changedBy.teacherId,
        changedAt: change.now,
      },
    });
  }

  async changes(
    workspaceId: string,
    resultIds: readonly string[],
  ): Promise<TestResultChangeRecord[]> {
    if (resultIds.length === 0) return [];
    const rows = await this.db.trainingInstituteTestResultChange.findMany({
      where: { workspaceId, resultId: { in: [...resultIds] } },
      include: { changedByTeacher: { select: { name: true } } },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      resultId: row.resultId,
      before: {
        status: row.oldStatus,
        marks: marksOf(row.oldMarks),
        remark: row.oldRemark,
      },
      after: {
        status: row.newStatus,
        marks: marksOf(row.newMarks),
        remark: row.newRemark,
      },
      changedBy: {
        role: row.changedByRole,
        teacherName: row.changedByTeacher?.name ?? null,
      },
      changedAt: row.changedAt,
    }));
  }

  async familyStudents(
    workspaceId: string,
    role: FamilyRole,
    verifiedEmails: readonly string[],
  ): Promise<TestStudentView[]> {
    const emails = familyEmails(verifiedEmails);
    if (emails.size === 0) return [];
    const rows = await this.db.trainingInstituteStudent.findMany({
      where: { workspaceId, deletedAt: null },
      select: { id: true, name: true, email: true, profileDetails: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows
      .filter((row) => isLinkedStudent(row, role, emails))
      .map(({ id, name }) => ({ id, name }));
  }

  async publishedResults(
    workspaceId: string,
    studentIds: readonly string[],
  ): Promise<FamilyTestResultRecord[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.db.trainingInstituteTestResult.findMany({
      where: {
        workspaceId,
        studentId: { in: [...studentIds] },
        test: { ...LIVE_TEST, publishedAt: { not: null } },
      },
      include: {
        ...RESULT_INCLUDE,
        test: {
          include: { ...TEST_INCLUDE, batch: { include: BATCH_INCLUDE } },
        },
      },
    });
    return rows.map((row) => ({
      result: resultOf(row),
      test: testOf(row.test),
      batch: batchOf(row.test.batch),
    }));
  }
}
