import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { companyFileKey, type StoredObject } from "@/src/shared-kernel/files";
import { newId as defaultNewId } from "@/src/shared-kernel/ids";

import {
  checkReportParams,
  checkReportScope,
  failureMessage,
  type ReportJob,
  type ReportKind,
  type ReportParams,
} from "../domain/report-job";
import { buildReportDocument } from "./build-report";
import type {
  ProjectLookup,
  ReportJobStore,
  ReportRenderer,
  ReportRunner,
  ReportSource,
  ReportStorage,
} from "./ports";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_CONTENT_TYPE = "application/pdf";

export type ReportFormat = "xlsx" | "pdf";

/** The `stored_files` kind of a generated report (CM-116 storage usage). */
export const REPORT_FILE_KIND = "report";

type Clock = () => Date;

/**
 * Runs one job: queued → running → done (an Excel and a PDF in private
 * storage, recorded as stored files) or failed (a message, no stack). The
 * inline runner calls it in the request today; M9's queue worker will call
 * the same function.
 */
export type ReportExecutor = {
  execute(job: Pick<ReportJob, "id" | "workspaceId">): Promise<void>;
};

export function createReportExecutor(deps: {
  store: ReportJobStore;
  source: ReportSource;
  renderer: ReportRenderer;
  storage: ReportStorage;
  clock?: Clock;
}): ReportExecutor {
  const clock = deps.clock ?? (() => new Date());
  return {
    async execute({ id, workspaceId }) {
      const job = await deps.store.get(workspaceId, id);
      if (job?.status !== "queued") return;
      await deps.store.markRunning(id, clock());
      const written: string[] = [];
      try {
        const document = await buildReportDocument(job, deps.source, clock());
        const [xlsx, pdf] = await Promise.all([
          deps.renderer.xlsx(document),
          deps.renderer.pdf(document),
        ]);
        const xlsxKey = companyFileKey(workspaceId, "reports", "xlsx");
        const pdfKey = companyFileKey(workspaceId, "reports", "pdf");
        await deps.storage.put(xlsxKey, xlsx, XLSX_CONTENT_TYPE);
        written.push(xlsxKey);
        await deps.storage.put(pdfKey, pdf, PDF_CONTENT_TYPE);
        written.push(pdfKey);
        await deps.store.markDone(
          job,
          {
            xlsx: {
              key: xlsxKey,
              contentType: XLSX_CONTENT_TYPE,
              bytes: xlsx.byteLength,
            },
            pdf: {
              key: pdfKey,
              contentType: PDF_CONTENT_TYPE,
              bytes: pdf.byteLength,
            },
            fileName: document.fileName,
          },
          clock(),
        );
      } catch (error) {
        console.error(`Report job ${id} failed`, error);
        await Promise.allSettled(
          written.map((key) => deps.storage.delete(key)),
        );
        await deps.store.markFailed(id, failureMessage(error), clock());
      }
    },
  };
}

/** A runner that runs the job before `enqueue` returns (M2). */
export function inlineReportRunner(executor: ReportExecutor): ReportRunner {
  return { enqueue: (job) => executor.execute(job) };
}

export type RequestReport = {
  workspaceId: string;
  userId: string;
  projectId: string | null;
  params: ReportParams;
  /** Decided by the route from the Permission Matrix. */
  includesMoney: boolean;
};

export type ReportDownload = StoredObject & { fileName: string };

/** Report jobs: request, read, list and download (CM-217). */
export function createReportHandlers(deps: {
  store: ReportJobStore;
  projects: ProjectLookup;
  runner: ReportRunner;
  storage: ReportStorage;
  clock?: Clock;
  newId?: () => string;
}) {
  const clock = deps.clock ?? (() => new Date());
  const newId = deps.newId ?? (() => defaultNewId());

  async function get(workspaceId: string, id: string): Promise<ReportJob> {
    const job = await deps.store.get(workspaceId, id);
    if (job == null)
      throw notFound("REPORT_NOT_FOUND", "There is no such report.");
    return job;
  }

  return {
    get,

    /**
     * Enqueues a job and hands it to the runner; returns the job as it
     * stands afterwards (done or failed with the inline runner, queued
     * with a real queue).
     */
    async request(input: RequestReport): Promise<ReportJob> {
      checkReportScope(input.params.kind, input.projectId);
      const params = checkReportParams(input.params);
      if (
        input.projectId != null &&
        !(await deps.projects.exists(input.workspaceId, input.projectId))
      )
        throw notFound("PROJECT_NOT_FOUND", "There is no such Project.");
      const job: ReportJob = {
        id: newId(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        kind: params.kind,
        params,
        status: "queued",
        includesMoney: input.includesMoney,
        xlsxKey: null,
        pdfKey: null,
        fileName: null,
        error: null,
        requestedBy: input.userId,
        createdAt: clock(),
        startedAt: null,
        finishedAt: null,
      };
      await deps.store.create(job);
      await deps.runner.enqueue(job);
      return get(job.workspaceId, job.id);
    },

    /** The newest 50 jobs of a Project (or the central jobs), newest first. */
    async list(
      workspaceId: string,
      filter: {
        projectId: string | null;
        kinds: readonly ReportKind[];
        requestedBy?: string;
      },
    ): Promise<ReportJob[]> {
      if (filter.kinds.length === 0) return [];
      return deps.store.list(workspaceId, { ...filter, limit: 50 });
    },

    /** The file of a done job, streamed from storage. */
    async download(
      job: ReportJob,
      format: ReportFormat,
    ): Promise<ReportDownload> {
      const key = format === "xlsx" ? job.xlsxKey : job.pdfKey;
      if (job.status !== "done" || key == null)
        throw conflict(
          "REPORT_NOT_READY",
          job.status === "failed"
            ? "This report failed; generate it again."
            : "This report is not ready yet.",
        );
      const object = await deps.storage.get(key);
      if (object == null)
        throw notFound("REPORT_FILE_MISSING", "The report file is missing.");
      return { ...object, fileName: `${job.fileName ?? "report"}.${format}` };
    },
  };
}

export type ReportHandlers = ReturnType<typeof createReportHandlers>;
