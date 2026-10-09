import { prisma } from "@repo/db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { bytesOf } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as downloadReport } from "./[id]/download/route";
import { GET as getReport } from "./[id]/route";
import type {
  ConstructionReportingReportJobResponseModel as Job,
  ListConstructionReportingReportsResponseModel as JobList,
} from "./report-models";
import { GET as listReports, POST as requestReport } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorCode(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

const AUDIT = { createdBy: "test", updatedBy: "test" };

/**
 * A Company with two Projects, two Labours on Tower A with August 2026
 * attendance (OT on one day), ledger entries before and in August, and a
 * vendor with a day on each Project. Written straight to the tables.
 */
async function seed(company: Company) {
  const ws = company.workspaceId;
  const [tower, villa] = await Promise.all([
    addProject(ws, company.userId, `Tower A ${newId().slice(-6)}`),
    addProject(ws, company.userId, `Villa ${newId().slice(-6)}`),
  ]);
  const mason = newId();
  await prisma.constructionMastersLabourCategory.create({
    data: {
      id: mason,
      workspaceId: ws,
      name: `Mason ${mason.slice(-6)}`,
      ...AUDIT,
    },
  });
  const supervisor = newId();
  await prisma.constructionMastersSupervisor.create({
    data: {
      id: supervisor,
      workspaceId: ws,
      name: `Murugan ${supervisor.slice(-6)}`,
      ...AUDIT,
    },
  });
  const labour = async (
    name: string,
    extra: { fatherName?: string; gender?: "male" | "female" },
  ) => {
    const id = newId();
    await prisma.constructionLabourLabour.create({
      data: {
        id,
        workspaceId: ws,
        name,
        joiningDate: date("2026-06-01"),
        wageType: "daily",
        wagePerDay: 80_000,
        overtimeWagePerHour: 10_000,
        weeklyHolidays: [0],
        labourCategoryId: mason,
        currentProjectId: tower,
        ...extra,
        ...AUDIT,
      },
    });
    return id;
  };
  const dhuresh = await labour("Dhuresh Nawin", {
    fatherName: "Nawin Kumar",
    gender: "male",
  });
  const abirami = await labour("Abirami Priya", { gender: "female" });

  const mark = async (
    labourId: string,
    day: string,
    status: "present" | "half_day" | "absent" | "holiday",
    earned: number,
    overtime?: { hours: string; amount: number },
  ) => {
    const id = newId();
    await prisma.constructionLabourAttendance.create({
      data: {
        id,
        workspaceId: ws,
        projectId: tower,
        labourId,
        attendanceDate: date(day),
        status,
        supervisorId: supervisor,
        wageType: "daily",
        wageRate: 80_000,
        earned,
        ...AUDIT,
        ...(overtime == null
          ? {}
          : {
              overtime: {
                create: {
                  id: newId(),
                  hours: overtime.hours,
                  ratePerHour: 10_000,
                  amount: overtime.amount,
                },
              },
            }),
      },
    });
    return id;
  };
  await mark(dhuresh, "2026-08-01", "present", 80_000, {
    hours: "2",
    amount: 20_000,
  });
  await mark(dhuresh, "2026-08-02", "half_day", 40_000);
  await mark(dhuresh, "2026-08-31", "present", 80_000);
  await mark(abirami, "2026-08-01", "present", 80_000);
  await mark(abirami, "2026-08-02", "absent", 0);
  // Another Project's day stays out of Tower A's reports.
  await prisma.constructionLabourAttendance.create({
    data: {
      id: newId(),
      workspaceId: ws,
      projectId: villa,
      labourId: abirami,
      attendanceDate: date("2026-08-03"),
      status: "present",
      wageType: "daily",
      wageRate: 80_000,
      earned: 80_000,
      ...AUDIT,
    },
  });

  const entry = (
    partyId: string,
    kind: "opening" | "earned" | "overtime" | "payment" | "advance",
    amount: number,
    day: string,
    projectId: string | null = tower,
    reversesEntryId: string | null = null,
  ) => ({
    id: newId(),
    workspaceId: ws,
    partyType: "labour" as const,
    partyId,
    projectId,
    entryDate: date(day),
    kind,
    amount,
    sourceType: "test",
    sourceId: newId(),
    reversesEntryId,
    createdBy: "test",
  });
  const cancelled = entry(dhuresh, "payment", -10_000, "2026-08-21");
  await prisma.constructionLabourLedgerEntry.createMany({
    data: [
      entry(dhuresh, "opening", 100_000, "2026-06-01", null),
      entry(dhuresh, "earned", 80_000, "2026-07-31"),
      entry(dhuresh, "earned", 80_000, "2026-08-01"),
      entry(dhuresh, "overtime", 20_000, "2026-08-01"),
      entry(dhuresh, "earned", 40_000, "2026-08-02"),
      entry(dhuresh, "earned", 80_000, "2026-08-31"),
      entry(dhuresh, "advance", -30_000, "2026-08-10"),
      entry(dhuresh, "payment", -60_000, "2026-08-20"),
      cancelled,
      entry(dhuresh, "payment", 10_000, "2026-08-21", tower, cancelled.id),
      entry(abirami, "opening", -20_000, "2026-08-15", null),
      entry(abirami, "earned", 80_000, "2026-08-01"),
    ],
  });

  const vendor = newId();
  await prisma.constructionLabourVendor.create({
    data: {
      id: vendor,
      workspaceId: ws,
      name: "Muthu Gang",
      joiningDate: date("2026-01-01"),
      ...AUDIT,
    },
  });
  const vendorDay = async (projectId: string, day: string) =>
    prisma.constructionLabourVendorAttendance.create({
      data: {
        id: newId(),
        workspaceId: ws,
        projectId,
        vendorId: vendor,
        attendanceDate: date(day),
        totalPay: 315_000,
        ...AUDIT,
        lines: {
          create: {
            id: newId(),
            shiftId: newId(),
            shiftName: "Shift 1",
            labourCategoryId: mason,
            fullDayCount: 3,
            halfDayCount: 1,
            overtimeHours: "1.5",
            ratePerDay: 90_000,
            overtimePerHour: 0,
            amount: 315_000,
          },
        },
      },
    });
  await vendorDay(tower, "2026-08-05");
  await vendorDay(villa, "2026-08-06");
  return { tower, villa, dhuresh, abirami, vendor, mason };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };

function request(cookie: string, body: unknown) {
  return requestReport(jsonRequest(BASE, cookie, body));
}

function download(cookie: string, id: string, format: "xlsx" | "pdf") {
  return downloadReport(
    jsonRequest(`${BASE}/${id}/download?format=${format}`, cookie),
    { params: Promise.resolve({ id }) },
  );
}

async function generate(cookie: string, body: unknown): Promise<Job> {
  const response = await request(cookie, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = await json<Job>(response);
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function workbook(cookie: string, job: Job): Promise<ExcelJS.Workbook> {
  const response = await download(cookie, job.id, "xlsx");
  expect(response.status).toBe(StatusCodes.OK);
  expect(response.headers.get("content-type")).toBe(XLSX);
  expect(response.headers.get("content-disposition")).toContain(".xlsx");
  const book = new ExcelJS.Workbook();
  // exceljs declares its own `Buffer` type; a Node Buffer is what it reads.
  const bytes = Buffer.from(await bytesOf(response));
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  return book;
}

async function expectPdf(cookie: string, job: Job): Promise<void> {
  const response = await download(cookie, job.id, "pdf");
  expect(response.status).toBe(StatusCodes.OK);
  expect(response.headers.get("content-type")).toBe("application/pdf");
  const bytes = await bytesOf(response);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
}

/** A sheet as rows of plain values (row 1 first). */
function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow({ includeEmpty: true }, (row, number) => {
    rows[number - 1] = (row.values as unknown[]).slice(1);
  });
  // Sparse when a row is missing: fill the gaps.
  return Array.from(rows, (row: unknown[] | undefined) => row ?? []);
}

/** The table under the header row that starts with `first`. */
function tableOf(sheet: ExcelJS.Worksheet | undefined, first: string) {
  const rows = rowsOf(sheet);
  const headerIndex = rows.findIndex((row) => row[0] === first);
  const header = (rows[headerIndex] ?? []) as string[];
  const body = rows.slice(headerIndex + 1);
  const cell = (row: unknown[] | undefined, label: string) =>
    row?.[header.indexOf(label)];
  const find = (name: string) => body.find((row) => row.includes(name));
  const totals = body.find((row) => row.includes("Total"));
  return { rows, header, body, cell, find, totals };
}

async function member(
  company: Company,
  permissions: Record<string, Flag[]>,
  projectIds: string[],
) {
  const joined = await memberWith(company, permissions);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: joined.memberId, projectId },
    });
  return joined;
}

