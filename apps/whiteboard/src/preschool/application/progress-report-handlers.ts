import { todayInIndia, type IsoDate } from "../domain/dates";
import { conflict, notFound } from "../domain/errors";
import {
  assertRatingsUnique,
  assertReportComplete,
  TERM_LABELS,
  termSpan,
  type ProgressRating,
  type Term,
} from "../domain/progress";
import { assertManagerOf, type PreschoolActor } from "./access";
import { openClassroom, readableChild } from "./attendance-access";
import type {
  AcademicYearFacts,
  ProgressReportNotifier,
  ProgressReportStore,
  ReportRecord,
} from "./progress-report-ports";
import type {
  ChildProgressReportsView,
  ClassroomProgressReportsView,
  ProgressReportView,
  TermView,
} from "./progress-report-views";

export type SaveProgressReportInput = {
  childId: string;
  term: Term;
  /** The Academic Year of the Child's Admission when left out. */
  academicYearId?: string;
  ratings: {
    domainId: string;
    rating: ProgressRating;
    remark?: string | null;
  }[];
  teacherRemarks?: string | null;
};

export function termView(year: AcademicYearFacts, term: Term): TermView {
  return { term, label: TERM_LABELS[term], ...termSpan(year, term) };
}

function reportNotFound() {
  return notFound("PROGRESS_REPORT_NOT_FOUND", "Progress Report not found.");
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Term Progress Reports: written by the Child's staff, read by Parents once published. */
export class ProgressReportHandlers {
  constructor(
    private readonly deps: {
      store: ProgressReportStore;
      notifier: ProgressReportNotifier;
      now: () => Date;
    },
  ) {}

  private today(): IsoDate {
    return todayInIndia(this.deps.now());
  }

  private async year(
    actor: PreschoolActor,
    id: string,
  ): Promise<AcademicYearFacts> {
    const year = await this.deps.store.academicYear(actor.workspaceId, id);
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    return year;
  }

  async classroom(
    actor: PreschoolActor,
    input: { classroomId: string; term: Term; academicYearId?: string },
  ): Promise<ClassroomProgressReportsView> {
    const { store } = this.deps;
    const classroom = await openClassroom(store, actor, input.classroomId);
    const year = await this.year(
      actor,
      input.academicYearId ??
        (await store.classroomAcademicYearId(classroom.id)),
    );
    const roster = await store.roster(classroom.id, this.today());
    const reports = await store.reportsFor(
      roster.map((child) => child.childId),
      year.id,
      input.term,
    );
    const counts = { none: 0, draft: 0, published: 0 };
    const children = roster.map((child) => {
      const report = reports.get(child.childId);
      counts[report?.status ?? "none"] += 1;
      return {
        childId: child.childId,
        name: child.name,
        photoUrl: child.photoUrl,
        reportId: report?.id ?? null,
        status: report?.status ?? ("none" as const),
        updatedAt: report?.updatedAt ?? null,
      };
    });
    return {
      classroom,
      academicYear: { id: year.id, name: year.name },
      term: termView(year, input.term),
      counts,
      children,
    };
  }

  async childReports(
    actor: PreschoolActor,
    childId: string,
  ): Promise<ChildProgressReportsView> {
    const child = await readableChild(
      this.deps.store,
      actor,
      childId,
      this.today(),
    );
    const rows = await this.deps.store.childReports(
      childId,
      actor.role === "parent",
    );
    return {
      childId,
      name: child.name,
      items: rows.map(({ academicYear, term, ...row }) => ({
        ...row,
        academicYearId: academicYear.id,
        academicYearName: academicYear.name,
        term: termView(academicYear, term),
      })),
    };
  }

  /** The printable report. A Parent reads only their Child's published ones, without Observations. */
  async get(actor: PreschoolActor, id: string): Promise<ProgressReportView> {
    const report = await this.deps.store.report(actor.workspaceId, id);
    if (report == null) throw reportNotFound();
    await readableChild(this.deps.store, actor, report.childId, this.today());
    const parent = actor.role === "parent";
    if (parent && report.status !== "published") throw reportNotFound();
    const year = await this.year(actor, report.academicYearId);
    const term = termView(year, report.term);
    const today = this.today();
    const facts = await this.deps.store.printFacts({
      workspaceId: actor.workspaceId,
      report,
      year,
      from: term.startsOn,
      to: term.endsOn,
      attendanceTo: term.endsOn < today ? term.endsOn : today,
      withObservations: !parent,
    });
    return {
      ...facts,
      id: report.id,
      status: report.status,
      term,
      academicYear: { id: year.id, name: year.name },
      teacherRemarks: report.teacherRemarks,
      publishedAt: report.publishedAt,
      updatedAt: report.updatedAt,
    };
  }

  /** Creates or corrects a report; a published one stays published. */
  async save(
    actor: PreschoolActor,
    input: SaveProgressReportInput,
  ): Promise<ProgressReportView> {
    const { store } = this.deps;
    const child = await readableChild(
      store,
      actor,
      input.childId,
      this.today(),
    );
    assertRatingsUnique(input.ratings);
    const yearId =
      input.academicYearId ??
      (await store.childAcademicYearId(child.childId)) ??
      (await store.currentAcademicYear(actor.workspaceId)).id;
    await this.year(actor, yearId);
    const domainIds = input.ratings.map((rating) => rating.domainId);
    const known = new Set(
      await store.existingDomainIds(actor.workspaceId, domainIds),
    );
    if (domainIds.some((id) => !known.has(id)))
      throw notFound("DOMAIN_NOT_FOUND", "Development Domain not found.");
    const id = await store.transaction((tx) =>
      tx.saveReport({
        workspaceId: actor.workspaceId,
        centreId: child.centreId,
        childId: child.childId,
        academicYearId: yearId,
        term: input.term,
        teacherRemarks: textOrNull(input.teacherRemarks),
        ratings: input.ratings.map((rating) => ({
          domainId: rating.domainId,
          rating: rating.rating,
          remark: textOrNull(rating.remark),
        })),
        userId: actor.userId,
      }),
    );
    return this.get(actor, id);
  }

  /** Every Domain in use must be rated; then the Parents are emailed. */
  async publish(
    actor: PreschoolActor,
    id: string,
  ): Promise<ProgressReportView> {
    const report = await this.staffReport(actor, id);
    if (report.status === "published")
      throw conflict(
        "PROGRESS_REPORT_PUBLISHED",
        "This Progress Report is already published.",
      );
    assertReportComplete(
      await this.deps.store.activeDomainIds(actor.workspaceId),
      report.ratings.map((rating) => rating.domainId),
    );
    await this.deps.store.setStatus(id, "published", this.deps.now());
    const view = await this.get(actor, id);
    await this.tellParents(actor, report, view);
    return view;
  }

  /** Managers take a report back to draft to correct it out of the Parents' sight. */
  async unpublish(
    actor: PreschoolActor,
    id: string,
  ): Promise<ProgressReportView> {
    const report = await this.staffReport(actor, id);
    assertManagerOf(actor, report.centreId);
    if (report.status !== "published")
      throw conflict(
        "PROGRESS_REPORT_NOT_PUBLISHED",
        "This Progress Report is not published.",
      );
    await this.deps.store.setStatus(id, "draft", null);
    return this.get(actor, id);
  }

  private async staffReport(
    actor: PreschoolActor,
    id: string,
  ): Promise<ReportRecord> {
    const report = await this.deps.store.report(actor.workspaceId, id);
    if (report == null) throw reportNotFound();
    await readableChild(this.deps.store, actor, report.childId, this.today());
    return report;
  }

  private async tellParents(
    actor: PreschoolActor,
    report: ReportRecord,
    view: ProgressReportView,
  ): Promise<void> {
    try {
      const family = await this.deps.store.family(report.childId);
      if (family.parentEmails.length === 0) return;
      await this.deps.notifier.published({
        workspaceId: actor.workspaceId,
        reportId: report.id,
        childName: family.childName,
        termLabel: view.term.label,
        academicYearName: view.academicYear.name,
        parentEmails: family.parentEmails,
      });
    } catch (error) {
      console.error(
        "Progress Report email failed",
        { reportId: report.id },
        error,
      );
    }
  }
}
