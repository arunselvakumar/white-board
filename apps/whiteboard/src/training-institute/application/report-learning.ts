// Test and Homework reports: R15 Student test results, R16 Batch test
// performance, R17 Homework (Reports PRD §5). Only published results appear
// (#28, ADR-0038); families never see another Student, an average, a highest
// score, a rank or the change history. Homework follows #21 (ADR-0033).

import { localNow } from "../domain/class-schedule";
import {
  canSeeItem,
  isLate,
  isOverdue,
  owesHomework,
  type BatchAccess,
} from "../domain/class-work";
import {
  HOMEWORK_REPORT_STATUS_LABELS,
  type HomeworkReportStatus,
} from "../domain/report-catalogue";
import {
  formatGeneratedAt,
  formatMarks,
  formatPercent,
  formatReportDate,
  percentOf,
} from "../domain/report-format";
import type { ReportContext, ReportQuery } from "./report-context";
import {
  countCell,
  metrics,
  percentCell,
  row,
  table,
  textCell,
  type ReportCell,
  type ReportDocument,
  type ReportSection,
} from "./report-document";
import type {
  ReportBatch,
  ReportHomework,
  ReportTest,
  ReportTestResult,
} from "./report-ports";

const RESULT_STATUS = {
  scored: "Scored",
  absent: "Absent",
  exempt: "Exempt",
} as const;

function testPercent(test: ReportTest, result: ReportTestResult | undefined) {
  if (result?.status !== "scored" || result.marks == null || test.maxMarks <= 0)
    return null;
  return Math.round((result.marks / test.maxMarks) * 100);
}

function passText(test: ReportTest, result: ReportTestResult | undefined) {
  if (
    result?.status !== "scored" ||
    result.marks == null ||
    test.passMarks == null
  )
    return null;
  return result.marks >= test.passMarks ? "Pass" : "Fail";
}

/** Whether a Student was in a Batch on a date. */
function inBatchOn(
  ctx: ReportContext,
  studentId: string,
  batchId: string,
  date: string,
): boolean {
  return ctx.enrollmentsOfStudent(studentId).some((enrollment) => {
    if (enrollment.batchId !== batchId) return false;
    const window = ctx.enrollmentWindow(enrollment);
    return window.start <= date && (window.end == null || date <= window.end);
  });
}

/** Tests a Student sat or was listed for, that the viewer may see. */
function studentTests(
  ctx: ReportContext,
  studentId: string,
  tests: readonly ReportTest[],
  query: ReportQuery,
): ReportTest[] {
  return tests
    .filter((test) =>
      test.scope === "student" ? test.studentId === studentId : true,
    )
    .filter(
      (test) =>
        test.results.some((result) => result.studentId === studentId) ||
        (test.scope === "batch" &&
          inBatchOn(ctx, studentId, test.batchId, test.heldOn)),
    )
    .filter(
      (test) => ctx.isFamily || ctx.seesBatchOn(test.batchId, test.heldOn),
    )
    .filter((test) => query.batchId == null || test.batchId === query.batchId)
    .filter(
      (test) =>
        query.courseId == null ||
        ctx.batch(test.batchId)?.courseId === query.courseId,
    )
    .sort(
      (a, b) =>
        a.heldOn.localeCompare(b.heldOn) || a.name.localeCompare(b.name),
    );
}

