import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as requestReport } from "../reports/route";
import type { ListConstructionReportingCatalogueResponseModel as Catalogue } from "./catalogue-models";
import { GET as getCatalogue } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/reporting/catalogue`;

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function catalogue(cookie: string, query: string): Promise<Response> {
  return getCatalogue(jsonRequest(`${BASE}?${query}`, cookie));
}

async function kindsOf(cookie: string, query: string) {
  const response = await catalogue(cookie, query);
  expect(response.status).toBe(StatusCodes.OK);
  return (await json<Catalogue>(response)).items;
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

describe("the report catalogue HTTP (ADR CM-0021 §2)", () => {
  it("gives the Owner every built report of the Project, with money", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const items = await kindsOf(
      company.cookie,
      `scope=project&projectId=${projectId}`,
    );
    const kinds = items.map((item) => item.kind);
    expect(kinds.slice(0, 5)).toEqual([
      "labour_attendance",
      "labour_payment",
      "labour_month",
      "vendor_attendance",
      "muster_roll",
    ]);
    expect(kinds).toContain("task_report");
    expect(kinds).toContain("due_payments");
    expect(kinds).toContain("daily_progress_report");
    // Central-only and not-yet-built reports are left out.
    expect(kinds).not.toContain("tds_194c");
    expect(kinds).not.toContain("purchase_orders");
    expect(kinds).not.toContain("stock_register");
    const month = items.find((item) => item.kind === "labour_month");
    expect(month).toMatchObject({
      title: "Month-wise Labour",
      group: "labour",
      period: "month",
      formats: ["xlsx", "pdf"],
      money: "with_financial",
      includesMoney: true,
      progressReport: false,
    });
    const daily = items.find((item) => item.kind === "daily_work");
    expect(daily?.filters).toEqual([{ key: "contractor", required: false }]);
    expect(
      items.find((item) => item.kind === "daily_progress_report"),
    ).toMatchObject({ formats: ["pdf"], progressReport: true, period: "date" });
  });

  it("trims to the member's Report and Financial flags and Projects", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const villa = await addProject(company.workspaceId, company.userId);
    const reporter = await member(
      company,
      {
        "labour.labour": ["read", "report"],
        "tracking.issues": ["read", "report"],
        "finance.transactions": ["read"],
      },
      [tower],
    );
    const items = await kindsOf(
      reporter.cookie,
      `scope=project&projectId=${tower}`,
    );
    expect(items.map((item) => item.kind)).toEqual([
      "labour_attendance",
      "labour_month",
      "issue_snag_report",
    ]);
    expect(items.every((item) => !item.includesMoney)).toBe(true);
    // Not on Villa: nothing to request there.
    expect(
      await kindsOf(reporter.cookie, `scope=project&projectId=${villa}`),
    ).toEqual([]);

    const financial = await member(
      company,
      { "labour.labour": ["read", "report", "financial"] },
      [tower],
    );
    const withMoney = await kindsOf(
      financial.cookie,
      `scope=project&projectId=${tower}`,
    );
    expect(withMoney.map((item) => item.kind)).toEqual([
      "labour_attendance",
      "labour_payment",
      "labour_month",
      "muster_roll",
    ]);
    expect(
      withMoney.find((item) => item.kind === "labour_month")?.includesMoney,
    ).toBe(true);
    expect(
      withMoney.find((item) => item.kind === "labour_attendance")
        ?.includesMoney,
    ).toBe(false);
  });

  it("lists the central reports with central wording", async () => {
    const company = await ownerWithCompany();
    const owner = await kindsOf(company.cookie, "scope=central");
    expect(owner.map((item) => item.kind)).toEqual([
      "vendor_attendance",
      "equipment_maintenance",
      "equipment_transfers",
      "account_ledger",
      "tds_194c",
      "due_payments",
    ]);
    expect(
      owner.find((item) => item.kind === "due_payments")?.description,
    ).toMatch(/across Projects/);
    expect(
      owner.find((item) => item.kind === "account_ledger")?.filters[0],
    ).toEqual({ key: "account", required: true });

    const parties = await member(
      company,
      { "finance.parties": ["read", "report"], "finance.petty_cash": ["read"] },
      [],
    );
    const items = await kindsOf(parties.cookie, "scope=central");
    expect(items.map((item) => item.kind)).toEqual([
      "tds_194c",
      "due_payments",
    ]);
    expect(items.every((item) => item.includesMoney)).toBe(true);
  });

  it("refuses another Company's Project and a scope without its Project", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    const other = await ownerWithCompany("Other Builders");
    const foreign = await catalogue(
      other.cookie,
      `scope=project&projectId=${projectId}`,
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<{ code: string }>(foreign)).code).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect((await catalogue(company.cookie, "scope=project")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    expect(
      (await catalogue(company.cookie, `scope=central&projectId=${projectId}`))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);
    expect((await catalogue(company.cookie, "scope=everywhere")).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    const anonymous = await getCatalogue(new Request(`${BASE}?scope=central`));
    expect(anonymous.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("refuses a catalogued report that is not built yet with 409 REPORT_NOT_AVAILABLE", async () => {
    const company = await ownerWithCompany();
    const projectId = await addProject(company.workspaceId, company.userId);
    for (const kind of ["purchase_orders", "labour_attendance_central"]) {
      const response = await requestReport(
        jsonRequest(
          `${TEST_ORIGIN}/api/construction/reporting/reports`,
          company.cookie,
          {
            kind,
            projectId: kind === "purchase_orders" ? projectId : null,
            params: { from: "2026-09-01", to: "2026-09-30" },
          },
        ),
      );
      expect(response.status, kind).toBe(StatusCodes.CONFLICT);
      expect((await json<{ code: string }>(response)).code).toBe(
        "REPORT_NOT_AVAILABLE",
      );
    }
    expect(
      await prisma.constructionReportingReportJob.count({
        where: { workspaceId: company.workspaceId },
      }),
    ).toBe(0);
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/reporting/catalogue",
      "/api/construction/reporting/downloads",
      "/api/construction/reporting/reports/{id}/retry",
      "/api/construction/reporting/reports/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const name of [
      "ListConstructionReportingCatalogueResponse",
      "ListConstructionReportingDownloadsResponse",
    ])
      expect(document.components.schemas[name], name).toBeDefined();
  });
});
