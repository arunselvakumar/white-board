import { prisma, type Prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import type { ReportKind } from "@/src/reporting/domain/report-job";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteReport } from "../reports/[id]/delete/route";
import { GET as downloadReport } from "../reports/[id]/download/route";
import { POST as retryReport } from "../reports/[id]/retry/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "../reports/report-models";
import { POST as requestReport } from "../reports/route";
import type { ListConstructionReportingDownloadsResponseModel as Page } from "./download-models";
import { GET as listDownloads } from "./route";

const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const DOWNLOADS = `${TEST_ORIGIN}/api/construction/reporting/downloads`;
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

async function page(cookie: string, query = ""): Promise<Page> {
  const response = await listDownloads(
    jsonRequest(`${DOWNLOADS}${query}`, cookie),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Page>(response);
}

async function member(
  company: Company,
  permissions: PermissionGrants,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

/** A report job row, written straight to the table. */
async function addJob(
  company: { workspaceId: string },
  input: {
    requestedBy: string;
    projectId: string | null;
    kind?: ReportKind;
    status?: "queued" | "running" | "done" | "failed" | "expired";
    createdAt: Date;
    params?: Prisma.InputJsonObject;
    error?: string;
  },
): Promise<string> {
  const id = newId();
  const kind = input.kind ?? "labour_attendance";
  const status = input.status ?? "done";
  const done = status === "done";
  await prisma.constructionReportingReportJob.create({
    data: {
      id,
      workspaceId: company.workspaceId,
      projectId: input.projectId,
      kind,
      params: input.params ?? { kind, ...SEPTEMBER },
      status,
      includesMoney: false,
      requestedBy: input.requestedBy,
      createdAt: input.createdAt,
      finishedAt: status === "queued" ? null : input.createdAt,
      xlsxKey: done ? `companies/${company.workspaceId}/reports/x.xlsx` : null,
      pdfKey: done ? `companies/${company.workspaceId}/reports/x.pdf` : null,
      fileName: done ? "report" : null,
      error: input.error ?? null,
    },
  });
  return id;
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 9, minute, 0, 0));

describe("Downloads HTTP (CM-901)", () => {
  it("lists only the member's own reports across Projects and central, newest first, a page at a time", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(
      company.workspaceId,
      company.userId,
      "Tower A",
    );
    const villa = await addProject(
      company.workspaceId,
      company.userId,
      "Villa",
    );
    const asha = await member(
      company,
      {
        "labour.labour": ["read", "report"],
        "labour.vendor": ["read", "report"],
      },
      [tower, villa],
    );
    const oldest = await addJob(company, {
      requestedBy: asha.userId,
      projectId: tower,
      createdAt: at(1),
    });
    const central = await addJob(company, {
      requestedBy: asha.userId,
      projectId: null,
      kind: "vendor_attendance",
      params: {
        kind: "vendor_attendance",
        ...SEPTEMBER,
        vendorId: null,
        labourCategoryId: null,
        projectIds: [tower, villa],
      },
      createdAt: at(2),
    });
    const failed = await addJob(company, {
      requestedBy: asha.userId,
      projectId: villa,
      kind: "labour_month",
      params: { kind: "labour_month", month: "2026-09" },
      status: "failed",
      error: "The report could not be generated. Try again.",
      createdAt: at(3),
    });
    // The Owner's own report is not Asha's to see here.
    await addJob(company, {
      requestedBy: company.userId,
      projectId: tower,
      createdAt: at(4),
    });

    const first = await page(asha.cookie, "?limit=2");
    expect(first.items.map((item) => item.id)).toEqual([failed, central]);
    expect(first.nextCursor).not.toBeNull();
    const [failedRow, centralRow] = first.items;
    expect(failedRow).toMatchObject({
      source: "report",
      kind: "labour_month",
      title: "Month-wise Labour",
      detail: "September 2026",
      projectId: villa,
      projectName: "Villa",
      status: "failed",
      error: "The report could not be generated. Try again.",
      files: [],
      retryHref: `/api/construction/reporting/reports/${failed}/retry`,
      deleteHref: `/api/construction/reporting/reports/${failed}/delete`,
      expiresAt: null,
    });
    expect(centralRow).toMatchObject({
      projectId: null,
      projectName: null,
      status: "done",
      retryHref: null,
      detail: "01 Sep 2026 to 30 Sep 2026",
      files: [
        {
          format: "xlsx",
          label: "Excel",
          href: `/api/construction/reporting/reports/${central}/download?format=xlsx`,
        },
        {
          format: "pdf",
          label: "PDF",
          href: `/api/construction/reporting/reports/${central}/download?format=pdf`,
        },
      ],
    });
    // Kept 30 days after it finished.
    expect(centralRow?.expiresAt).toBe(
      new Date(at(2).getTime() + 30 * 86_400_000).toISOString(),
    );

    const second = await page(
      asha.cookie,
      `?limit=2&cursor=${first.nextCursor ?? ""}`,
    );
    expect(second.items.map((item) => item.id)).toEqual([oldest]);
    expect(second.items[0]?.projectName).toBe("Tower A");
    expect(second.nextCursor).toBeNull();

    // The Owner sees their own only.
    const owners = await page(company.cookie);
    expect(owners.items).toHaveLength(1);
    expect(owners.items[0]?.projectName).toBe("Tower A");

    const bad = await listDownloads(
      jsonRequest(`${DOWNLOADS}?cursor=nonsense`, asha.cookie),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(bad)).toBe("CURSOR_INVALID");
    expect((await listDownloads(new Request(DOWNLOADS))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });

  it("offers no download once the member lost Report, and sends Progress Reports to their own routes", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const writer = await member(
      company,
      { "site_work.progress_reports": ["create", "read"] },
      [tower],
    );
    // Asked for while they had Labour Report; they no longer have it.
    const labour = await addJob(company, {
      requestedBy: writer.userId,
      projectId: tower,
      createdAt: at(1),
    });
    const dpr = await addJob(company, {
      requestedBy: writer.userId,
      projectId: tower,
      kind: "daily_progress_report",
      params: {
        kind: "daily_progress_report",
        date: "2026-09-10",
        filledBy: null,
        includeImages: false,
        number: "DPR/26-27/00001",
      },
      status: "failed",
      createdAt: at(2),
    });
    const { items } = await page(writer.cookie);
    const byId = new Map(items.map((item) => [item.id, item]));
    expect(byId.get(labour)?.files).toEqual([]);
    expect(byId.get(dpr)).toMatchObject({
      title: "Daily Progress Report",
      detail: "DPR/26-27/00001 · 10 Sep 2026",
      progressReport: true,
      retryHref: `/api/construction/site-work/progress-reports/${dpr}/retry`,
      // Progress Report delete is not theirs.
      deleteHref: null,
      expiresAt: null,
    });
  });

  it("retries a failed report for its requester or the Owner, and refuses others", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const grants: PermissionGrants = { "labour.labour": ["read", "report"] };
    const asha = await member(company, grants, [tower]);
    const ravi = await member(company, grants, [tower]);
    const failed = await addJob(company, {
      requestedBy: asha.userId,
      projectId: tower,
      status: "failed",
      error: "The report could not be generated. Try again.",
      createdAt: at(1),
    });
    const retryAs = (cookie: string, id: string) =>
      retryReport(
        jsonRequest(`${REPORTS}/${id}/retry`, cookie, {}),
        idParams(id),
      );

    const refused = await retryAs(ravi.cookie, failed);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);

    // Outside a request the queue runs the job inline: it is done.
    const retried = await retryAs(asha.cookie, failed);
    expect(retried.status).toBe(StatusCodes.OK);
    const job = await json<Job>(retried);
    expect(job.status).toBe("done");
    expect(job.error).toBeNull();
    expect(job.downloads.pdf).not.toBeNull();

    const again = await retryAs(asha.cookie, failed);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(again)).toBe("REPORT_NOT_FAILED");

    // The Owner may retry a member's failed report.
    const second = await addJob(company, {
      requestedBy: asha.userId,
      projectId: tower,
      status: "failed",
      createdAt: at(2),
    });
    expect((await retryAs(company.cookie, second)).status).toBe(StatusCodes.OK);

    const other = await ownerWithCompany("Other Builders");
    expect((await retryAs(other.cookie, failed)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // A Progress Report retries from its own module.
    const dpr = await addJob(company, {
      requestedBy: company.userId,
      projectId: tower,
      kind: "daily_progress_report",
      params: {
        kind: "daily_progress_report",
        date: "2026-09-10",
        filledBy: null,
        includeImages: false,
        number: "DPR/26-27/00001",
      },
      status: "failed",
      createdAt: at(3),
    });
    expect((await retryAs(company.cookie, dpr)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("deletes a report and its files for its requester or the Owner only", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const asha = await member(
      company,
      { "labour.labour": ["read", "report"] },
      [tower],
    );
    const ravi = await member(
      company,
      { "labour.labour": ["read", "report"] },
      [tower],
    );
    const generated = await requestReport(
      jsonRequest(REPORTS, asha.cookie, {
        kind: "labour_attendance",
        projectId: tower,
        params: SEPTEMBER,
      }),
    );
    expect(generated.status).toBe(StatusCodes.CREATED);
    const job = await json<Job>(generated);
    expect(job.status).toBe("done");
    const files = () =>
      prisma.constructionOrganizationStoredFile.findMany({
        where: { workspaceId: company.workspaceId, kind: "report" },
      });
    expect((await files()).every((file) => file.deletedAt == null)).toBe(true);

    const deleteAs = (cookie: string, id: string) =>
      deleteReport(
        jsonRequest(`${REPORTS}/${id}/delete`, cookie, {}),
        idParams(id),
      );
    expect((await deleteAs(ravi.cookie, job.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await deleteAs(asha.cookie, job.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect(
      await prisma.constructionReportingReportJob.count({
        where: { id: job.id },
      }),
    ).toBe(0);
    const stored = await files();
    expect(stored).toHaveLength(2);
    expect(stored.every((file) => file.deletedAt != null)).toBe(true);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: { entityId: job.id, action: "report_job.deleted" },
      }),
    ).toBe(1);
    expect((await deleteAs(asha.cookie, job.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await page(asha.cookie)).items).toEqual([]);

    // The Owner may delete a member's report.
    const ravis = await addJob(company, {
      requestedBy: ravi.userId,
      projectId: tower,
      createdAt: at(1),
    });
    expect((await deleteAs(company.cookie, ravis)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
  });

  it("shows an expired report without downloads, and its download is 409 REPORT_EXPIRED", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const expired = await addJob(company, {
      requestedBy: company.userId,
      projectId: tower,
      status: "expired",
      createdAt: at(1),
    });
    const { items } = await page(company.cookie);
    expect(items[0]).toMatchObject({
      id: expired,
      status: "expired",
      files: [],
      retryHref: null,
      expiresAt: null,
    });
    const response = await downloadReport(
      jsonRequest(`${REPORTS}/${expired}/download?format=pdf`, company.cookie),
      idParams(expired),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(response)).toBe("REPORT_EXPIRED");
  });
});
