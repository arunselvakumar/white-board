import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as moveStage } from "@/app/api/construction/marketing/companies/[id]/stage/route";
import { POST as createCompany } from "@/app/api/construction/marketing/companies/route";
import { POST as markDone } from "@/app/api/construction/marketing/follow-ups/[id]/done/route";
import { POST as createVisit } from "@/app/api/construction/marketing/visits/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import {
  addDays,
  todayIn,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { zoneInstant } from "@/src/shared-kernel/zone-time";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "./report-models";
import { POST as requestReport } from "./route";

const MARKETING = `${TEST_ORIGIN}/api/construction/marketing`;
const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;

type Session = { cookie: string; userId: string };
type Company = { id: string; name: string; contacts: { id: string }[] };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** The Marketing Role's cells plus Visits Report: own records only. */
const MARKETER: PermissionGrants = {
  "marketing.visits": ["create", "read", "update", "report"],
  "marketing.follow_ups": ["create", "read", "update"],
  "marketing.companies": ["create", "read", "update"],
};

/** The same without Visits Report. */
const NO_REPORT: PermissionGrants = {
  ...MARKETER,
  "marketing.visits": ["create", "read", "update"],
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function named(
  owner: Awaited<ReturnType<typeof ownerWithCompany>>,
  name: string,
  grants: PermissionGrants = MARKETER,
) {
  const member = await memberWith(owner, grants);
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: member.memberId },
    data: { name },
  });
  return member;
}

