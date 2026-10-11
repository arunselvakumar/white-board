import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError, forbidden } from "@/src/shared-kernel/domain-error";

import {
  HIRE_COST_MENU,
  PROGRESS_REPORT_MENU,
  progressReportDate,
} from "../domain/progress-report";
import type {
  ProgressReportFile,
  ProgressReportJob,
  ProgressReportJobs,
  ProgressReportNumbers,
  SiteRecordDirectory,
  SiteRecordTeamMember,
} from "./ports";

const MENU = PROGRESS_REPORT_MENU;

/** A DPR job with names for the screen and what the viewer may do with it. */
export type ProgressReportView = ProgressReportJob & {
  filledByName: string | null;
  requestedByName: string | null;
  /** Download: Read, and Financial on Equipment Usage when it shows hire cost. */
  canDownload: boolean;
  /** Retry a failed report: Create. */
  canRetry: boolean;
  canDelete: boolean;
};

export type RequestProgressReportInput = {
  projectId: string;
  date: string;
  filledBy?: string | null;
  includeImages?: boolean;
};

/**
 * Progress Reports (CM-606): request a Daily Progress Report, list, read,
 * retry, delete and download them. Site work takes or reuses the date's
 * DPR number; the reporting context runs the job (`ProgressReportJobs`).
 * Access is the Progress Report menu on the job's Project: C to generate
 * and retry, R to list and download, D to delete. Hire cost prints only
 * when the requester holds Financial on Equipment Usage.
 */
export class ProgressReportHandlers {
  constructor(
    private readonly deps: {
      numbers: ProgressReportNumbers;
      jobs: ProgressReportJobs;
      directory: Pick<
        SiteRecordDirectory,
        "projectExists" | "projectTeamMembers" | "userNames"
      >;
      today: (workspaceId: string) => Promise<CalendarDate>;
    },
  ) {}

  /** What Create new offers: today and the Project's Team Members (Filled By). */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<{ today: CalendarDate; teamMembers: SiteRecordTeamMember[] }> {
    assertCan(access, MENU, "create", { projectId });
    await this.assertProject(access.workspaceId, projectId);
    const [today, teamMembers] = await Promise.all([
      this.deps.today(access.workspaceId),
      this.deps.directory.projectTeamMembers(access.workspaceId, projectId),
    ]);
    return { today, teamMembers };
  }

  /**
   * Takes or reuses the date's DPR number and queues the job; with the
   * inline runner it comes back done or failed.
   */
  async request(
    access: MemberAccess,
    input: RequestProgressReportInput,
  ): Promise<ProgressReportView> {
    const { projectId } = input;
    assertCan(access, MENU, "create", { projectId });
    const { workspaceId } = access;
    await this.assertProject(workspaceId, projectId);
    const date = progressReportDate(
      input.date,
      await this.deps.today(workspaceId),
    );
    const filledBy = input.filledBy ?? null;
    if (filledBy != null) {
      const members = await this.deps.directory.projectTeamMembers(
        workspaceId,
        projectId,
      );
      if (!members.some((member) => member.userId === filledBy))
        throw new DomainError(
          "FILLED_BY_NOT_FOUND",
          "Choose a Team Member of this Project.",
          { details: { field: "filledBy" } },
        );
    }
    const { number } = await this.deps.numbers.take({
      workspaceId,
      projectId,
      date,
      by: access.userId,
    });
    const job = await this.deps.jobs.request({
      workspaceId,
      projectId,
      userId: access.userId,
      number,
      date,
      filledBy,
      includeImages: input.includeImages === true,
      includesMoney: can(access, HIRE_COST_MENU, "financial", { projectId }),
    });
    return (await this.views(access, [job]))[0] ?? this.never();
  }

  /** The Project's DPRs, newest first. */
  async list(
    access: MemberAccess,
    projectId: string,
  ): Promise<ProgressReportView[]> {
    assertCan(access, MENU, "read", { projectId });
    return this.views(
      access,
      await this.deps.jobs.list(access.workspaceId, projectId),
    );
  }

  /**
   * One DPR job, loaded before access is checked on its Project (another
   * Company's is 404).
   */
  async find(workspaceId: string, id: string): Promise<ProgressReportJob> {
    return this.deps.jobs.get(workspaceId, id);
  }

  async get(access: MemberAccess, id: string): Promise<ProgressReportView> {
    const job = await this.deps.jobs.get(access.workspaceId, id);
    assertCan(access, MENU, "read", { projectId: job.projectId });
    return (await this.views(access, [job]))[0] ?? this.never();
  }

  /** Runs a failed DPR again (Create). */
  async retry(access: MemberAccess, id: string): Promise<ProgressReportView> {
    const job = await this.deps.jobs.get(access.workspaceId, id);
    assertCan(access, MENU, "create", { projectId: job.projectId });
    const retried = await this.deps.jobs.retry(access.workspaceId, id);
    return (await this.views(access, [retried]))[0] ?? this.never();
  }

  /** Deletes a DPR and its file (Delete). The date keeps its number. */
  async delete(access: MemberAccess, id: string): Promise<void> {
    const job = await this.deps.jobs.get(access.workspaceId, id);
    assertCan(access, MENU, "delete", { projectId: job.projectId });
    await this.deps.jobs.remove(access.workspaceId, id, access.userId);
  }

  /** The PDF: Read, and Financial on Equipment Usage when it shows hire cost. */
  async download(
    access: MemberAccess,
    id: string,
  ): Promise<ProgressReportFile> {
    const job = await this.deps.jobs.get(access.workspaceId, id);
    assertCan(access, MENU, "read", { projectId: job.projectId });
    if (!this.mayDownload(access, job))
      throw forbidden(
        "PERMISSION_DENIED",
        "This report shows hire cost: it needs Financial on Equipment Usage. Ask the Owner to change your Permission Matrix.",
      );
    return this.deps.jobs.pdf(access.workspaceId, id);
  }

  private mayDownload(access: MemberAccess, job: ProgressReportJob): boolean {
    return (
      can(access, MENU, "read", { projectId: job.projectId }) &&
      (!job.includesMoney ||
        can(access, HIRE_COST_MENU, "financial", { projectId: job.projectId }))
    );
  }

  private async views(
    access: MemberAccess,
    jobs: ProgressReportJob[],
  ): Promise<ProgressReportView[]> {
    const ids = new Set<string>();
    for (const job of jobs) {
      ids.add(job.requestedBy);
      if (job.filledBy != null) ids.add(job.filledBy);
    }
    const names = await this.deps.directory.userNames(access.workspaceId, [
      ...ids,
    ]);
    return jobs.map((job) => ({
      ...job,
      filledByName:
        job.filledBy == null ? null : (names.get(job.filledBy) ?? null),
      requestedByName: names.get(job.requestedBy) ?? null,
      canDownload: job.status === "done" && this.mayDownload(access, job),
      canRetry:
        job.status === "failed" &&
        can(access, MENU, "create", { projectId: job.projectId }),
      canDelete: can(access, MENU, "delete", { projectId: job.projectId }),
    }));
  }

  private async assertProject(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    if (!(await this.deps.directory.projectExists(workspaceId, projectId)))
      throw new DomainError(
        "PROJECT_NOT_FOUND",
        "This Project was not found.",
        {
          details: { field: "projectId" },
        },
      );
  }

  private never(): never {
    throw new Error("A progress report view went missing.");
  }
}