describe("report jobs HTTP", () => {
  it("All Labour Attendance: an Excel with the header block and totals, and a PDF", async () => {
    const company = await ownerWithCompany("Anugraha Engineers");
    const s: Seeded = await seed(company);
    const job = await generate(company.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(job.title).toBe("All Labour Attendance");
    expect(job.includesMoney).toBe(false);
    expect(job.downloads.xlsx).toBe(
      `/api/construction/reporting/reports/${job.id}/download?format=xlsx`,
    );

    const book = await workbook(company.cookie, job);
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Day by day",
    ]);
    const summary = tableOf(book.getWorksheet("Summary"), "Sl. No.");
    expect(summary.rows[0]?.[0]).toBe("Anugraha Engineers");
    expect(
      summary.rows.some(
        (row) => row[0] === "Period" && row[1] === "01 Aug 2026 to 31 Aug 2026",
      ),
    ).toBe(true);
    expect(
      summary.rows.some(
        (row) => row[0] === "Generated at" && String(row[1]).includes("IST"),
      ),
    ).toBe(true);
    expect(summary.header).toEqual([
      "Sl. No.",
      "Labour",
      "Labour Id",
      "Category",
      "Present",
      "Half day",
      "Absent",
      "Leave",
      "Paid leave",
      "Holiday",
      "OT hours",
    ]);
    const dhuresh = summary.find("Dhuresh Nawin");
    expect(summary.cell(dhuresh, "Present")).toBe(2);
    expect(summary.cell(dhuresh, "Half day")).toBe(1);
    expect(summary.cell(dhuresh, "OT hours")).toBe(2);
    expect(summary.cell(summary.totals, "Present")).toBe(3);
    expect(summary.cell(summary.totals, "Absent")).toBe(1);
    // Abirami's Villa day is not in Tower A's report.
    const days = tableOf(book.getWorksheet("Day by day"), "Date");
    expect(
      days.body.filter((row) => row.includes("Abirami Priya")),
    ).toHaveLength(2);
    await expectPdf(company.cookie, job);

    const stored = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: company.workspaceId, kind: "report" },
    });
    expect(stored).toHaveLength(2);
  });

  it("All Labour Payment follows the ledger mapping (opening inside the period, a reversal)", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const job = await generate(company.cookie, {
      kind: "labour_payment",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(job.includesMoney).toBe(true);
    const book = await workbook(company.cookie, job);
    const table = tableOf(book.worksheets[0], "Sl. No.");
    const dhuresh = table.find("Dhuresh Nawin");
    // Previous 1000 + 800; To Pay 800 + 200 + 400 + 800; advance 300; paid 600.
    expect(table.cell(dhuresh, "Previous Balance")).toBe(1_800);
    expect(table.cell(dhuresh, "To Pay")).toBe(2_200);
    expect(table.cell(dhuresh, "Advance")).toBe(300);
    expect(table.cell(dhuresh, "Paid")).toBe(600);
    expect(table.cell(dhuresh, "Final Amount")).toBe(3_100);
    const abirami = table.find("Abirami Priya");
    expect(table.cell(abirami, "Previous Balance")).toBe(-200);
    expect(table.cell(abirami, "Final Amount")).toBe(600);
    expect(table.cell(table.totals, "Final Amount")).toBe(3_700);
    await expectPdf(company.cookie, job);
  });

  it("Month-wise Labour has a column per day and earnings with Financial", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const job = await generate(company.cookie, {
      kind: "labour_month",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    const book = await workbook(company.cookie, job);
    const table = tableOf(book.worksheets[0], "Sl. No.");
    expect(table.header.slice(2, 33)).toEqual(
      Array.from({ length: 31 }, (_, index) => String(index + 1)),
    );
    const dhuresh = table.find("Dhuresh Nawin");
    expect(table.cell(dhuresh, "1")).toBe("P");
    expect(table.cell(dhuresh, "2")).toBe("½");
    expect(table.cell(dhuresh, "Earned")).toBe(2_000);
    expect(table.cell(dhuresh, "OT amount")).toBe(200);
    expect(table.cell(table.totals, "Total")).toBe(3_000);
    await expectPdf(company.cookie, job);
  });

  it("Vendor Attendance for a Project, and the central report across Projects", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const job = await generate(company.cookie, {
      kind: "vendor_attendance",
      projectId: s.tower,
      params: { ...AUGUST, vendorId: s.vendor, categoryId: s.mason },
    });
    const table = tableOf(
      (await workbook(company.cookie, job)).worksheets[0],
      "Date",
    );
    expect(table.header).not.toContain("Project");
    expect(table.cell(table.totals, "Full day")).toBe(3);
    expect(table.cell(table.totals, "OT hours")).toBe(1.5);
    expect(table.cell(table.totals, "Pay")).toBe(3_150);
    expect(
      table.rows.some((row) =>
        String(row[0]).startsWith("Vendor: Muthu Gang; Labour Category: Mason"),
      ),
    ).toBe(true);
    await expectPdf(company.cookie, job);

    const central = await generate(company.cookie, {
      kind: "vendor_attendance",
      projectId: null,
      params: AUGUST,
    });
    expect(central.projectId).toBeNull();
    const all = tableOf(
      (await workbook(company.cookie, central)).worksheets[0],
      "Date",
    );
    expect(all.header[1]).toBe("Project");
    expect(all.cell(all.totals, "Pay")).toBe(6_300);
    const mine = await json<JobList>(
      await listReports(jsonRequest(BASE, company.cookie)),
    );
    expect(mine.items.map((item) => item.id)).toEqual([central.id]);
  });

  it("the muster roll has the combined register columns", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const job = await generate(company.cookie, {
      kind: "muster_roll",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    expect(job.title).toBe("Muster roll and wage register");
    const book = await workbook(company.cookie, job);
    const table = tableOf(book.worksheets[0], "Sl. No.");
    expect(table.header.slice(0, 5)).toEqual([
      "Sl. No.",
      "Name",
      "Father's name",
      "Category",
      "Sex",
    ]);
    expect(table.header.slice(-13)).toEqual([
      "Days worked",
      "Paid days",
      "Wage type",
      "Wage rate",
      "Basic earned",
      "OT hours",
      "OT amount",
      "Gross",
      "Advance",
      "Deductions",
      "Net payable",
      "Paid in month",
      "Signature / thumb impression",
    ]);
    const dhuresh = table.find("Dhuresh Nawin");
    expect(table.cell(dhuresh, "Father's name")).toBe("Nawin Kumar");
    expect(table.cell(dhuresh, "1")).toBe("P+2");
    expect(table.cell(dhuresh, "Days worked")).toBe(2.5);
    expect(table.cell(dhuresh, "Gross")).toBe(2_200);
    expect(table.cell(dhuresh, "Advance")).toBe(300);
    expect(table.cell(dhuresh, "Net payable")).toBe(1_900);
    expect(table.cell(dhuresh, "Paid in month")).toBe(600);
    await expectPdf(company.cookie, job);
  });

  it("lists a Project's jobs newest first and reads one", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const first = await generate(company.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: AUGUST,
    });
    const second = await generate(company.cookie, {
      kind: "muster_roll",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    const list = await json<JobList>(
      await listReports(
        jsonRequest(`${BASE}?projectId=${s.tower}`, company.cookie),
      ),
    );
    expect(list.items.map((item) => item.id)).toEqual([second.id, first.id]);
    const villa = await json<JobList>(
      await listReports(
        jsonRequest(`${BASE}?projectId=${s.villa}`, company.cookie),
      ),
    );
    expect(villa.items).toEqual([]);
    const read = await getReport(
      jsonRequest(`${BASE}/${first.id}`, company.cookie),
      {
        params: Promise.resolve({ id: first.id }),
      },
    );
    expect((await json<Job>(read)).status).toBe("done");
  });

  it("refuses another Company (404), a member without the menu or Report (403), and money without Financial (403)", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const month = await generate(company.cookie, {
      kind: "labour_month",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    const attendance = await generate(company.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: AUGUST,
    });

    const other = await ownerWithCompany("Other Builders");
    expect((await download(other.cookie, month.id, "pdf")).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const otherRead = await getReport(
      jsonRequest(`${BASE}/${month.id}`, other.cookie),
      {
        params: Promise.resolve({ id: month.id }),
      },
    );
    expect(otherRead.status).toBe(StatusCodes.NOT_FOUND);
    const otherRequest = await request(other.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(otherRequest.status).toBe(StatusCodes.NOT_FOUND);
    expect(await errorCode(otherRequest)).toBe("PROJECT_NOT_FOUND");

    // View but no Report flag.
    const viewer = await member(company, { "labour.labour": ["read"] }, [
      s.tower,
    ]);
    const refused = await request(viewer.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect((await download(viewer.cookie, attendance.id, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await listReports(
          jsonRequest(`${BASE}?projectId=${s.tower}`, viewer.cookie),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);

    // Report without Financial.
    const reporter = await member(
      company,
      { "labour.labour": ["read", "report"] },
      [s.tower],
    );
    const payment = await request(reporter.cookie, {
      kind: "labour_payment",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(payment.status).toBe(StatusCodes.FORBIDDEN);
    expect(await errorCode(payment)).toBe("PERMISSION_DENIED");
    const muster = await request(reporter.cookie, {
      kind: "muster_roll",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    expect(muster.status).toBe(StatusCodes.FORBIDDEN);
    // The Owner's month report carries wages: refused; attendance is fine.
    expect((await download(reporter.cookie, month.id, "xlsx")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await download(reporter.cookie, attendance.id, "xlsx")).status,
    ).toBe(StatusCodes.OK);
    // Their own month report leaves the money columns out.
    const own = await generate(reporter.cookie, {
      kind: "labour_month",
      projectId: s.tower,
      params: { month: "2026-08" },
    });
    expect(own.includesMoney).toBe(false);
    const table = tableOf(
      (await workbook(reporter.cookie, own)).worksheets[0],
      "Sl. No.",
    );
    expect(table.header).not.toContain("Earned");
    // Labour reports only: the vendor report needs Vendor Report.
    const vendor = await request(reporter.cookie, {
      kind: "vendor_attendance",
      projectId: s.tower,
      params: AUGUST,
    });
    expect(vendor.status).toBe(StatusCodes.FORBIDDEN);
    const listed = await json<JobList>(
      await listReports(
        jsonRequest(`${BASE}?projectId=${s.tower}`, reporter.cookie),
      ),
    );
    expect(
      listed.items.every(
        (item) =>
          item.kind.startsWith("labour_") || item.kind === "muster_roll",
      ),
    ).toBe(true);

    // Not on the Project.
    const elsewhere = await member(
      company,
      { "labour.labour": ["read", "report", "financial"] },
      [s.villa],
    );
    expect(
      (
        await request(elsewhere.cookie, {
          kind: "labour_attendance",
          projectId: s.tower,
          params: AUGUST,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await download(elsewhere.cookie, attendance.id, "pdf")).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("validates the request", async () => {
    const company = await ownerWithCompany();
    const s = await seed(company);
    const backwards = await request(company.cookie, {
      kind: "labour_attendance",
      projectId: s.tower,
      params: { from: "2026-08-31", to: "2026-08-01" },
    });
    expect(backwards.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorCode(backwards)).toBe("REPORT_PERIOD_INVALID");
    const noProject = await request(company.cookie, {
      kind: "muster_roll",
      projectId: null,
      params: { month: "2026-08" },
    });
    expect(noProject.status).toBe(StatusCodes.BAD_REQUEST);
    const badFormat = await downloadReport(
      jsonRequest(`${BASE}/${newId()}/download?format=csv`, company.cookie),
      { params: Promise.resolve({ id: newId() }) },
    );
    expect(badFormat.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/reporting/reports",
      "/api/construction/reporting/reports/{id}",
      "/api/construction/reporting/reports/{id}/download",
    ])
      expect(document.paths[path], path).toBeDefined();
    for (const name of [
      "RequestConstructionReportingReportRequest",
      "ConstructionReportingReportJobResponse",
      "ListConstructionReportingReportsResponse",
    ])
      expect(document.components.schemas[name], name).toBeDefined();
  });
});