async function aCompany(who: Session, name: string): Promise<Company> {
  const response = await createCompany(
    jsonRequest(`${MARKETING}/companies`, who.cookie, {
      name: `${name} ${randomUUID().slice(0, 6)}`,
      city: "Coimbatore",
      primaryContact: { name: "Lakshmi" },
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

/**
 * `ago` milliseconds back, but never before the Company's today: a Visit
 * made in the first minutes after midnight stays in today's register and
 * this month's summary. Each call is later than the one before, so the
 * latest Visit stays the latest.
 */
async function recently(company: Company, ago: number): Promise<Date> {
  const { workspaceId } =
    await prisma.constructionMarketingProspectCompany.findUniqueOrThrow({
      where: { id: company.id },
      select: { workspaceId: true },
    });
  const timeZone = await companyTimezone(prisma, workspaceId);
  const now = Date.now();
  const dayStart = zoneInstant(
    todayIn(timeZone, new Date(now)),
    0,
    timeZone,
  ).getTime();
  return new Date(Math.max(now - ago, Math.floor((dayStart + now) / 2)));
}

/** A Completed Visit a minute ago: in today's month and the register's days. */
async function logVisit(
  who: Session,
  company: Company,
  body: Record<string, unknown> = {},
): Promise<{ id: string; number: string }> {
  const response = await createVisit(
    jsonRequest(`${MARKETING}/visits`, who.cookie, {
      status: "completed",
      prospectCompanyId: company.id,
      visitAt: (await recently(company, 60_000)).toISOString(),
      contactIds: company.contacts.map((contact) => contact.id),
      discussion: "Needs a 40 m PEB shed near Sulur.",
      ...body,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<{ id: string; number: string }>(response);
}

/** A Planned Visit moved to two minutes ago, never checked in: Missed. */
async function missedVisit(who: Session, company: Company) {
  const response = await createVisit(
    jsonRequest(`${MARKETING}/visits`, who.cookie, {
      status: "planned",
      prospectCompanyId: company.id,
      visitAt: new Date(Date.now() + 86_400_000).toISOString(),
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const visit = await json<{ id: string; number: string }>(response);
  await prisma.constructionMarketingVisit.update({
    where: { id: visit.id },
    data: { visitAt: await recently(company, 120_000) },
  });
  return visit;
}

async function request(who: Session, body: unknown): Promise<Response> {
  return requestReport(jsonRequest(REPORTS, who.cookie, body));
}

async function generate(who: Session, body: unknown): Promise<Job> {
  const response = await request(who, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

/** The built Excel's first sheet as its header and lines (before Total). */
async function table(who: Session, job: Job, first: string) {
  const response = await downloadReport(
    jsonRequest(`${REPORTS}/${job.id}/download?format=xlsx`, who.cookie),
    params(job.id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.from(await bytesOf(response)) as unknown as ExcelJS.Buffer,
  );
  const rows = rowsOf(book.worksheets[0]);
  const headerIndex = rows.findIndex((row) => row[0] === first);
  // Marketing is not about Projects: no Project line above the table.
  expect(rows.slice(0, headerIndex).map((row) => row[0])).not.toContain(
    "Project",
  );
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const totals = body.findIndex((row) => row[0] === "Total");
  const lines = totals < 0 ? body : body.slice(0, totals);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  const find = (text: string) =>
    lines.find((row) =>
      row.some((item) => typeof item === "string" && item.includes(text)),
    );
  return { header, lines, cell, find };
}

async function today(workspaceId: string): Promise<CalendarDate> {
  return todayIn(await companyTimezone(prisma, workspaceId));
}

describe("the Marketing reports (ADR CM-0040 §13)", () => {
  it("lists every Visit for the Owner and a member's own without View all, Missed included", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi");
    const priya = await named(owner, "Priya");
    const day = await today(owner.workspaceId);
    const kaveri = await aCompany(ravi, "Kaveri Steel");
    const pandian = await aCompany(priya, "Pandian Mills");
    const logged = await logVisit(ravi, kaveri, {
      purpose: "quotation",
      interest: "hot",
      outcome: "Quote by Friday",
      requirementValue: 2_500_000,
      nextFollowUp: { type: "call", dueDate: addDays(day, 3) },
    });
    const missed = await missedVisit(ravi, kaveri);
    const theirs = await logVisit(priya, pandian);
    const range = { from: addDays(day, -1), to: day };
    const body = (extra: Record<string, unknown> = {}) => ({
      kind: "marketing_visit_register",
      projectId: null,
      params: { ...range, ...extra },
    });

    const all = await table(owner, await generate(owner, body()), "Visit No.");
    expect(all.lines).toHaveLength(3);
    const row = all.find(logged.number);
    expect(all.cell(row, "Prospect Company")).toBe(kaveri.name);
    expect(all.cell(row, "City")).toBe("Coimbatore");
    expect(all.cell(row, "Contacts met")).toBe("Lakshmi");
    expect(all.cell(row, "Visited by")).toBe("Ravi");
    expect(all.cell(row, "Purpose")).toBe("Quotation");
    expect(all.cell(row, "Status")).toBe("Completed");
    expect(all.cell(row, "Interest")).toBe("Hot");
    expect(all.cell(row, "Approx. value")).toBe(2_500_000);
    expect(all.cell(row, "Discussion / outcome")).toBe(
      "Needs a 40 m PEB shed near Sulur. Outcome: Quote by Friday",
    );
    expect(all.cell(row, "Next Follow-up")).toMatch(/\d{2} \w{3} \d{4}/);
    expect(all.cell(row, "Checked in")).toBe("No");
    expect(all.cell(all.find(missed.number), "Status")).toBe("Missed");
    expect(all.find(theirs.number)).toBeDefined();

    // Ravi without View all: his own two, not Priya's.
    const own = await table(ravi, await generate(ravi, body()), "Visit No.");
    expect(own.lines.map((line) => own.cell(line, "Visit No.")).sort()).toEqual(
      [logged.number, missed.number].sort(),
    );

    const onlyMissed = await table(
      owner,
      await generate(owner, body({ status: "missed" })),
      "Visit No.",
    );
    expect(onlyMissed.lines).toHaveLength(1);
    expect(onlyMissed.cell(onlyMissed.lines[0], "Visit No.")).toBe(
      missed.number,
    );
    const priyas = await table(
      owner,
      await generate(owner, body({ memberId: priya.memberId })),
      "Visit No.",
    );
    expect(priyas.lines).toHaveLength(1);
  });

  it("refuses every Marketing report without Visits Report", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi", NO_REPORT);
    const day = await today(owner.workspaceId);
    for (const body of [
      {
        kind: "marketing_visit_register",
        projectId: null,
        params: { from: day, to: day },
      },
      {
        kind: "marketing_person_summary",
        projectId: null,
        params: { month: day.slice(0, 7) },
      },
      {
        kind: "marketing_company_pipeline",
        projectId: null,
        params: { asOn: day },
      },
    ]) {
      const response = await request(ravi, body);
      expect(response.status, body.kind).toBe(StatusCodes.FORBIDDEN);
    }
  });

  it("sums each Marketing Person's month, and only a member's own row without View all", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi");
    const priya = await named(owner, "Priya");
    const day = await today(owner.workspaceId);
    const kaveri = await aCompany(ravi, "Kaveri Steel");
    await logVisit(ravi, kaveri);
    await logVisit(ravi, kaveri);
    await missedVisit(ravi, kaveri);
    await logVisit(priya, await aCompany(priya, "Pandian Mills"));
    const current =
      await prisma.constructionMarketingProspectCompany.findUniqueOrThrow({
        where: { id: kaveri.id },
        select: { updatedAt: true },
      });
    const won = await moveStage(
      jsonRequest(`${MARKETING}/companies/${kaveri.id}/stage`, ravi.cookie, {
        expectedUpdatedAt: current.updatedAt.toISOString(),
        stage: "won",
      }),
      params(kaveri.id),
    );
    expect(won.status).toBe(StatusCodes.OK);
    const followUp = await prisma.constructionMarketingFollowUp.create({
      data: {
        id: randomUUID(),
        workspaceId: owner.workspaceId,
        prospectCompanyId: kaveri.id,
        type: "call",
        dueDate: new Date(`${day}T00:00:00Z`),
        ownerMemberId: ravi.memberId,
        createdBy: ravi.userId,
        updatedBy: ravi.userId,
      },
    });
    const done = await markDone(
      jsonRequest(`${MARKETING}/follow-ups/${followUp.id}/done`, ravi.cookie, {
        expectedUpdatedAt: followUp.updatedAt.toISOString(),
      }),
      params(followUp.id),
    );
    expect(done.status).toBe(StatusCodes.OK);
    const body = {
      kind: "marketing_person_summary",
      projectId: null,
      params: { month: day.slice(0, 7) },
    };

    const all = await table(
      owner,
      await generate(owner, body),
      "Marketing Person",
    );
    expect(all.cell(all.find("Ravi"), "Visits completed")).toBe(2);
    expect(all.cell(all.find("Ravi"), "Visits missed")).toBe(1);
    expect(all.cell(all.find("Ravi"), "New Prospect Companies")).toBe(1);
    expect(all.cell(all.find("Ravi"), "Companies won")).toBe(1);
    expect(all.cell(all.find("Ravi"), "Follow-ups done")).toBe(1);
    expect(all.cell(all.find("Priya"), "Visits completed")).toBe(1);

    const own = await table(
      ravi,
      await generate(ravi, body),
      "Marketing Person",
    );
    expect(own.lines.map((line) => line[0])).toEqual(["Ravi"]);

    // Every Visit, but no Follow-ups and only their own companies: each
    // figure keeps its own menu's scope.
    const visitsOnly = await named(owner, "Meena", {
      "marketing.visits": ["read", "report", "view_all"],
      "marketing.companies": ["read"],
    });
    const scoped = await table(
      visitsOnly,
      await generate(visitsOnly, body),
      "Marketing Person",
    );
    const ravisRow = scoped.find("Ravi");
    expect(scoped.cell(ravisRow, "Visits completed")).toBe(2);
    expect(scoped.cell(ravisRow, "Follow-ups done")).toBe(0);
    expect(scoped.cell(ravisRow, "New Prospect Companies")).toBe(0);
    expect(scoped.cell(ravisRow, "Companies won")).toBe(0);
  });

  it("reads the pipeline as on a day with the latest Visit's value, a member's own companies without View all", async () => {
    const owner = await ownerWithCompany();
    const ravi = await named(owner, "Ravi");
    const priya = await named(owner, "Priya");
    const day = await today(owner.workspaceId);
    const kaveri = await aCompany(ravi, "Kaveri Steel");
    const pandian = await aCompany(priya, "Pandian Mills");
    const first = await logVisit(ravi, kaveri, {
      requirementValue: 4_000_000,
    });
    await prisma.constructionMarketingVisit.update({
      where: { id: first.id },
      data: { visitAt: new Date(Date.now() - 3_600_000) },
    });
    await logVisit(ravi, kaveri, { requirementValue: 2_500_000 });
    // The latest, but without a value.
    await logVisit(ravi, kaveri);
    const body = (extra: Record<string, unknown> = {}) => ({
      kind: "marketing_company_pipeline",
      projectId: null,
      params: { asOn: day, ...extra },
    });

    const all = await table(
      owner,
      await generate(owner, body()),
      "Prospect Company",
    );
    expect(all.lines).toHaveLength(2);
    const row = all.find(kaveri.name);
    expect(all.cell(row, "Stage")).toBe("Contacted");
    expect(all.cell(row, "Assigned to")).toBe("Ravi");
    expect(all.cell(row, "City")).toBe("Coimbatore");
    expect(all.cell(row, "Approx. value")).toBe(2_500_000);
    expect(all.cell(row, "Last Visit")).toMatch(/\d{2} \w{3} \d{4}/);
    expect(all.cell(all.find(pandian.name), "Stage")).toBe("New");

    const own = await table(
      ravi,
      await generate(ravi, body()),
      "Prospect Company",
    );
    expect(own.lines.map((line) => line[0])).toEqual([kaveri.name]);

    const newOnly = await table(
      owner,
      await generate(owner, body({ stage: "new" })),
      "Prospect Company",
    );
    expect(newOnly.lines.map((line) => line[0])).toEqual([pandian.name]);
    // The day before the companies were made, there were none.
    const before = await table(
      owner,
      await generate(owner, body({ asOn: addDays(day, -2) })),
      "Prospect Company",
    );
    expect(before.lines).toEqual([]);
  });
});
