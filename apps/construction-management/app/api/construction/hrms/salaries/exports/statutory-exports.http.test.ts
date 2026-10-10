import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as saveSalaries } from "@/app/api/construction/hrms/employees/salary/save/route";
import type { SaveConstructionHrmsEmployeeSalariesResponseModel } from "@/app/api/construction/hrms/employees/salary/employee-salary-models";
import { POST as createStructureRoute } from "@/app/api/construction/hrms/salary-structures/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { ownerMemberId } from "../../leave-http-support";
import { POST as approveRoute } from "../approve/route";
import { POST as calculateRoute } from "../calculate-bulk/route";
import { GET as teamRoute } from "../route";
import type { ListConstructionHrmsTeamSalariesResponseModel } from "../salary-models";
import { GET as esiRoute } from "./esi/route";
import { GET as pfRoute } from "./pf/route";

const BASE = `${TEST_ORIGIN}/api/construction/hrms/salaries`;
// A month that has ended whenever the suite runs.
const MONTH = "2026-09";

const OWNER_UAN = "100200300401";
const MEMBER_UAN = "100200300402";
const OWNER_IP = "1000000001";
const PLAIN_IP = "1000000003";

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const pf = (cookie: string, query: string) =>
  pfRoute(jsonRequest(`${BASE}/exports/pf?${query}`, cookie));
const esi = (cookie: string, query: string) =>
  esiRoute(jsonRequest(`${BASE}/exports/esi?${query}`, cookie));

async function workbookOf(response: Response): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

function rowsOf(sheet: ExcelJS.Worksheet | undefined): unknown[][] {
  const rows: unknown[][] = [];
  sheet?.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1));
  });
  return rows;
}

