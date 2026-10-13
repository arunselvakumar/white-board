// Reports (Reports PRD): who may open what, building a report, downloading
// it as Excel or PDF, the Owner's Report settings, R18 remarks, and emailing
// R11 or R18 to linked parents. Opening, printing, downloading or emailing a
// report never changes a record; only settings and R18 remarks are written.

import { DomainError } from "../domain/errors";
import {
  canDownload,
  filtersForRole,
  reportDefinition,
  reportsForRole,
  type ReportDefinition,
  type ReportFilter,
  type ReportFormat,
  type ReportKey,
  type ReportRole,
} from "../domain/report-catalogue";
import { formatMonth } from "../domain/report-format";
import { monthRange } from "../domain/report-period";
import {
  monthlyRemarkText,
  reportMonth,
  reportSettings,
  type ReportSettings,
} from "../domain/report-settings";
import {
  absenceNoticesReport,
  attendanceRegisterReport,
  lowAttendanceReport,
  pendingAttendanceReport,
  studentAttendanceReport,
} from "./report-attendance";
import {
  ReportContext,
  ReportForbiddenError,
  ReportNotFoundError,
  type ReportQuery,
} from "./report-context";
import type { ReportDocument } from "./report-document";
import { demoClassesReport, enquiryFunnelReport } from "./report-enquiries";
import {
  collectionsReport,
  duesReport,
  feeStatementReport,
  receiptsReport,
} from "./report-fees";
import {
  batchTestsReport,
  homeworkReport,
  testResultsReport,
} from "./report-learning";
import { monthlyReviewReport, monthlyStudentReport } from "./report-monthly";
import { onlineClassesReport } from "./report-online";
import type {
  ReportMailer,
  ReportRenderer,
  ReportSource,
  ReportViewer,
} from "./report-ports";
import { batchStrengthReport, teacherClassesReport } from "./report-teaching";

export type ReportSession = {
  workspaceId: string;
  userId: string;
  role: ReportRole;
  verifiedEmails: string[];
  /** The signed-in User's own account email, for "email to myself". */
  email: string | null;
};

type Builder = (
  ctx: ReportContext,
  query: ReportQuery,
) => Promise<ReportDocument>;

const BUILDERS: Record<ReportKey, Builder> = {
  "student-attendance": studentAttendanceReport,
  "attendance-register": attendanceRegisterReport,
  "low-attendance": lowAttendanceReport,
  "absence-notices": absenceNoticesReport,
  "pending-attendance": pendingAttendanceReport,
  "teacher-classes": teacherClassesReport,
  "batch-strength": batchStrengthReport,
  collections: collectionsReport,
  dues: duesReport,
  receipts: receiptsReport,
  "fee-statement": feeStatementReport,
  "enquiry-funnel": enquiryFunnelReport,
  "demo-classes": demoClassesReport,
  "online-classes": onlineClassesReport,
  "test-results": testResultsReport,
  "batch-tests": batchTestsReport,
  homework: homeworkReport,
  "monthly-student": monthlyStudentReport,
  "monthly-review": monthlyReviewReport,
};

export type ReportOption = { value: string; label: string };

export type ReportOptions = {
  role: ReportRole;
  students: ReportOption[];
  /** Each Student's Enrollments, for the Enrollment filter. */
  enrollments: (ReportOption & { studentId: string })[];
  batches: ReportOption[];
  courses: ReportOption[];
  teachers: ReportOption[];
  sources: ReportOption[];
  recorders: ReportOption[];
  staff: ReportOption[];
  today: string;
};

export type ReportCatalogueItem = {
  key: ReportKey;
  code: string;
  title: string;
  purpose: string;
  group: ReportDefinition["group"];
  filters: ReportFilter[];
  sorts: { value: string; label: string }[];
  defaultPeriod: ReportDefinition["defaultPeriod"];
  excel: boolean;
  pdf: boolean;
  emailToParents: boolean;
  landscape: boolean;
};

export type ReportFile = {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
};

export type ReportEmailResult = {
  sent: { studentName: string; email: string }[];
  notSent: { studentName: string; reason: string }[];
};

const CONTENT_TYPES: Record<ReportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function reportFilename(document: ReportDocument, format: ReportFormat) {
  const parts = [
    document.code,
    slug(document.title),
    document.subject == null ? null : slug(document.subject),
    document.period?.from ?? document.generatedAt.slice(0, 10),
  ].filter((part): part is string => part != null && part !== "");
  return `${parts.join("-")}.${format}`;
}

export class ReportHandlers {
  constructor(
    private readonly deps: {
      source: ReportSource;
      renderer: ReportRenderer;
      mailer: ReportMailer;
      now: () => Date;
    },
  ) {}

