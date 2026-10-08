import { randomUUID } from "node:crypto";

import { localNow } from "../domain/class-schedule";
import {
  assertMaxCoversMarks,
  assertPublishable,
  assertTestDate,
  passed,
  sameResult,
  testDetails,
  testResult,
  testStats,
  wasInBatchOn,
  type BatchSpan,
  type TestResultStatus,
} from "../domain/class-test";
import { DomainError } from "../domain/errors";
import type {
  ClassTestBatch,
  ClassTestRecord,
  ClassTestStore,
  TestResultChangeRecord,
  TestResultRecord,
} from "./class-test-ports";
import type {
  BatchTestStudentView,
  BatchTestsView,
  ClassTestBatchView,
  ClassTestDetailView,
  ClassTestView,
  FamilyTestResultsView,
  StaffClassTestView,
  StudentTestHistoryView,
  TestResultView,
  TestRosterRowView,
  TestStudentView,
  TestSummaryView,
} from "./class-test-views";
import type { BatchEnrollmentRecord, PosterRecord } from "./class-work-ports";
import type { ClassWorkFamily, ClassWorkStaff } from "./class-work-views";
import { BatchNotFoundError, StudentNotFoundError } from "./not-found-error";

export type ClassTestInput = {
  name: string;
  heldOn: string;
  maxMarks: number;
  passMarks?: number | null;
  topic?: string | null;
};

export type CreateClassTestInput = ClassTestInput & {
  /** Set for a single-student Test, such as a re-test. */
  studentId?: string | null;
};

export type TestResultInput = {
  studentId: string;
  /** Null leaves the Student blank (drafts only). */
  status: TestResultStatus | null;
  marks?: number | null;
  remark?: string | null;
};

function forbidden(): DomainError {
  return new DomainError(
    "CLASS_TEST_FORBIDDEN",
    "Only the Owner and Teachers assigned to this Batch can do this.",
  );
}

function testNotFound(): DomainError {
  return new DomainError("CLASS_TEST_NOT_FOUND", "Test not found.");
}

/** Each Student's time in the Batch, as local dates in its timezone. */
type BatchStudent = { name: string; spans: BatchSpan[] };

function batchStudents(
  enrollments: readonly BatchEnrollmentRecord[],
  timezones: ReadonlyMap<string, string>,
): Map<string, Map<string, BatchStudent>> {
  const byBatch = new Map<string, Map<string, BatchStudent>>();
  for (const enrollment of enrollments) {
    const timezone = timezones.get(enrollment.batchId);
    if (timezone == null) continue;
    const ends = [enrollment.endedAt, enrollment.studentDroppedAt]
      .filter((date): date is Date => date != null)
      .map((date) => localNow(date, timezone).date)
      .sort();
    const span: BatchSpan = {
      start: localNow(enrollment.createdAt, timezone).date,
      end: ends[0] ?? null,
    };
    const students =
      byBatch.get(enrollment.batchId) ?? new Map<string, BatchStudent>();
    const student = students.get(enrollment.studentId);
    if (student == null)
      students.set(enrollment.studentId, {
        name: enrollment.studentName,
        spans: [span],
      });
    else student.spans.push(span);
    byBatch.set(enrollment.batchId, students);
  }
  return byBatch;
}

/**
 * Who a Test lists. A published Test lists exactly the Students it was
 * published with. A draft single-student Test lists its Student; a draft
 * whole-batch Test lists Students in the Batch on the Test date, plus anyone
 * with a saved result.
 */
