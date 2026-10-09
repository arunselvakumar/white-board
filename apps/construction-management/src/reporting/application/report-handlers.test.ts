import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";
import type { StoredObject } from "@/src/shared-kernel/files";

import type { ReportJob } from "../domain/report-job";
import type {
  ReportFile,
  ReportJobStore,
  ReportRenderer,
  ReportSource,
  ReportStorage,
} from "./ports";
import { generatedAtLabel } from "./build-report";
import {
  createReportExecutor,
  createReportHandlers,
  inlineReportRunner,
  type ReportExecutor,
} from "./report-handlers";

const WORKSPACE = "ws-1";
const PROJECT = "0190a000-0000-7000-8000-000000000001";

function memoryStore() {
  const jobs = new Map<string, ReportJob>();
  const files: ReportFile[] = [];
  const statuses: string[] = [];
  const update = (id: string, change: Partial<ReportJob>) => {
    const job = jobs.get(id);
    if (job != null) Object.assign(job, change);
  };
  const store: ReportJobStore = {
    create: (job) => {
      jobs.set(job.id, { ...job });
      statuses.push(job.status);
      return Promise.resolve();
    },
    get: (workspaceId, id) => {
      const job = jobs.get(id);
      return Promise.resolve(
        job?.workspaceId === workspaceId ? { ...job } : null,
      );
    },
    list: (workspaceId, filter) =>
      Promise.resolve(
        [...jobs.values()]
          .filter(
            (job) =>
              job.workspaceId === workspaceId &&
              job.projectId === filter.projectId &&
              filter.kinds.includes(job.kind),
          )
          .reverse()
          .slice(0, filter.limit),
      ),
    markRunning: (id, at) => {
      update(id, { status: "running", startedAt: at });
      statuses.push("running");
      return Promise.resolve();
    },
    markDone: (job, done, at) => {
      files.push(done.xlsx, done.pdf);
      update(job.id, {
        status: "done",
        xlsxKey: done.xlsx.key,
        pdfKey: done.pdf.key,
        fileName: done.fileName,
        finishedAt: at,
      });
      statuses.push("done");
      return Promise.resolve();
    },
    markFailed: (id, error, at) => {
      update(id, { status: "failed", error, finishedAt: at });
      statuses.push("failed");
      return Promise.resolve();
    },
  };
  return { store, jobs, files, statuses };
}

function memoryStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const storage: ReportStorage = {
    put: (key, bytes, contentType) => {
      objects.set(key, { bytes, contentType });
      return Promise.resolve();
    },
    get: (key) => {
      const found = objects.get(key);
      const object: StoredObject | null =
        found == null
          ? null
          : {
              body: new Blob([new Uint8Array(found.bytes)]).stream(),
              contentType: found.contentType,
              contentLength: found.bytes.byteLength,
            };
      return Promise.resolve(object);
    },
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  return { storage, objects };
}

function source(overrides: Partial<ReportSource> = {}): ReportSource {
  return {
    header: () =>
      Promise.resolve({
        companyName: "Patil Builders",
        timezone: "Asia/Kolkata",
        currency: "INR",
        project: { name: "Tower A", address: null },
      }),
    labourDays: () => Promise.resolve({ labours: [], days: [] }),
    labourLedger: () => Promise.resolve({ labours: [], entries: [] }),
    musterRoll: () => Promise.resolve({ labours: [], days: [], entries: [] }),
    vendorLines: () =>
      Promise.resolve({ lines: [], vendorName: null, categoryName: null }),
    ...overrides,
  };
}

const renderer: ReportRenderer = {
  xlsx: (document) =>
    Promise.resolve(new TextEncoder().encode(`xlsx:${document.header.title}`)),
  pdf: () => Promise.resolve(new TextEncoder().encode("%PDF-1.7")),
};

function setup(reportSource: ReportSource = source()) {
  const memory = memoryStore();
  const disk = memoryStorage();
  const executor: ReportExecutor = createReportExecutor({
    store: memory.store,
    source: reportSource,
    renderer,
    storage: disk.storage,
    clock: () => new Date("2026-10-09T10:30:00Z"),
  });
  let id = 0;
  const handlers = createReportHandlers({
    store: memory.store,
    projects: {
      exists: (_, projectId) => Promise.resolve(projectId === PROJECT),
    },
    runner: inlineReportRunner(executor),
    storage: disk.storage,
    newId: () => `job-${String((id += 1))}`,
  });
  return { ...memory, ...disk, handlers, executor };
}