  /** The viewer behind a session; a deactivated Teacher gets no reports. */
  async viewer(session: ReportSession): Promise<ReportViewer> {
    if (session.role === "owner")
      return {
        role: "owner",
        workspaceId: session.workspaceId,
        userId: session.userId,
      };
    if (session.role === "teacher") {
      const teacher = await this.deps.source.activeTeacher(
        session.workspaceId,
        session.userId,
      );
      if (teacher == null)
        throw new ReportForbiddenError(
          "Reports aren't available to you in this Workspace.",
        );
      return {
        role: "teacher",
        workspaceId: session.workspaceId,
        userId: session.userId,
        teacherId: teacher.id,
        teacherName: teacher.name,
      };
    }
    return {
      role: session.role,
      workspaceId: session.workspaceId,
      userId: session.userId,
      studentIds: await this.deps.source.familyStudentIds(
        session.workspaceId,
        session.role,
        session.verifiedEmails,
      ),
    };
  }

  private async context(viewer: ReportViewer): Promise<ReportContext> {
    const [settings, structure, name] = await Promise.all([
      this.deps.source.settings(viewer.workspaceId),
      this.deps.source.structure(viewer.workspaceId),
      this.deps.source.instituteName(viewer.workspaceId),
    ]);
    return new ReportContext(
      viewer,
      this.deps.source,
      this.deps.now(),
      settings,
      structure,
      name,
    );
  }

  catalogue(session: ReportSession): ReportCatalogueItem[] {
    return reportsForRole(session.role).map((definition) => ({
      key: definition.key,
      code: definition.code,
      title: definition.title,
      purpose: definition.purpose,
      group: definition.group,
      filters: filtersForRole(definition, session.role),
      sorts: [...(definition.sorts ?? [])],
      defaultPeriod: definition.defaultPeriod,
      excel: canDownload(definition, session.role, "xlsx"),
      pdf: canDownload(definition, session.role, "pdf"),
      emailToParents:
        definition.emailToParents === true && session.role === "owner",
      landscape: definition.landscape === true,
    }));
  }

