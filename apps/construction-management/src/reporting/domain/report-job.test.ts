import { describe, expect, it } from "vitest";

import {
  REPORT_STALE_AFTER_SECONDS,
  REPORT_TIME_LIMIT_SECONDS,
  REPORT_TIMED_OUT_MESSAGE,
  withTimeLimit,
  type ReportJob,
} from "./report-job";

const QUEUED_AT = new Date("2026-10-09T10:00:00Z");

function job(overrides: Partial<ReportJob> = {}): ReportJob {
  return {
    id: "job-1",
    workspaceId: "ws-1",
    projectId: "project-1",
    kind: "labour_attendance",
    params: { kind: "labour_attendance", from: "2026-09-01", to: "2026-09-30" },
    status: "running",
    includesMoney: false,
    xlsxKey: null,
    pdfKey: null,
    fileName: null,
    error: null,
    requestedBy: "user-1",
    createdAt: QUEUED_AT,
    startedAt: QUEUED_AT,
    finishedAt: null,
    ...overrides,
  };
}

function after(seconds: number): Date {
  return new Date(QUEUED_AT.getTime() + seconds * 1000);
}

describe("a report job's time limit", () => {
  it("leaves a little room above the request's time limit", () => {
    expect(REPORT_STALE_AFTER_SECONDS).toBeGreaterThan(
      REPORT_TIME_LIMIT_SECONDS,
    );
  });

  it("keeps a running job running up to the stale threshold", () => {
    const running = job();
    expect(withTimeLimit(running, after(REPORT_STALE_AFTER_SECONDS))).toBe(
      running,
    );
  });

  it("reads a running job past the threshold as failed, without touching the original", () => {
    const running = job();
    const seen = withTimeLimit(running, after(REPORT_STALE_AFTER_SECONDS + 1));
    expect(seen.status).toBe("failed");
    expect(seen.error).toBe(REPORT_TIMED_OUT_MESSAGE);
    expect(seen.error).toBe("The report took too long. Try a shorter period.");
    expect(running.status).toBe("running");
  });

  it("counts from when a job started, not when it was queued", () => {
    const running = job({ startedAt: after(60) });
    expect(
      withTimeLimit(running, after(REPORT_STALE_AFTER_SECONDS + 30)).status,
    ).toBe("running");
  });

  it("fails a queued job that never started, counted from when it was queued", () => {
    const queued = job({ status: "queued", startedAt: null });
    expect(withTimeLimit(queued, after(30)).status).toBe("queued");
    const seen = withTimeLimit(queued, after(10 * 60));
    expect(seen.status).toBe("failed");
    expect(seen.error).toBe(REPORT_TIMED_OUT_MESSAGE);
  });

  it("never changes a finished job", () => {
    const done = job({ status: "done", finishedAt: after(5) });
    const failed = job({
      status: "failed",
      error: "No.",
      finishedAt: after(5),
    });
    expect(withTimeLimit(done, after(3600))).toBe(done);
    expect(withTimeLimit(failed, after(3600)).error).toBe("No.");
  });
});