/** Basic 50% (PF wage) and Special the balance; PF and ESI on, no PT. */
async function structure(cookie: string): Promise<string> {
  const response = await createStructureRoute(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/hrms/salary-structures`,
      cookie,
      {
        name: "Site office",
        description: null,
        components: [
          {
            id: null,
            name: "Basic",
            basis: "percent_of_base",
            amount: null,
            percent: "50",
            isBalancing: false,
            countsForPfWage: true,
          },
          {
            id: null,
            name: "Special",
            basis: "fixed",
            amount: null,
            percent: null,
            isBalancing: true,
            countsForPfWage: false,
          },
        ],
        pf: {
          applicable: true,
          employeePercent: null,
          capAtCeiling: true,
          wageCeiling: null,
        },
        esi: { applicable: true, employeePercent: null },
        pt: { applicable: false, monthlyAmount: null },
        deductAbsentDays: false,
        deductUnpaidLeave: true,
        otherDeductions: [],
        isActive: true,
      },
    ),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

/**
 * The Owner (UAN and IP number), a Team Member with `flags` (UAN, no IP
 * number) and a plain Team Member (IP number, no UAN), all on ₹18,000 a
 * month; September calculated.
 */
async function company(flags: Flag[]) {
  const owner = await ownerWithCompany();
  const member = await memberWith(owner, { "hrms.salaries": flags });
  const plain = await memberWith(owner, {});
  const ownerId = await ownerMemberId(owner.workspaceId, owner.userId);
  const structureId = await structure(owner.cookie);
  const row = (memberId: string, uan: string | null, ip: string | null) => ({
    memberId,
    structureId,
    baseMonthly: 1_800_000,
    componentOverrides: null,
    gender: null,
    uan,
    esiIpNumber: ip,
    effectiveFrom: "2026-01-01",
    expectedUpdatedAt: null,
  });
  const saved = await saveSalaries(
    jsonRequest(
      `${TEST_ORIGIN}/api/construction/hrms/employees/salary/save`,
      owner.cookie,
      {
        rows: [
          row(ownerId, OWNER_UAN, OWNER_IP),
          row(member.memberId, MEMBER_UAN, null),
          row(plain.memberId, null, PLAIN_IP),
        ],
      },
    ),
  );
  expect(saved.status).toBe(StatusCodes.OK);
  const configs =
    await json<SaveConstructionHrmsEmployeeSalariesResponseModel>(saved);
  expect(
    (
      await calculateRoute(
        jsonRequest(`${BASE}/calculate-bulk`, owner.cookie, { month: MONTH }),
      )
    ).status,
  ).toBe(StatusCodes.OK);
  const approveAll = async () => {
    const view = await json<ListConstructionHrmsTeamSalariesResponseModel>(
      await teamRoute(jsonRequest(`${BASE}?month=${MONTH}`, owner.cookie)),
    );
    const slips = view.items.filter((slip) => slip.kind === "regular");
    expect(slips).toHaveLength(3);
    const response = await approveRoute(
      jsonRequest(`${BASE}/approve`, owner.cookie, {
        slips: slips.map((slip) => ({
          id: slip.id,
          expectedUpdatedAt: slip.updatedAt,
        })),
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
  };
  return { owner, member, plain, ownerId, structureId, configs, approveAll };
}

describe("PF and ESI exports (CM-320)", () => {
  it("is 401 without a Session", async () => {
    expect(
      (await pfRoute(new Request(`${BASE}/exports/pf?month=${MONTH}`))).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("needs export and financial on Salary Management", async () => {
    const { member: exportOnly, approveAll } = await company([
      "read",
      "export",
    ]);
    await approveAll();
    expect((await pf(exportOnly.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await esi(exportOnly.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const { member: financialOnly } = await company(["read", "financial"]);
    const refused = await pf(financialOnly.cookie, `month=${MONTH}`);
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json<{ code: string }>(refused)).toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("refuses a month that is not approved, or a bad month, with the field", async () => {
    const { owner, approveAll } = await company(["read"]);
    const pending = await pf(owner.cookie, `month=${MONTH}`);
    expect(pending.status).toBe(StatusCodes.CONFLICT);
    expect(await json(pending)).toMatchObject({
      code: "SALARY_MONTH_NOT_APPROVED",
      details: { field: "month", calculated: 3 },
    });
    expect((await esi(owner.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.CONFLICT,
    );
    // A month with no salaries at all.
    const empty = await esi(owner.cookie, "month=2026-08");
    expect(empty.status).toBe(StatusCodes.CONFLICT);
    expect(await json(empty)).toMatchObject({
      code: "SALARY_MONTH_NOT_APPROVED",
      details: { calculated: 0 },
    });
    const bad = await pf(owner.cookie, "month=September");
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(bad)).toMatchObject({ details: { field: "month" } });
    expect((await pf(owner.cookie, `month=${MONTH}&format=pdf`)).status).toBe(
      StatusCodes.BAD_REQUEST,
    );
    await approveAll();
    expect((await pf(owner.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.OK,
    );
  });

  it("writes the ECR text file for members with a UAN and counts the rest", async () => {
    const { owner, member, approveAll } = await company([
      "read",
      "export",
      "financial",
    ]);
    await approveAll();
    const response = await pf(member.cookie, `month=${MONTH}&format=txt`);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("content-disposition")).toContain(
      `pf-ecr-${MONTH}.txt`,
    );
    expect(response.headers.get("x-ecr-missing-uan")).toBe("1");
    const text = await response.text();
    const lines = text.split("\r\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.split("#~#")).toHaveLength(11);
    const ownerLine = lines.find((line) => line.startsWith(OWNER_UAN));
    // ₹18,000 gross; PF wage ₹9,000 (Basic); 12% = 1,080; EPS 8.33% = 750.
    expect(ownerLine?.split("#~#").slice(2)).toEqual([
      "18000",
      "9000",
      "9000",
      "9000",
      "1080",
      "750",
      "330",
      "0",
      "0",
    ]);
    expect(lines.some((line) => line.startsWith(MEMBER_UAN))).toBe(true);
    // Another Company's Owner has no approved September.
    const other = await ownerWithCompany();
    expect((await pf(other.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.CONFLICT,
    );
    expect((await pf(owner.cookie, `month=${MONTH}`)).status).toBe(
      StatusCodes.OK,
    );
  });

  it("writes the ECR workbook with totals and the members missing a UAN", async () => {
    const { owner, approveAll } = await company(["read"]);
    await approveAll();
    const response = await pf(owner.cookie, `month=${MONTH}&format=xlsx`);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    const workbook = await workbookOf(response);
    const rows = rowsOf(workbook.getWorksheet("ECR"));
    const total = rows.find((row) => row[0] === "Total");
    expect(total?.slice(2)).toEqual([
      36000, 18000, 18000, 18000, 2160, 1500, 660, 0, 0,
    ]);
    const missing = rowsOf(workbook.getWorksheet("Missing UAN"));
    expect(missing).toHaveLength(2);
    expect(missing[1]?.[1]).toBe("No UAN on Employee Management.");
  });

  it("writes the ESI workbook: upload sheet, contributions with totals, missing IP numbers", async () => {
    const { owner, approveAll } = await company(["read"]);
    await approveAll();
    const response = await esi(owner.cookie, `month=${MONTH}`);
    expect(response.status).toBe(StatusCodes.OK);
    expect(response.headers.get("x-esi-missing-ip-number")).toBe("1");
    const workbook = await workbookOf(response);
    const upload = rowsOf(workbook.getWorksheet("MC upload"));
    expect(upload).toHaveLength(3);
    expect(upload[0]?.[0]).toBe("IP Number (10 Digits)");
    const ips = upload.slice(1).map((row) => row[0]);
    expect(ips.sort()).toEqual([OWNER_IP, PLAIN_IP]);
    for (const row of upload.slice(1))
      expect(row.slice(2, 5)).toEqual(["30", "18000", "0"]);
    const contributions = rowsOf(workbook.getWorksheet("Contributions"));
    const total = contributions.find((row) => row[0] === "Total");
    // 0.75% and 3.25% of ₹18,000 each.
    expect(total?.slice(2)).toEqual([60, 36000, 270, 1170, 1440]);
    expect(rowsOf(workbook.getWorksheet("Missing IP Number"))).toHaveLength(2);
  });

  it("takes a UAN added after approval from the member's salary configuration", async () => {
    const { owner, plain, structureId, configs, approveAll } = await company([
      "read",
    ]);
    await approveAll();
    const config = configs.items.find(
      (item) => item.memberId === plain.memberId,
    )?.config;
    const saved = await saveSalaries(
      jsonRequest(
        `${TEST_ORIGIN}/api/construction/hrms/employees/salary/save`,
        owner.cookie,
        {
          rows: [
            {
              memberId: plain.memberId,
              structureId,
              baseMonthly: null,
              componentOverrides: null,
              gender: null,
              uan: "100200300403",
              esiIpNumber: PLAIN_IP,
              effectiveFrom: "2026-01-01",
              expectedUpdatedAt: config?.updatedAt ?? null,
            },
          ],
        },
      ),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    const response = await pf(owner.cookie, `month=${MONTH}`);
    expect(response.headers.get("x-ecr-missing-uan")).toBe("0");
    expect(await response.text()).toContain("100200300403#~#");
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    expect(document.paths).toHaveProperty([
      "/api/construction/hrms/salaries/exports/pf",
    ]);
    expect(document.paths).toHaveProperty([
      "/api/construction/hrms/salaries/exports/esi",
    ]);
  });
});
