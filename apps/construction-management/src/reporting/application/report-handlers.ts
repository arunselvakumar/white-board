import { conflict, notFound } from "@/src/shared-kernel/domain-error";
import { companyFileKey, type StoredObject } from "@/src/shared-kernel/files";
import { newId as defaultNewId } from "@/src/shared-kernel/ids";

import { buildDailyProgressReport } from "../domain/daily-progress-report";
import {
  checkReportParams,
  checkReportScope,
  failureMessage,
  REPORT_TIME_LIMIT_MS,
  reportFileName,
  reportFormats,
  ReportTimedOut,
  type ReportFormat,
  type ReportJob,
  type ReportKind,
  type ReportParams,
} from "../domain/report-job";
import { buildReportDocument } from "./build-report";
import type {
  DprRenderer,
  DprSource,
  FinanceReportSource,
  ProjectLookup,
  ReportFile,
  ReportJobStore,
  ReportRenderer,
  ReportRunner,
  ReportSource,
  ReportStorage,
} from "./ports";

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PDF_CONTENT_TYPE = "application/pdf";

export type { ReportFormat };

/** The `stored_files` kind of a generated report (CM-116 storage usage). */
export const REPORT_FILE_KIND = "report";

type Clock = () => Date;

/**
 * Runs one job: queued → running → done (its files in private storage,
 * recorded as stored files) or failed (a message, no stack). The inline
 * runner calls it in the request today; M9's queue worker will call the
 * same function. `signal` aborts a run that ran past its time limit: it
 * writes nothing once aborted.
 */
export type ReportExecutor = {
  execute(
    job: Pick<ReportJob, "id" | "workspaceId">,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Fails a job that ran past `limitMs` with a message a screen can show. */
  timeOut(
    job: Pick<ReportJob, "id" | "workspaceId">,
    limitMs: number,
  ): Promise<void>;
};

/** What a job produced: the PDF, and the Excel when the kind has one. */
type ReportOutput = {
  fileName: string;
  pdf: Uint8Array;
  xlsx: Uint8Array | null;
};

export function createReportExecutor(deps: {
  store: ReportJobStore;
  source: ReportSource;
  renderer: ReportRenderer;
  storage: ReportStorage;
  /** The Daily Progress Report's read model and PDF (CM-606). */
  dpr?: { source: DprSource; render: DprRenderer };
  /** The finance reports' read model (CM-709). */
  finance?: FinanceReportSource;
  clock?: Clock;
}): ReportExecutor {
  const clock = deps.clock ?? (() => new Date());

  async function produce(job: ReportJob): Promise<ReportOutput> {
    const params = job.params;
    if (params.kind === "daily_progress_report") {
      if (deps.dpr == null || job.projectId == null)
        throw new Error("The Daily Progress Report source is not wired.");
      const model = await deps.dpr.source.read({
        workspaceId: job.workspaceId,
        projectId: job.projectId,
        params,
        money: job.includesMoney,
      });
      const pdf = await deps.dpr.render(buildDailyProgressReport(model));
      return { fileName: reportFileName(params), pdf, xlsx: null };
    }
    const document = await buildReportDocument(
      job,
      deps.source,
      clock(),
      deps.finance,
    );
    const [xlsx, pdf] = await Promise.all([
      deps.renderer.xlsx(document),
      deps.renderer.pdf(document),
    ]);
    return { fileName: document.fileName, pdf, xlsx };
  }

  return {
    async execute({ id, workspaceId }, signal) {
      const job = await deps.store.get(workspaceId, id);
      if (job?.status !== "queued") return;
      await deps.store.markRunning(id, clock());
      const written: string[] = [];
      const discard = () =>
        Promise.allSettled(written.map((key) => deps.storage.delete(key)));
      try {
        const output = await produce(job);
        if (signal?.aborted === true) return;
        const formats = reportFormats(job.kind);
        const put = async (
          format: ReportFormat,
          bytes: Uint8Array,
          contentType: string,
        ): Promise<ReportFile> => {
          const key = companyFileKey(workspaceId, "reports", format);
          await deps.storage.put(key, bytes, contentType);
          written.push(key);
          return { key, contentType, bytes: bytes.byteLength };
        };
        const xlsx =
          formats.includes("xlsx") && output.xlsx != null
            ? await put("xlsx", output.xlsx, XLSX_CONTENT_TYPE)
            : null;
        const pdf = await put("pdf", output.pdf, PDF_CONTENT_TYPE);
        const done = await deps.store.markDone(
          job,
          { xlsx, pdf, fileName: output.fileName },
          clock(),
        );
        // Timed out or deleted while it ran: keep nothing.
        if (!done) await discard();
      } catch (error) {
        console.error(`Report job ${id} failed`, error);
        await discard();
        if (signal?.aborted !== true)
          await deps.store.markFailed(id, failureMessage(error), clock());
      }
    },

    async timeOut({ id }, limitMs) {
      await deps.store.markFailed(
        id,
        failureMessage(new ReportTimedOut(limitMs)),
        clock(),
      );
    },
  };
}

/**
 * A runner that runs the job before `enqueue` returns (M2), stopping it
 * after `timeLimitMs` (60 s, CM-0016 §15): the job is marked failed with a
 * message and the run is aborted, so it writes no files when it ends.
 */
export function inlineReportRunner(
  executor: ReportExecutor,
  options: { timeLimitMs?: number } = {},
): ReportRunner {
  const limit = options.timeLimitMs ?? REPORT_TIME_LIMIT_MS;
  return {
    async enqueue(job) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<true>((resolve) => {
        timer = setTimeout(() => {
          resolve(true);
        }, limit);
      });
      const run = executor.execute(job, controller.signal).then(() => false);
      try {
        if (await Promise.race([run, timedOut])) {
          controller.abort();
          // The run keeps going in the background until its next check.
          run.catch((error: unknown) => {
            console.error(`Report job ${job.id} failed after its limit`, error);
          });
          await executor.timeOut(job, limit);
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
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

    /**
     * Runs a failed job again (Retry): back to queued, then to the runner.
     * 409 `REPORT_NOT_FAILED` unless it failed.
     */
    async retry(job: ReportJob): Promise<ReportJob> {
      if (
        job.status !== "failed" ||
        !(await deps.store.requeue(job.workspaceId, job.id))
      )
        throw conflict(
          "REPORT_NOT_FAILED",
          "Only a report that failed can be retried.",
        );
      await deps.runner.enqueue(job);
      return get(job.workspaceId, job.id);
    },

    /** Deletes a job and its stored files. */
    async remove(job: ReportJob, by: string): Promise<void> {
      await deps.store.remove(job, by, clock());
      await Promise.allSettled(
        [job.xlsxKey, job.pdfKey]
          .filter((key): key is string => key != null)
          .map((key) => deps.storage.delete(key)),
      );
    },

    /** The file of a done job, streamed from storage. */
    async download(
      job: ReportJob,
      format: ReportFormat,
    ): Promise<ReportDownload> {
      if (!reportFormats(job.kind).includes(format))
        throw conflict(
          "REPORT_FORMAT_UNAVAILABLE",
          `This report has no ${format === "xlsx" ? "Excel" : "PDF"} file.`,
        );
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
