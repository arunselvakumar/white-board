import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as downloadReport } from "@/app/api/construction/reporting/reports/[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "@/app/api/construction/reporting/reports/report-models";
import { POST as requestReport } from "@/app/api/construction/reporting/reports/route";
import { GET as listDownloads } from "@/app/api/construction/reporting/downloads/route";
import type { ListConstructionReportingDownloadsResponseModel as Page } from "@/app/api/construction/reporting/downloads/download-models";
import { DAILY_JOB_TYPES, drainQueue, enqueue } from "@/src/composition/queue";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import { storedBytes } from "@/src/shared-kernel/files/stored-files";
import { newId } from "@/src/shared-kernel/ids";
import { addProject, jsonRequest, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { REPORT_RETENTION_JOB_TYPE } from "@/src/reporting/application/report-retention";

const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const DAY_MS = 86_400_000;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function generate(company: Company, projectId: string): Promise<Job> {
  const response = await requestReport(
    jsonRequest(REPORTS, company.cookie, {
      kind: "labour_attendance",
      projectId,
      params: { from: "2026-09-01", to: "2026-09-30" },
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.status).toBe("done");
  return job;
}

async function keysOf(id: string): Promise<string[]> {
  const row = await prisma.constructionReportingReportJob.findUniqueOrThrow({
    where: { id },
  });
  return [row.xlsxKey, row.pdfKey].filter((key): key is string => key != null);
}

/** Runs one retention job through the queue, as the daily cron does. */
async function runRetention(): Promise<void> {
  const id = await enqueue({
    type: REPORT_RETENTION_JOB_TYPE,
    workspaceId: null,
    payload: { test: newId() },
    dedupeKey: `test:retention:${newId()}`,
  });
  const result = await drainQueue({ ids: [id] });
  expect(result.failed).toBe(0);
  const row = await prisma.constructionOrganizationQueueJob.findUniqueOrThrow({
    where: { id },
  });
  expect(row.status).toBe("done");
}

describe("report retention (ADR CM-0021 §3)", () => {
  it("is a daily job", () => {
    expect(DAILY_JOB_TYPES).toContain("reporting.retention");
    expect(DAILY_JOB_TYPES).toContain("queue.cleanup");
    expect(DAILY_JOB_TYPES).toContain("files.orphans");
  });

  it("expires report files 30 days after they were ready, keeps Progress Reports and newer ones", async () => {
    const company = await ownerWithCompany("Retention Builders");
    const projectId = await addProject(company.workspaceId, company.userId);
    const old = await generate(company, projectId);
    const recent = await generate(company, projectId);
    const oldKeys = await keysOf(old.id);
    expect(oldKeys).toHaveLength(2);
    const storage = objectStorage();
    for (const key of oldKeys) expect(await storage.head(key)).not.toBeNull();
    const before = await storedBytes(prisma, company.workspaceId);
    const oldBytes = (
      await prisma.constructionOrganizationStoredFile.findMany({
        where: { key: { in: oldKeys } },
      })
    ).reduce((sum, file) => sum + file.bytes, 0);

    const now = Date.now();
    await prisma.constructionReportingReportJob.update({
      where: { id: old.id },
      data: { finishedAt: new Date(now - 31 * DAY_MS) },
    });
    await prisma.constructionReportingReportJob.update({
      where: { id: recent.id },
      data: { finishedAt: new Date(now - 29 * DAY_MS) },
    });
    // A Daily Progress Report is kept until someone deletes it.
    const dpr = newId();
    await prisma.constructionReportingReportJob.create({
      data: {
        id: dpr,
        workspaceId: company.workspaceId,
        projectId,
        kind: "daily_progress_report",
        params: {
          kind: "daily_progress_report",
          date: "2026-08-01",
          filledBy: null,
          includeImages: false,
          number: "DPR/26-27/00001",
        },
        status: "done",
        includesMoney: false,
        requestedBy: company.userId,
        pdfKey: `companies/${company.workspaceId}/reports/${newId()}.pdf`,
        fileName: "dpr",
        createdAt: new Date(now - 90 * DAY_MS),
        finishedAt: new Date(now - 90 * DAY_MS),
      },
    });

    await runRetention();

    const expired =
      await prisma.constructionReportingReportJob.findUniqueOrThrow({
        where: { id: old.id },
      });
    expect(expired).toMatchObject({
      status: "expired",
      xlsxKey: null,
      pdfKey: null,
    });
    for (const key of oldKeys) expect(await storage.head(key)).toBeNull();
    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { key: { in: oldKeys } },
    });
    expect(files.every((file) => file.deletedAt != null)).toBe(true);
    expect(await storedBytes(prisma, company.workspaceId)).toBe(
      before - oldBytes,
    );
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          entityId: old.id,
          action: "report_job.expired",
          actorUserId: "system",
        },
      }),
    ).toBe(1);
    const kept = await prisma.constructionReportingReportJob.findMany({
      where: { id: { in: [recent.id, dpr] } },
      select: { status: true },
    });
    expect(kept.map((row) => row.status)).toEqual(["done", "done"]);

    // The expired job says so and cannot be downloaded.
    const download = await downloadReport(
      jsonRequest(`${REPORTS}/${old.id}/download?format=xlsx`, company.cookie),
      { params: Promise.resolve({ id: old.id }) },
    );
    expect(download.status).toBe(StatusCodes.CONFLICT);
    expect((await json<{ code: string }>(download)).code).toBe(
      "REPORT_EXPIRED",
    );
    const page = await json<Page>(
      await listDownloads(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/reporting/downloads`,
          company.cookie,
        ),
      ),
    );
    expect(page.items.find((item) => item.id === old.id)).toMatchObject({
      status: "expired",
      files: [],
    });

    // A second run finds nothing more to do.
    await runRetention();
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: { entityId: old.id, action: "report_job.expired" },
      }),
    ).toBe(1);
  });
});