const ATTENDANCE = {
  workspaceId: WORKSPACE,
  userId: "user-1",
  projectId: PROJECT,
  params: {
    kind: "labour_attendance" as const,
    from: "2026-08-01",
    to: "2026-08-31",
  },
  includesMoney: false,
};

describe("report jobs (inline runner)", () => {
  it("queues, runs and finishes a job with two stored files", async () => {
    const { handlers, statuses, files, objects } = setup();
    const job = await handlers.request(ATTENDANCE);
    expect(statuses).toEqual(["queued", "running", "done"]);
    expect(job.status).toBe("done");
    expect(job.fileName).toBe("all-labour-attendance-2026-08-01-to-2026-08-31");
    expect(job.xlsxKey).toMatch(/^companies\/ws-1\/reports\/.+\.xlsx$/);
    expect(job.pdfKey).toMatch(/^companies\/ws-1\/reports\/.+\.pdf$/);
    expect(files.map((file) => file.contentType)).toEqual([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/pdf",
    ]);
    expect(objects.size).toBe(2);

    const pdf = await handlers.download(job, "pdf");
    expect(pdf.contentType).toBe("application/pdf");
    expect(pdf.fileName).toBe(`${job.fileName ?? ""}.pdf`);
    expect(await new Response(pdf.body).text()).toBe("%PDF-1.7");
  });

  it("keeps a failed job's message, deletes nothing it did not write, and refuses its download", async () => {
    const { handlers, objects } = setup(
      source({
        labourDays: () =>
          Promise.reject(
            new DomainError("BROKEN", "The labour register is unavailable."),
          ),
      }),
    );
    const job = await handlers.request(ATTENDANCE);
    expect(job.status).toBe("failed");
    expect(job.error).toBe("The labour register is unavailable.");
    expect(job.finishedAt).not.toBeNull();
    expect(objects.size).toBe(0);
    await expect(handlers.download(job, "xlsx")).rejects.toMatchObject({
      code: "REPORT_NOT_READY",
    });
  });

  it("hides an unexpected error's text", async () => {
    const { handlers } = setup(
      source({
        header: () =>
          Promise.reject(
            new Error("connect ECONNREFUSED 127.0.0.1:5433\n    at stack"),
          ),
      }),
    );
    const job = await handlers.request(ATTENDANCE);
    expect(job.status).toBe("failed");
    expect(job.error).not.toContain("ECONNREFUSED");
  });

  it("refuses an unknown Project, a bad period and a Project-less labour report before queueing", async () => {
    const { handlers, jobs } = setup();
    await expect(
      handlers.request({
        ...ATTENDANCE,
        projectId: "0190a000-0000-7000-8000-00000000dead",
      }),
    ).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    await expect(
      handlers.request({
        ...ATTENDANCE,
        params: {
          kind: "labour_attendance",
          from: "2026-09-01",
          to: "2026-08-01",
        },
      }),
    ).rejects.toMatchObject({ code: "REPORT_PERIOD_INVALID" });
    await expect(
      handlers.request({ ...ATTENDANCE, projectId: null }),
    ).rejects.toMatchObject({ code: "REPORT_PROJECT_REQUIRED" });
    expect(jobs.size).toBe(0);
  });

  it("runs a job only once", async () => {
    const { handlers, executor, statuses } = setup();
    const job = await handlers.request(ATTENDANCE);
    await executor.execute(job);
    expect(statuses.filter((status) => status === "running")).toHaveLength(1);
  });

  it("lists a Project's jobs of the allowed kinds, newest first, and 404s another Company's job", async () => {
    const { handlers } = setup();
    const first = await handlers.request(ATTENDANCE);
    const second = await handlers.request({
      ...ATTENDANCE,
      params: { kind: "labour_month", month: "2026-08" },
    });
    const listed = await handlers.list(WORKSPACE, {
      projectId: PROJECT,
      kinds: ["labour_attendance", "labour_month"],
    });
    expect(listed.map((job) => job.id)).toEqual([second.id, first.id]);
    expect(
      await handlers.list(WORKSPACE, {
        projectId: PROJECT,
        kinds: ["labour_month"],
      }),
    ).toHaveLength(1);
    await expect(handlers.get("other", first.id)).rejects.toMatchObject({
      code: "REPORT_NOT_FOUND",
    });
  });
});

describe("report header", () => {
  it("prints the generation time in the Company's time zone", () => {
    const label = generatedAtLabel(
      new Date("2026-10-09T10:30:00Z"),
      "Asia/Kolkata",
    ).replace(/\s/g, " ");
    expect(label).toMatch(/^09 Oct 2026, 4:00 pm IST$/i);
  });
});