/** R15: one Student's published Test results. */
export async function testResultsReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const student = ctx.subjectStudent(query.studentId, period);
  const tests = studentTests(
    ctx,
    student.id,
    await ctx.source.tests(ctx.viewer.workspaceId, period),
    query,
  );
  const filters = [
    { label: "Student", value: student.name },
    {
      label: "Course",
      value: query.courseId == null ? null : ctx.courseName(query.courseId),
    },
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
  ];
  if (tests.length === 0)
    return ctx.document({
      report: "test-results",
      subject: student.name,
      period,
      filters,
      pages: [],
      emptyText: "No published test results in this period.",
    });
  const entries = tests.map((test) => ({
    test,
    result: test.results.find((item) => item.studentId === student.id),
  }));
  const sections: ReportSection[] = [
    table({
      id: "results",
      title: "Results",
      description:
        "Absent and Exempt are shown as such and never counted as zero.",
      columns: [
        { key: "test", label: "Test" },
        { key: "date", label: "Date" },
        { key: "batch", label: "Batch" },
        { key: "topic", label: "Topic" },
        { key: "marks", label: "Marks", align: "right" },
        { key: "percent", label: "%", align: "right" },
        { key: "result", label: "Result" },
        { key: "remark", label: "Teacher's remark" },
      ],
      rows: entries.map(({ test, result }) => {
        const pass = passText(test, result);
        return row({
          test: textCell(
            test.scope === "student" ? `${test.name} (Re-test)` : test.name,
          ),
          date: textCell(formatReportDate(test.heldOn)),
          batch: textCell(ctx.batch(test.batchId)?.name),
          topic: textCell(test.topic),
          marks: textCell(
            result == null
              ? "Not entered"
              : result.status === "scored" && result.marks != null
                ? `${formatMarks(result.marks)}/${String(test.maxMarks)}`
                : RESULT_STATUS[result.status],
            result?.status === "scored" ? null : "muted",
          ),
          percent: percentCell(testPercent(test, result)),
          result: textCell(
            pass,
            pass === "Fail" ? "danger" : pass === "Pass" ? "good" : null,
          ),
          remark: textCell(result?.remark),
        });
      }),
      emptyText: "No published test results in this period.",
    }),
  ];
  if (ctx.isStaff) {
    const trend = entries
      .map(({ test, result }) => testPercent(test, result))
      .filter((value): value is number => value != null);
    sections.push(
      metrics({
        id: "trend",
        title: "Trend",
        items: [
          {
            label: "Scores over the period",
            value:
              trend.length === 0
                ? "–"
                : trend.map((value) => formatPercent(value)).join(" → "),
          },
        ],
      }),
    );
    const changes = entries.flatMap(({ test, result }) =>
      (result?.changes ?? []).map((change) => ({ test, change })),
    );
    const names = await ctx.source.userNames(
      changes.map((item) => item.change.changedByUserId),
    );
    const value = (status: string, marks: number | null) =>
      status === "scored" && marks != null
        ? formatMarks(marks)
        : RESULT_STATUS[status as keyof typeof RESULT_STATUS];
    sections.push(
      table({
        id: "changes",
        title: "Change history (staff only)",
        columns: [
          { key: "test", label: "Test" },
          { key: "old", label: "Old mark" },
          { key: "new", label: "New mark" },
          { key: "by", label: "Changed by" },
          { key: "when", label: "When" },
        ],
        rows: changes.map(({ test, change }) =>
          row({
            test: textCell(test.name),
            old: textCell(value(change.oldStatus, change.oldMarks)),
            new: textCell(value(change.newStatus, change.newMarks)),
            by: textCell(names.get(change.changedByUserId)),
            when: textCell(formatGeneratedAt(change.changedAt, ctx.timezone)),
          }),
        ),
        emptyText: "No marks were changed after publishing.",
      }),
    );
  }
  return ctx.document({
    report: "test-results",
    subject: student.name,
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** Summary of a whole-Batch Test's scored marks. */
export function testStats(test: ReportTest) {
  const scored = test.results.filter(
    (result): result is ReportTestResult & { marks: number } =>
      result.status === "scored" && result.marks != null,
  );
  const marks = scored.map((result) => result.marks);
  const below =
    test.passMarks == null
      ? []
      : scored.filter((result) => result.marks < (test.passMarks ?? 0));
  return {
    listed: test.results.length,
    scored: scored.length,
    absent: test.results.filter((result) => result.status === "absent").length,
    exempt: test.results.filter((result) => result.status === "exempt").length,
    average:
      marks.length === 0
        ? null
        : marks.reduce((a, b) => a + b, 0) / marks.length,
    highest: marks.length === 0 ? null : Math.max(...marks),
    lowest: marks.length === 0 ? null : Math.min(...marks),
    below,
  };
}

/** R16: whole-Batch Tests, Student by Test, and who keeps falling below. */
export async function batchTestsReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const batch = ctx.staffBatch(query.batchId, period);
  const tests = (await ctx.source.tests(ctx.viewer.workspaceId, period))
    .filter((test) => test.batchId === batch.id)
    .filter((test) => ctx.seesBatchOn(batch.id, test.heldOn))
    .sort(
      (a, b) =>
        a.heldOn.localeCompare(b.heldOn) || a.name.localeCompare(b.name),
    );
  const filters = [{ label: "Batch", value: batch.name }];
  if (tests.length === 0)
    return ctx.document({
      report: "batch-tests",
      subject: batch.name,
      period,
      filters,
      pages: [],
      emptyText: "No published Tests for this Batch in this period.",
    });
  const whole = tests.filter((test) => test.scope === "batch");
  const single = tests.filter((test) => test.scope === "student");
  const studentIds = [
    ...new Set(
      whole.flatMap((test) => test.results.map((result) => result.studentId)),
    ),
  ];
  const students = studentIds
    .map((id) => ({ id, name: ctx.student(id)?.name ?? "Student" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const marks = (value: number | null) =>
    value == null ? "–" : formatMarks(Math.round(value * 10) / 10);
  const grid = students.map((student) => {
    const cells: Record<string, ReportCell> = {
      student: textCell(student.name),
    };
    const percents: number[] = [];
    let belowCount = 0;
    for (const test of whole) {
      const result = test.results.find((item) => item.studentId === student.id);
      const percent = testPercent(test, result);
      if (percent != null) percents.push(percent);
      const below = passText(test, result) === "Fail";
      if (below) belowCount += 1;
      cells[test.id] =
        result == null
          ? { text: "" }
          : result.status !== "scored"
            ? textCell(RESULT_STATUS[result.status], "muted")
            : percentCell(percent, below ? "danger" : null);
    }
    const average =
      percents.length === 0
        ? null
        : Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
    cells["average"] = percentCell(average);
    cells["flag"] = textCell(
      belowCount >= 2 ? `Below pass in ${String(belowCount)} Tests` : "",
      belowCount >= 2 ? "danger" : null,
    );
    return { student, cells, belowCount };
  });
  const flagged = grid.filter((item) => item.belowCount >= 2);
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Whole-Batch Tests", value: String(whole.length) },
        { label: "Single-student Tests", value: String(single.length) },
        {
          label: "Below pass in 2+ Tests",
          value:
            flagged.length === 0
              ? "None"
              : flagged.map((item) => item.student.name).join(", "),
          tone: flagged.length > 0 ? "danger" : "good",
        },
      ],
    }),
    table({
      id: "tests",
      title: "Whole-Batch Tests",
      description:
        "Single-student Tests are listed apart and never counted in the average, highest or lowest.",
      columns: [
        { key: "test", label: "Test" },
        { key: "date", label: "Date" },
        { key: "max", label: "Out of", align: "right" },
        { key: "listed", label: "Listed", align: "right" },
        { key: "scored", label: "Scored", align: "right" },
        { key: "absent", label: "Absent", align: "right" },
        { key: "exempt", label: "Exempt", align: "right" },
        { key: "average", label: "Average", align: "right" },
        { key: "highest", label: "Highest", align: "right" },
        { key: "lowest", label: "Lowest", align: "right" },
        { key: "below", label: "Below pass" },
      ],
      rows: whole.map((test) => {
        const stats = testStats(test);
        return row({
          test: textCell(test.name),
          date: textCell(formatReportDate(test.heldOn)),
          max: countCell(test.maxMarks),
          listed: countCell(stats.listed),
          scored: countCell(stats.scored),
          absent: countCell(stats.absent),
          exempt: countCell(stats.exempt),
          average: textCell(marks(stats.average)),
          highest: textCell(marks(stats.highest)),
          lowest: textCell(marks(stats.lowest)),
          below: textCell(
            test.passMarks == null
              ? "No pass mark"
              : stats.below.length === 0
                ? "None"
                : `${String(stats.below.length)}: ${stats.below
                    .map((result) => ctx.student(result.studentId)?.name ?? "")
                    .join(", ")} (pass ${String(test.passMarks)})`,
            stats.below.length > 0 ? "danger" : null,
          ),
        });
      }),
      emptyText: "No whole-Batch Tests in this period.",
    }),
    table({
      id: "grid",
      title: "Students by Test (% scored)",
      columns: [
        { key: "student", label: "Student" },
        ...whole.map((test) => ({
          key: test.id,
          label: test.name,
          detail: formatReportDate(test.heldOn),
          align: "right" as const,
        })),
        { key: "average", label: "Average", align: "right" },
        { key: "flag", label: "Flag" },
      ],
      rows: grid.map((item) => row(item.cells)),
      emptyText: "No whole-Batch Tests in this period.",
      stickyFirstColumn: true,
    }),
    table({
      id: "single",
      title: "Single-student Tests",
      columns: [
        { key: "test", label: "Test" },
        { key: "date", label: "Date" },
        { key: "student", label: "Student" },
        { key: "marks", label: "Marks", align: "right" },
        { key: "result", label: "Result" },
      ],
      rows: single.map((test) => {
        const result = test.results[0];
        const pass = passText(test, result);
        return row({
          test: textCell(`${test.name} (Re-test)`),
          date: textCell(formatReportDate(test.heldOn)),
          student: textCell(ctx.student(test.studentId ?? "")?.name),
          marks: textCell(
            result == null
              ? "Not entered"
              : result.status === "scored" && result.marks != null
                ? `${formatMarks(result.marks)}/${String(test.maxMarks)}`
                : RESULT_STATUS[result.status],
          ),
          result: textCell(pass, pass === "Fail" ? "danger" : null),
        });
      }),
      emptyText: "No single-student Tests in this period.",
    }),
  ];
  return ctx.document({
    report: "batch-tests",
    subject: batch.name,
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}

/** A Student's access to a Batch, merged across Enrollments as #21 does. */
export function batchAccess(
  ctx: ReportContext,
  studentId: string,
  batch: ReportBatch,
): BatchAccess | null {
  const dropped = ctx.student(studentId)?.droppedAt ?? null;
  const merged: BatchAccess[] = [];
  for (const enrollment of ctx.enrollmentsOfStudent(studentId)) {
    if (enrollment.batchId !== batch.id) continue;
    const ends = [enrollment.endedAt, batch.closedAt, dropped].filter(
      (value): value is Date => value != null,
    );
    const endedAt =
      ends.length === 0
        ? null
        : new Date(Math.min(...ends.map((value) => value.getTime())));
    const start = localNow(enrollment.createdAt, batch.timezone).date;
    const current = merged[0];
    // Several Enrollments in one Batch: an active one wins; otherwise the
    // latest end counts, with the earliest start (as #21 merges them).
    if (current == null) merged[0] = { start, endedAt };
    else if (current.endedAt == null && endedAt == null)
      merged[0] = {
        start: start < current.start ? start : current.start,
        endedAt: null,
      };
    else if (current.endedAt == null) continue;
    else if (endedAt == null) merged[0] = { start, endedAt: null };
    else
      merged[0] = {
        start: start < current.start ? start : current.start,
        endedAt: endedAt > current.endedAt ? endedAt : current.endedAt,
      };
  }
  const access = merged[0] ?? null;
  return access;
}

type HomeworkCell = {
  homework: ReportHomework;
  batch: ReportBatch;
  studentId: string;
  owed: boolean;
  status: "submitted" | "late" | "not_submitted" | "overdue" | "not_due";
  checked: boolean;
  byParent: boolean;
  remark: string | null;
};

function homeworkCells(
  ctx: ReportContext,
  batch: ReportBatch,
  homework: ReportHomework,
  studentIds: readonly string[],
): HomeworkCell[] {
  const cells: HomeworkCell[] = [];
  for (const studentId of studentIds) {
    const access = batchAccess(ctx, studentId, batch);
    if (access == null || !canSeeItem(access, homework.postedAt)) continue;
    const owed = owesHomework(access, homework.dueOn);
    const submission = homework.submissions.find(
      (item) => item.studentId === studentId,
    );
    const overdue = isOverdue(homework.dueOn, ctx.now, batch.timezone);
    cells.push({
      homework,
      batch,
      studentId,
      owed,
      status:
        submission != null
          ? isLate(submission.submittedAt, homework.dueOn, batch.timezone)
            ? "late"
            : "submitted"
          : owed && overdue
            ? "overdue"
            : overdue
              ? "not_submitted"
              : "not_due",
      checked: submission?.checkedAt != null,
      byParent: submission?.submittedByRole === "parent",
      remark: submission?.checkedAt != null ? submission.remark : null,
    });
  }
  return cells;
}

/** One Student's Homework cells across Batches, as R17 counts them. */
export function homeworkCellsFor(
  ctx: ReportContext,
  items: readonly ReportHomework[],
  studentId: string,
): HomeworkCell[] {
  return items.flatMap((homework) => {
    const batch = ctx.batch(homework.batchId);
    return batch == null
      ? []
      : homeworkCells(ctx, batch, homework, [studentId]);
  });
}

function matchesStatus(
  cell: HomeworkCell,
  status: HomeworkReportStatus | null,
) {
  if (status == null) return true;
  switch (status) {
    case "submitted":
      return cell.status === "submitted";
    case "late":
      return cell.status === "late";
    case "not_submitted":
      return (
        cell.status === "not_submitted" ||
        cell.status === "overdue" ||
        cell.status === "not_due"
      );
    case "overdue":
      return cell.status === "overdue";
    case "checked":
      return cell.checked;
    case "not_checked":
      return (
        (cell.status === "submitted" || cell.status === "late") && !cell.checked
      );
  }
}

const CELL_TEXT: Record<HomeworkCell["status"], string> = {
  submitted: "Submitted",
  late: "Submitted late",
  not_submitted: "Not submitted",
  overdue: "Overdue",
  not_due: "Not due yet",
};

/** R17: Homework set, submitted and checked; families see only their own. */
export async function homeworkReport(
  ctx: ReportContext,
  query: ReportQuery,
): Promise<ReportDocument> {
  const period = ctx.period(query, "this_month");
  const status = (query.homeworkStatus ?? null) as HomeworkReportStatus | null;
  const items = await ctx.source.homework(ctx.viewer.workspaceId, period);
  if (ctx.isFamily) {
    const student = ctx.subjectStudent(query.studentId);
    const filters = [{ label: "Student", value: student.name }];
    const cells = items
      .filter((homework) => homework.removedAt == null)
      .flatMap((homework) => {
        const batch = ctx.batch(homework.batchId);
        return batch == null
          ? []
          : homeworkCells(ctx, batch, homework, [student.id]);
      })
      .filter((cell) => matchesStatus(cell, status))
      .sort((a, b) => a.homework.dueOn.localeCompare(b.homework.dueOn));
    if (cells.length === 0)
      return ctx.document({
        report: "homework",
        subject: student.name,
        period,
        filters,
        pages: [],
        emptyText: `No Homework due in this period for ${student.name}.`,
      });
    return ctx.document({
      report: "homework",
      subject: student.name,
      period,
      filters,
      pages: [
        {
          heading: null,
          sections: [
            metrics({
              id: "summary",
              title: "Summary",
              items: [
                { label: "Homework", value: String(cells.length) },
                {
                  label: "Submitted",
                  value: String(
                    cells.filter((cell) => cell.status === "submitted").length,
                  ),
                },
                {
                  label: "Submitted late",
                  value: String(
                    cells.filter((cell) => cell.status === "late").length,
                  ),
                },
                {
                  label: "Overdue",
                  value: String(
                    cells.filter((cell) => cell.status === "overdue").length,
                  ),
                  tone: cells.some((cell) => cell.status === "overdue")
                    ? "danger"
                    : null,
                },
              ],
            }),
            table({
              id: "homework",
              title: "Homework",
              columns: [
                { key: "title", label: "Homework" },
                { key: "batch", label: "Batch" },
                { key: "due", label: "Due" },
                { key: "status", label: "Status" },
                { key: "by", label: "Marked done by" },
                { key: "remark", label: "Teacher's remark" },
              ],
              rows: cells.map((cell) =>
                row({
                  title: textCell(cell.homework.title),
                  batch: textCell(cell.batch.name),
                  due: textCell(formatReportDate(cell.homework.dueOn)),
                  status: textCell(
                    `${CELL_TEXT[cell.status]}${cell.checked ? " · Checked" : ""}`,
                    cell.status === "overdue"
                      ? "danger"
                      : cell.status === "late"
                        ? "warn"
                        : null,
                  ),
                  by: textCell(
                    cell.status === "submitted" || cell.status === "late"
                      ? cell.byParent
                        ? "Marked done by parent"
                        : "Student"
                      : null,
                  ),
                  remark: textCell(cell.remark),
                }),
              ),
              emptyText: "No Homework.",
            }),
          ],
        },
      ],
    });
  }
  const batches = ctx
    .staffBatches(period)
    .filter((batch) => query.batchId == null || batch.id === query.batchId);
  const filters = [
    {
      label: "Batch",
      value: query.batchId == null ? null : ctx.batch(query.batchId)?.name,
    },
    {
      label: "Status",
      value: status == null ? null : HOMEWORK_REPORT_STATUS_LABELS[status],
    },
  ];
  const rows: {
    homework: ReportHomework;
    batch: ReportBatch;
    cells: HomeworkCell[];
  }[] = [];
  for (const batch of batches) {
    const studentIds = [
      ...new Set(
        ctx.enrollmentsOfBatch(batch.id).map((item) => item.studentId),
      ),
    ];
    for (const homework of items) {
      if (homework.batchId !== batch.id) continue;
      if (!ctx.seesBatchOn(batch.id, homework.classDate)) continue;
      rows.push({
        homework,
        batch,
        cells: homeworkCells(ctx, batch, homework, studentIds),
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.homework.dueOn.localeCompare(b.homework.dueOn) ||
      a.batch.name.localeCompare(b.batch.name),
  );
  if (rows.length === 0)
    return ctx.document({
      report: "homework",
      period,
      filters,
      pages: [],
      emptyText: "No Homework due in this period.",
    });
  const live = rows.filter((item) => item.homework.removedAt == null);
  const perStudent = new Map<string, HomeworkCell[]>();
  for (const item of live)
    for (const cell of item.cells) {
      const key = `${cell.studentId} ${cell.batch.id}`;
      const list = perStudent.get(key) ?? [];
      perStudent.set(key, list);
      list.push(cell);
    }
  const count = (
    cells: readonly HomeworkCell[],
    value: HomeworkCell["status"],
  ) => cells.filter((cell) => cell.status === value).length;
  const allCells = live.flatMap((item) => item.cells);
  const submitted = allCells.filter(
    (cell) => cell.status === "submitted" || cell.status === "late",
  ).length;
  const sections: ReportSection[] = [
    metrics({
      id: "summary",
      title: "Summary",
      items: [
        { label: "Homework set", value: String(live.length) },
        {
          label: "Submission rate",
          value: formatPercent(percentOf(submitted, allCells.length)),
          detail: `${String(submitted)} of ${String(allCells.length)} expected`,
        },
        { label: "Overdue", value: String(count(allCells, "overdue")) },
        {
          label: "Not yet checked",
          value: String(
            allCells.filter(
              (cell) =>
                (cell.status === "submitted" || cell.status === "late") &&
                !cell.checked,
            ).length,
          ),
        },
      ],
    }),
    table({
      id: "items",
      title: "Homework items",
      columns: [
        { key: "title", label: "Homework" },
        { key: "batch", label: "Batch" },
        { key: "class", label: "Class date" },
        { key: "due", label: "Due" },
        { key: "expected", label: "Expected", align: "right" },
        { key: "onTime", label: "On time", align: "right" },
        { key: "late", label: "Late", align: "right" },
        { key: "notSubmitted", label: "Not submitted", align: "right" },
        { key: "overdue", label: "Overdue", align: "right" },
        { key: "checked", label: "Checked", align: "right" },
        { key: "unchecked", label: "Not yet checked", align: "right" },
      ],
      rows: rows.map(({ homework, batch, cells }) => {
        const done = cells.filter(
          (cell) => cell.status === "submitted" || cell.status === "late",
        );
        return row(
          {
            title: textCell(
              homework.removedAt == null
                ? homework.title
                : `${homework.title} (Removed)`,
            ),
            batch: textCell(batch.name),
            class: textCell(formatReportDate(homework.classDate)),
            due: textCell(formatReportDate(homework.dueOn)),
            expected: countCell(cells.length),
            onTime: countCell(count(cells, "submitted")),
            late: countCell(count(cells, "late")),
            notSubmitted: countCell(cells.length - done.length),
            overdue: countCell(
              count(cells, "overdue"),
              count(cells, "overdue") > 0 ? "danger" : null,
            ),
            checked: countCell(done.filter((cell) => cell.checked).length),
            unchecked: countCell(done.filter((cell) => !cell.checked).length),
          },
          homework.removedAt == null ? null : "muted",
        );
      }),
      emptyText: "No Homework due in this period.",
    }),
    table({
      id: "students",
      title: "By Student",
      description: "Students with 3 or more overdue items are flagged.",
      columns: [
        { key: "student", label: "Student" },
        { key: "batch", label: "Batch" },
        { key: "expected", label: "Expected", align: "right" },
        { key: "submitted", label: "Submitted", align: "right" },
        { key: "rate", label: "Submission rate", align: "right" },
        { key: "overdue", label: "Overdue", align: "right" },
        { key: "flag", label: "Flag" },
      ],
      rows: [...perStudent.values()]
        .map((cells) => ({
          name: ctx.student(cells[0]?.studentId ?? "")?.name ?? "Student",
          batch: cells[0]?.batch.name ?? "",
          cells,
        }))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.batch.localeCompare(b.batch),
        )
        .map(({ name, batch, cells }) => {
          const done = count(cells, "submitted") + count(cells, "late");
          const overdue = count(cells, "overdue");
          return row({
            student: textCell(name),
            batch: textCell(batch),
            expected: countCell(cells.length),
            submitted: countCell(done),
            rate: percentCell(percentOf(done, cells.length)),
            overdue: countCell(overdue, overdue > 0 ? "danger" : null),
            flag: textCell(
              overdue >= 3 ? "3+ overdue" : "",
              overdue >= 3 ? "danger" : null,
            ),
          });
        }),
      emptyText: "No Students expected to submit.",
    }),
    table({
      id: "submissions",
      title: "Submissions",
      columns: [
        { key: "student", label: "Student" },
        { key: "title", label: "Homework" },
        { key: "due", label: "Due" },
        { key: "status", label: "Status" },
        { key: "checked", label: "Checked" },
      ],
      rows: live
        .flatMap((item) => item.cells)
        .filter((cell) => matchesStatus(cell, status))
        .map((cell) =>
          row({
            student: textCell(ctx.student(cell.studentId)?.name),
            title: textCell(cell.homework.title),
            due: textCell(formatReportDate(cell.homework.dueOn)),
            status: textCell(
              `${CELL_TEXT[cell.status]}${cell.byParent ? " · marked done by parent" : ""}`,
              cell.status === "overdue"
                ? "danger"
                : cell.status === "late"
                  ? "warn"
                  : null,
            ),
            checked: textCell(
              cell.status === "submitted" || cell.status === "late"
                ? cell.checked
                  ? "Checked"
                  : "Not yet checked"
                : null,
            ),
          }),
        ),
      emptyText: "No submissions match this status.",
    }),
  ];
  return ctx.document({
    report: "homework",
    period,
    filters,
    pages: [{ heading: null, sections }],
  });
}