function listedStudents(
  test: ClassTestRecord,
  students: ReadonlyMap<string, BatchStudent>,
  results: readonly TestResultRecord[],
): TestStudentView[] {
  const listed = new Map<string, string>();
  for (const result of results)
    listed.set(result.studentId, result.studentName);
  if (test.publishedAt == null) {
    if (test.scope === "student" && test.student != null)
      listed.set(test.student.id, test.student.name);
    if (test.scope === "batch")
      for (const [id, student] of students)
        if (wasInBatchOn(student.spans, test.heldOn))
          listed.set(id, student.name);
  }
  return [...listed]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function resultView(
  result: TestResultRecord,
  passMarks: number | null,
): TestResultView {
  return {
    status: result.status,
    marks: result.marks,
    remark: result.remark,
    passed: passed(result, passMarks),
    updatedAt: result.updatedAt.toISOString(),
  };
}

function testView(test: ClassTestRecord): ClassTestView {
  return {
    id: test.id,
    batchId: test.batchId,
    name: test.name,
    heldOn: test.heldOn,
    maxMarks: test.maxMarks,
    passMarks: test.passMarks,
    topic: test.topic,
    scope: test.scope,
    student: test.student,
    createdBy: {
      role: test.createdBy.role,
      teacherName: test.createdBy.teacherName,
    },
    createdAt: test.createdAt.toISOString(),
    updatedAt: test.updatedAt.toISOString(),
    publishedAt: test.publishedAt?.toISOString() ?? null,
  };
}

function summary(
  test: ClassTestRecord,
  listed: readonly TestStudentView[],
  results: readonly TestResultRecord[],
): TestSummaryView {
  const onTest = new Set(listed.map((student) => student.id));
  const entered = results.filter((result) => onTest.has(result.studentId));
  const stats = testStats(entered);
  const batchWide = test.scope === "batch";
  const named = (result: TestResultRecord): TestStudentView => ({
    id: result.studentId,
    name: result.studentName,
  });
  const byName = <T extends TestStudentView>(a: T, b: T) =>
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return {
    listed: listed.length,
    entered: entered.length,
    tested: stats.tested,
    absent: stats.absent,
    exempt: stats.exempt,
    average: batchWide ? stats.average : null,
    highest: batchWide ? stats.highest : null,
    lowest: batchWide ? stats.lowest : null,
    belowPass: entered
      .flatMap((result) =>
        passed(result, test.passMarks) === false && result.marks != null
          ? [{ ...named(result), marks: result.marks }]
          : [],
      )
      .sort(byName),
    absentStudents: entered
      .filter((result) => result.status === "absent")
      .map(named)
      .sort(byName),
    exemptStudents: entered
      .filter((result) => result.status === "exempt")
      .map(named)
      .sort(byName),
  };
}

function batchView(batch: ClassTestBatch): ClassTestBatchView {
  return {
    id: batch.id,
    name: batch.name,
    courseName: batch.courseName,
    timezone: batch.timezone,
    closed: batch.closed,
  };
}

type Dated = { id: string; heldOn: string; createdAt: Date };

function byNewestTest(a: Dated, b: Dated): number {
  return (
    b.heldOn.localeCompare(a.heldOn) ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}

/** Commands and reads for Tests and their results (ADR-0037). */
export class ClassTestHandlers {
  private readonly newId: () => string;

  constructor(
    private readonly deps: {
      store: ClassTestStore;
      now: () => Date;
      newId?: () => string;
    },
  ) {
    this.newId = deps.newId ?? randomUUID;
  }

  private get store(): ClassTestStore {
    return this.deps.store;
  }

  // ---------------------------------------------------------------- staff

  /** Who is acting: the Owner, or an active Teacher. */
  private async staffPoster(
    actor: ClassWorkStaff,
    store: ClassTestStore,
  ): Promise<PosterRecord> {
    if (actor.role === "owner")
      return {
        userId: actor.userId,
        role: "owner",
        teacherId: null,
        teacherName: null,
      };
    const teacher = await store.activeTeacherForUser(
      actor.workspaceId,
      actor.userId,
    );
    if (teacher == null) throw forbidden();
    return {
      userId: actor.userId,
      role: "teacher",
      teacherId: teacher.id,
      teacherName: teacher.name,
    };
  }

  /** The Batch, and who acts on it: the Owner, or a Teacher assigned to it. */
  private async staffBatch(
    actor: ClassWorkStaff,
    batchId: string,
    store: ClassTestStore = this.store,
  ): Promise<{ batch: ClassTestBatch; poster: PosterRecord }> {
    const batch = await store.batch(actor.workspaceId, batchId);
    if (batch == null) throw new BatchNotFoundError();
    const poster = await this.staffPoster(actor, store);
    if (
      poster.teacherId != null &&
      !(await store.isAssigned(actor.workspaceId, poster.teacherId, batchId))
    )
      throw forbidden();
    return { batch, poster };
  }

  private async staffTest(
    actor: ClassWorkStaff,
    id: string,
    store: ClassTestStore,
  ): Promise<{
    test: ClassTestRecord;
    batch: ClassTestBatch;
    poster: PosterRecord;
  }> {
    const test = await store.findTest(actor.workspaceId, id);
    if (test == null) throw testNotFound();
    const { batch, poster } = await this.staffBatch(actor, test.batchId, store);
    return { test, batch, poster };
  }

  private dateRange(batch: ClassTestBatch): {
    firstDate: string;
    today: string;
  } {
    return {
      firstDate: localNow(batch.createdAt, batch.timezone).date,
      today: localNow(this.deps.now(), batch.timezone).date,
    };
  }

  private async studentsOf(
    workspaceId: string,
    batch: ClassTestBatch,
    store: ClassTestStore,
  ): Promise<Map<string, BatchStudent>> {
    const enrollments = await store.batchEnrollments(workspaceId, [batch.id]);
    return (
      batchStudents(enrollments, new Map([[batch.id, batch.timezone]])).get(
        batch.id,
      ) ?? new Map<string, BatchStudent>()
    );
  }

  private async detail(
    workspaceId: string,
    test: ClassTestRecord,
    batch: ClassTestBatch,
    store: ClassTestStore,
  ): Promise<ClassTestDetailView> {
    const [students, results] = await Promise.all([
      this.studentsOf(workspaceId, batch, store),
      store.results(workspaceId, [test.id]),
    ]);
    const listed = listedStudents(test, students, results);
    const changes = await store.changes(
      workspaceId,
      results.map((result) => result.id),
    );
    const resultByStudent = new Map(
      results.map((result) => [result.studentId, result]),
    );
    const changesByResult = new Map<string, TestResultChangeRecord[]>();
    for (const change of changes)
      changesByResult.set(change.resultId, [
        ...(changesByResult.get(change.resultId) ?? []),
        change,
      ]);
    const rows: TestRosterRowView[] = listed.map((student) => {
      const result = resultByStudent.get(student.id);
      return {
        student,
        result: result == null ? null : resultView(result, test.passMarks),
        history: (result == null
          ? []
          : (changesByResult.get(result.id) ?? [])
        ).map((change) => ({
          changedAt: change.changedAt.toISOString(),
          changedBy: change.changedBy,
          before: change.before,
          after: change.after,
        })),
      };
    });
    return {
      batch: batchView(batch),
      ...this.dateRange(batch),
      test: { ...testView(test), summary: summary(test, listed, results) },
      canDelete: test.publishedAt == null,
      rows,
    };
  }

  async batchTests(
    actor: ClassWorkStaff,
    batchId: string,
  ): Promise<BatchTestsView> {
    const { batch } = await this.staffBatch(actor, batchId);
    const [students, tests] = await Promise.all([
      this.studentsOf(actor.workspaceId, batch, this.store),
      this.store.tests(actor.workspaceId, [batch.id]),
    ]);
    const results = await this.store.results(
      actor.workspaceId,
      tests.map((test) => test.id),
    );
    const views: StaffClassTestView[] = tests.sort(byNewestTest).map((test) => {
      const own = results.filter((result) => result.testId === test.id);
      const listed = listedStudents(test, students, own);
      return { ...testView(test), summary: summary(test, listed, own) };
    });
    const roster: BatchTestStudentView[] = [...students]
      .map(([id, student]) => ({
        id,
        name: student.name,
        start: student.spans
          .map((span) => span.start)
          .reduce((a, b) => (a < b ? a : b)),
        end: student.spans.some((span) => span.end == null)
          ? null
          : student.spans
              .flatMap((span) => (span.end == null ? [] : [span.end]))
              .reduce((a, b) => (a > b ? a : b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      batch: batchView(batch),
      ...this.dateRange(batch),
      canCreate: !batch.closed,
      students: roster,
      tests: views,
    };
  }

  async testDetail(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<ClassTestDetailView> {
    const { test, batch } = await this.staffTest(actor, id, this.store);
    return this.detail(actor.workspaceId, test, batch, this.store);
  }

  async createTest(
    actor: ClassWorkStaff,
    batchId: string,
    input: CreateClassTestInput,
  ): Promise<ClassTestDetailView> {
    const details = testDetails(input);
    return this.store.transaction(async (store) => {
      const { batch, poster } = await this.staffBatch(actor, batchId, store);
      if (batch.closed)
        throw new DomainError(
          "BATCH_CLOSED",
          "This Batch is closed. New Tests can't be added.",
        );
      assertTestDate(details.heldOn, this.dateRange(batch));
      let student: TestStudentView | null = null;
      if (input.studentId != null) {
        const students = await this.studentsOf(actor.workspaceId, batch, store);
        const found = students.get(input.studentId);
        if (found == null || !wasInBatchOn(found.spans, details.heldOn))
          throw new DomainError(
            "CLASS_TEST_STUDENT_NOT_IN_BATCH",
            found == null
              ? "That Student isn't in this Batch."
              : `${found.name} wasn't in this Batch on that date.`,
          );
        student = { id: input.studentId, name: found.name };
      }
      const now = this.deps.now();
      const record: ClassTestRecord = {
        id: this.newId(),
        batchId: batch.id,
        scope: student == null ? "batch" : "student",
        student,
        ...details,
        createdBy: poster,
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      };
      await store.insertTest(actor.workspaceId, record);
      return this.detail(actor.workspaceId, record, batch, store);
    });
  }

  async updateTest(
    actor: ClassWorkStaff,
    id: string,
    input: ClassTestInput,
  ): Promise<ClassTestDetailView> {
    const details = testDetails(input);
    return this.store.transaction(async (store) => {
      await store.lockTest(actor.workspaceId, id);
      const { test, batch } = await this.staffTest(actor, id, store);
      const results = await store.results(actor.workspaceId, [test.id]);
      if (details.heldOn !== test.heldOn) {
        if (test.publishedAt != null)
          throw new DomainError(
            "CLASS_TEST_DATE_LOCKED",
            "The date can't change after the Test is published.",
          );
        assertTestDate(details.heldOn, this.dateRange(batch));
        const students = await this.studentsOf(actor.workspaceId, batch, store);
        const mustStay = new Map(
          results.map((result) => [result.studentId, result.studentName]),
        );
        if (test.student != null)
          mustStay.set(test.student.id, test.student.name);
        for (const [studentId, name] of mustStay) {
          const spans = students.get(studentId)?.spans ?? [];
          if (!wasInBatchOn(spans, details.heldOn))
            throw new DomainError(
              "CLASS_TEST_STUDENT_NOT_IN_BATCH",
              `${name} wasn't in this Batch on that date.`,
            );
        }
      }
      const marks = results
        .map((result) => result.marks)
        .filter((value): value is number => value != null);
      assertMaxCoversMarks(
        details.maxMarks,
        marks.length === 0 ? null : Math.max(...marks),
      );
      const now = this.deps.now();
      await store.updateTest(actor.workspaceId, id, details, actor.userId, now);
      return this.detail(
        actor.workspaceId,
        { ...test, ...details, updatedAt: now },
        batch,
        store,
      );
    });
  }

  async deleteTest(actor: ClassWorkStaff, id: string): Promise<{ id: string }> {
    return this.store.transaction(async (store) => {
      await store.lockTest(actor.workspaceId, id);
      const { test } = await this.staffTest(actor, id, store);
      if (test.publishedAt != null)
        throw new DomainError(
          "CLASS_TEST_PUBLISHED",
          "A published Test can't be deleted.",
        );
      await store.deleteTest(
        actor.workspaceId,
        id,
        actor.userId,
        this.deps.now(),
      );
      return { id };
    });
  }

  /**
   * Saves results for listed Students. Never publishes. After publishing,
   * each change is logged with the old and new values.
   */
  async saveResults(
    actor: ClassWorkStaff,
    id: string,
    entries: readonly TestResultInput[],
  ): Promise<ClassTestDetailView> {
    return this.store.transaction(async (store) => {
      await store.lockTest(actor.workspaceId, id);
      const { test, batch, poster } = await this.staffTest(actor, id, store);
      const [students, results] = await Promise.all([
        this.studentsOf(actor.workspaceId, batch, store),
        store.results(actor.workspaceId, [test.id]),
      ]);
      const listed = new Map(
        listedStudents(test, students, results).map((student) => [
          student.id,
          student.name,
        ]),
      );
      const existing = new Map(
        results.map((result) => [result.studentId, result]),
      );
      const published = test.publishedAt != null;
      const seen = new Set<string>();
      const plan = entries.map((entry) => {
        const name = listed.get(entry.studentId);
        if (name == null)
          throw new DomainError(
            "CLASS_TEST_STUDENT_NOT_LISTED",
            "That Student isn't listed on this Test.",
          );
        if (seen.has(entry.studentId))
          throw new DomainError(
            "CLASS_TEST_STUDENT_REPEATED",
            `${name} appears more than once.`,
          );
        seen.add(entry.studentId);
        const current = existing.get(entry.studentId) ?? null;
        if (entry.status == null) {
          if (published)
            throw new DomainError(
              "CLASS_TEST_RESULT_REQUIRED",
              `Published results can't be left blank. Mark ${name} absent or exempt instead.`,
            );
          if (
            (entry.remark?.trim() ?? "") !== "" ||
            (entry.marks ?? null) != null
          )
            throw new DomainError(
              "CLASS_TEST_STATUS_REQUIRED",
              `Choose scored, absent, or exempt for ${name}.`,
            );
          return { studentId: entry.studentId, current, next: null };
        }
        return {
          studentId: entry.studentId,
          current,
          next: testResult(
            { status: entry.status, marks: entry.marks, remark: entry.remark },
            test.maxMarks,
            name,
          ),
        };
      });
      const now = this.deps.now();
      for (const { studentId, current, next } of plan) {
        if (next == null) {
          if (current != null)
            await store.deleteResult(actor.workspaceId, current.id);
          continue;
        }
        if (current == null) {
          await store.insertResult(actor.workspaceId, {
            id: this.newId(),
            testId: test.id,
            studentId,
            result: next,
            userId: actor.userId,
            now,
          });
          continue;
        }
        if (sameResult(current, next)) continue;
        await store.updateResult(
          actor.workspaceId,
          current.id,
          next,
          actor.userId,
          now,
        );
        if (published)
          await store.insertChange(actor.workspaceId, {
            id: this.newId(),
            resultId: current.id,
            before: {
              status: current.status,
              marks: current.marks,
              remark: current.remark,
            },
            after: next,
            changedBy: poster,
            now,
          });
      }
      return this.detail(actor.workspaceId, test, batch, store);
    });
  }

  /** Makes the results visible to the listed Students and their Parents. */
  async publishTest(
    actor: ClassWorkStaff,
    id: string,
  ): Promise<ClassTestDetailView> {
    return this.store.transaction(async (store) => {
      await store.lockTest(actor.workspaceId, id);
      const { test, batch } = await this.staffTest(actor, id, store);
      if (test.publishedAt != null)
        throw new DomainError(
          "CLASS_TEST_ALREADY_PUBLISHED",
          "This Test is already published.",
        );
      const [students, results] = await Promise.all([
        this.studentsOf(actor.workspaceId, batch, store),
        store.results(actor.workspaceId, [test.id]),
      ]);
      const entered = new Set(results.map((result) => result.studentId));
      assertPublishable(
        listedStudents(test, students, results).map((student) => ({
          name: student.name,
          hasResult: entered.has(student.id),
        })),
      );
      const now = this.deps.now();
      await store.publishTest(actor.workspaceId, id, actor.userId, now);
      return this.detail(
        actor.workspaceId,
        { ...test, publishedAt: now },
        batch,
        store,
      );
    });
  }

  /**
   * A Student's Tests, drafts included: every Batch for the Owner, and the
   * Teacher's assigned Batches for a Teacher.
   */
  async studentTests(
    actor: ClassWorkStaff,
    studentId: string,
  ): Promise<StudentTestHistoryView> {
    const student = await this.store.student(actor.workspaceId, studentId);
    if (student == null) throw new StudentNotFoundError();
    const poster = await this.staffPoster(actor, this.store);
    let batchIds = await this.store.studentBatchIds(
      actor.workspaceId,
      studentId,
    );
    if (poster.teacherId != null) {
      const assigned = new Set(
        await this.store.assignedBatchIds(actor.workspaceId, poster.teacherId),
      );
      batchIds = batchIds.filter((batchId) => assigned.has(batchId));
      if (batchIds.length === 0) throw forbidden();
    }
    const [batches, tests, enrollments] = await Promise.all([
      this.store.batches(actor.workspaceId, batchIds),
      this.store.tests(actor.workspaceId, batchIds),
      this.store.batchEnrollments(actor.workspaceId, batchIds),
    ]);
    const batchById = new Map(batches.map((batch) => [batch.id, batch]));
    const students = batchStudents(
      enrollments,
      new Map(batches.map((batch) => [batch.id, batch.timezone])),
    );
    const results = await this.store.results(
      actor.workspaceId,
      tests.map((test) => test.id),
    );
    const items: StudentTestHistoryView["tests"] = [];
    for (const test of tests.sort(byNewestTest)) {
      const batch = batchById.get(test.batchId);
      if (batch == null) continue;
      const own = results.filter((result) => result.testId === test.id);
      const listed = listedStudents(
        test,
        students.get(test.batchId) ?? new Map<string, BatchStudent>(),
        own,
      );
      if (!listed.some((entry) => entry.id === studentId)) continue;
      const result = own.find((entry) => entry.studentId === studentId);
      items.push({
        ...testView(test),
        batch: batchView(batch),
        result: result == null ? null : resultView(result, test.passMarks),
      });
    }
    return { student, tests: items };
  }

  // --------------------------------------------------------------- family

  /** Published results of the Student, or of each linked Student. */
  async familyResults(family: ClassWorkFamily): Promise<FamilyTestResultsView> {
    const students = await this.store.familyStudents(
      family.workspaceId,
      family.role,
      family.verifiedEmails,
    );
    const records = await this.store.publishedResults(
      family.workspaceId,
      students.map((student) => student.id),
    );
    return {
      students: students.map((student) => ({
        ...student,
        results: records
          .filter((record) => record.result.studentId === student.id)
          .sort((a, b) => byNewestTest(a.test, b.test))
          .map(({ result, test, batch }) => ({
            testId: test.id,
            batch: {
              id: batch.id,
              name: batch.name,
              courseName: batch.courseName,
            },
            name: test.name,
            heldOn: test.heldOn,
            maxMarks: test.maxMarks,
            passMarks: test.passMarks,
            topic: test.topic,
            scope: test.scope,
            status: result.status,
            marks: result.marks,
            passed: passed(result, test.passMarks),
            remark: result.remark,
            publishedAt: (test.publishedAt ?? test.updatedAt).toISOString(),
          })),
      })),
    };
  }
}