  /** Choices for the filters, limited to what the viewer may see. */
  async options(session: ReportSession): Promise<ReportOptions> {
    const viewer = await this.viewer(session);
    const ctx = await this.context(viewer);
    const byName = (a: ReportOption, b: ReportOption) =>
      a.label.localeCompare(b.label);
    const batches = ctx.isFamily ? [] : ctx.staffBatches();
    const batchIds = new Set(batches.map((batch) => batch.id));
    const studentIds = ctx.isFamily
      ? new Set(ctx.familyStudentIds)
      : new Set(
          ctx.structure.enrollments
            .filter((item) => ctx.isOwner || batchIds.has(item.batchId))
            .map((item) => item.studentId),
        );
    const students = ctx.structure.students
      .filter((student) => studentIds.has(student.id) || ctx.isOwner)
      .map((student) => ({
        value: student.id,
        label:
          student.droppedAt == null
            ? student.name
            : `${student.name} (dropped)`,
      }))
      .sort(byName);
    const enrollments = ctx.structure.enrollments
      .filter((item) => studentIds.has(item.studentId) || ctx.isOwner)
      .filter(
        (item) => ctx.isFamily || ctx.isOwner || batchIds.has(item.batchId),
      )
      .map((item) => ({
        value: item.id,
        studentId: item.studentId,
        label: `${ctx.courseName(item.courseId)} · ${ctx.batch(item.batchId)?.name ?? ""}`,
      }));
    let sources: ReportOption[] = [];
    let recorders: ReportOption[] = [];
    let staff: ReportOption[] = [];
    if (ctx.isOwner) {
      const [enquiries, payments] = await Promise.all([
        this.deps.source.enquiries(viewer.workspaceId),
        this.deps.source.payments(viewer.workspaceId),
      ]);
      const seen = new Map<string, string>();
      for (const enquiry of enquiries)
        if (enquiry.sourceId != null && enquiry.sourceName != null)
          seen.set(
            enquiry.sourceId,
            enquiry.sourceRetired
              ? `${enquiry.sourceName} (retired)`
              : enquiry.sourceName,
          );
      sources = [...seen.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort(byName);
      const names = await this.deps.source.userNames([
        ...payments.map((payment) => payment.recordedByUserId),
        ...enquiries.map((enquiry) => enquiry.createdByUserId),
      ]);
      recorders = [
        ...new Set(payments.map((payment) => payment.recordedByUserId)),
      ]
        .map((id) => ({ value: id, label: names.get(id) ?? "User" }))
        .sort(byName);
      staff = [...new Set(enquiries.map((enquiry) => enquiry.createdByUserId))]
        .map((id) => ({ value: id, label: names.get(id) ?? "User" }))
        .sort(byName);
    }
    return {
      role: session.role,
      students,
      enrollments,
      batches: batches
        .map((batch) => ({
          value: batch.id,
          label: batch.closedAt == null ? batch.name : `${batch.name} (closed)`,
        }))
        .sort(byName),
      courses: ctx.isFamily
        ? []
        : ctx.structure.courses
            .filter(
              (course) =>
                ctx.isOwner ||
                batches.some((batch) => batch.courseId === course.id),
            )
            .map((course) => ({
              value: course.id,
              label: course.archived
                ? `${course.name} (archived)`
                : course.name,
            }))
            .sort(byName),
      teachers: ctx.isOwner
        ? ctx.structure.teachers
            .map((teacher) => ({
              value: teacher.id,
              label:
                teacher.deactivatedAt == null
                  ? teacher.name
                  : `${teacher.name} (deactivated)`,
            }))
            .sort(byName)
        : [],
      sources,
      recorders,
      staff,
      today: ctx.today,
    };
  }

  async build(
    session: ReportSession,
    key: ReportKey,
    query: ReportQuery,
  ): Promise<ReportDocument> {
    const definition = reportDefinition(key);
    if (!definition.roles.includes(session.role))
      throw new ReportForbiddenError();
    const viewer = await this.viewer(session);
    const ctx = await this.context(viewer);
    return BUILDERS[key](ctx, sanitize(query, definition, session.role));
  }

  async download(
    session: ReportSession,
    key: ReportKey,
    query: ReportQuery,
    format: ReportFormat,
  ): Promise<ReportFile> {
    if (!canDownload(reportDefinition(key), session.role, format))
      throw new ReportForbiddenError(
        "This report can't be downloaded in that format.",
      );
    const document = await this.build(session, key, query);
    return this.render(document, format);
  }

  private async render(
    document: ReportDocument,
    format: ReportFormat,
  ): Promise<ReportFile> {
    return {
      filename: reportFilename(document, format),
      contentType: CONTENT_TYPES[format],
      bytes:
        format === "pdf"
          ? await this.deps.renderer.pdf(document)
          : this.deps.renderer.xlsx(document),
    };
  }

  async settings(session: ReportSession): Promise<ReportSettings> {
    if (session.role !== "owner") throw new ReportForbiddenError();
    return this.deps.source.settings(session.workspaceId);
  }

  async updateSettings(
    session: ReportSession,
    input: ReportSettings,
  ): Promise<ReportSettings> {
    if (session.role !== "owner") throw new ReportForbiddenError();
    const settings = reportSettings(input);
    await this.deps.source.saveSettings(
      session.workspaceId,
      settings,
      session.userId,
    );
    return settings;
  }

  /**
   * The Owner, or a Teacher assigned to one of the Student's Batches that
   * month, sets their one remark for the Student's R18. Blank removes it.
   */
  async saveRemark(
    session: ReportSession,
    input: { studentId: string; month: string; text: string },
  ): Promise<void> {
    if (session.role !== "owner" && session.role !== "teacher")
      throw new ReportForbiddenError();
    const month = reportMonth(input.month);
    const text = monthlyRemarkText(input.text);
    const viewer = await this.viewer(session);
    const ctx = await this.context(viewer);
    const student = ctx.subjectStudent(input.studentId, monthRange(month));
    const authorName =
      viewer.role === "teacher"
        ? viewer.teacherName
        : ((await this.deps.source.userNames([viewer.userId])).get(
            viewer.userId,
          ) ?? "Owner");
    await this.deps.source.saveRemark({
      workspaceId: viewer.workspaceId,
      studentId: student.id,
      month,
      authorUserId: viewer.userId,
      authorRole: viewer.role === "teacher" ? "teacher" : "owner",
      authorName,
      text,
      now: this.deps.now(),
    });
  }

  /**
   * The Owner emails R11 or R18 to the linked parents of each Student on it,
   * after confirming. Each parent gets only their own child's report.
   */
  async emailToParents(
    session: ReportSession,
    key: ReportKey,
    query: ReportQuery,
  ): Promise<ReportEmailResult> {
    const definition = reportDefinition(key);
    if (session.role !== "owner" || definition.emailToParents !== true)
      throw new ReportForbiddenError(
        "Only R11 and R18 can be emailed to parents.",
      );
    const viewer = await this.viewer(session);
    const ctx = await this.context(viewer);
    const students =
      key === "monthly-student" &&
      query.batchId != null &&
      query.studentId == null
        ? (() => {
            const month = query.month ?? ctx.today.slice(0, 7);
            const range = monthRange(reportMonth(month));
            const batch = ctx.staffBatch(query.batchId, range);
            const ids = new Set(
              ctx
                .enrollmentsOfBatch(batch.id)
                .filter((item) => ctx.coversRange(item, range))
                .map((item) => item.studentId),
            );
            return ctx.structure.students.filter((student) =>
              ids.has(student.id),
            );
          })()
        : [ctx.subjectStudent(query.studentId)];
    const result: ReportEmailResult = { sent: [], notSent: [] };
    for (const student of students.sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (student.parentEmails.length === 0) {
        result.notSent.push({
          studentName: student.name,
          reason: "not sent: no email",
        });
        continue;
      }
      const document = await BUILDERS[key](ctx, {
        ...sanitize(query, definition, "owner"),
        studentId: student.id,
        batchId: null,
      });
      const file = await this.render(document, "pdf");
      for (const email of student.parentEmails) {
        try {
          await this.deps.mailer.send({
            to: email,
            subject: `${document.title}: ${student.name}${
              key === "monthly-student" && query.month != null
                ? `, ${formatMonth(query.month)}`
                : ""
            }`,
            heading: `${document.title} for ${student.name}`,
            lines: [
              `${document.instituteName} has sent ${student.name}'s ${document.title.toLowerCase()}.`,
              ...(document.period == null
                ? []
                : [`Period: ${document.period.label}.`]),
              "The report is attached as a PDF.",
            ],
            attachment: {
              filename: file.filename,
              contentType: file.contentType,
              content: file.bytes,
            },
          });
          result.sent.push({ studentName: student.name, email });
        } catch {
          result.notSent.push({
            studentName: student.name,
            reason: `not sent: ${email} failed`,
          });
        }
      }
    }
    return result;
  }

  /** The Owner emails any report to their own account email. */
  async emailToSelf(
    session: ReportSession,
    key: ReportKey,
    query: ReportQuery,
  ): Promise<{ email: string }> {
    if (session.role !== "owner") throw new ReportForbiddenError();
    if (session.email == null)
      throw new DomainError(
        "REPORT_EMAIL_MISSING",
        "Your account has no email address.",
      );
    const definition = reportDefinition(key);
    const format: ReportFormat = canDownload(definition, "owner", "pdf")
      ? "pdf"
      : "xlsx";
    const document = await this.build(session, key, query);
    const file = await this.render(document, format);
    await this.deps.mailer.send({
      to: session.email,
      subject: `${document.title}${document.period == null ? "" : `, ${document.period.label}`}`,
      heading: document.title,
      lines: [
        `Here is the ${document.title.toLowerCase()} for ${document.instituteName}.`,
        document.generatedLabel,
      ],
      attachment: {
        filename: file.filename,
        contentType: file.contentType,
        content: file.bytes,
      },
    });
    return { email: session.email };
  }
}

/**
 * Drops filters the viewer's role doesn't get, so a Teacher can't ask for
 * another Teacher's numbers and a family can't pick a Batch.
 */
export function sanitize(
  query: ReportQuery,
  definition: ReportDefinition,
  role: ReportRole,
): ReportQuery {
  const allowed = new Set<ReportFilter>(filtersForRole(definition, role));
  const keep = <T>(filter: ReportFilter, value: T): T | null =>
    allowed.has(filter) ? value : null;
  return {
    period: keep("period", query.period),
    from: keep("period", query.from),
    to: keep("period", query.to),
    month: keep("month", query.month),
    studentId: role === "student" ? null : keep("student", query.studentId),
    enrollmentId: keep("enrollment", query.enrollmentId),
    batchId: keep("batch", query.batchId),
    courseId: keep("course", query.courseId),
    teacherId: keep("teacher", query.teacherId),
    classMode: keep("classMode", query.classMode),
    method: keep("method", query.method),
    recordedBy: keep("recordedBy", query.recordedBy),
    sourceId: keep("source", query.sourceId),
    addedBy: keep("addedBy", query.addedBy),
    reason: keep("reason", query.reason),
    givenBy: keep("givenBy", query.givenBy),
    demoKind: keep("demoKind", query.demoKind),
    demoFee: keep("demoFee", query.demoFee),
    demoAttendance: keep("demoAttendance", query.demoAttendance),
    meeting: keep("meeting", query.meeting),
    dueFilter: keep("dueFilter", query.dueFilter),
    ageGroup: keep("ageGroup", query.ageGroup),
    homeworkStatus: keep("homeworkStatus", query.homeworkStatus),
    includeEnded: keep("includeEnded", query.includeEnded),
    includeClosed: keep("includeClosed", query.includeClosed),
    sort: keep("sort", query.sort),
  };
}

export { ReportForbiddenError, ReportNotFoundError };
