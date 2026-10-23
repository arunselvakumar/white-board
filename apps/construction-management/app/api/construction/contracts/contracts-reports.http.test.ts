import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as catalogueRoute } from "@/app/api/construction/reporting/catalogue/route";
import { GET as downloadReport } from "@/app/api/construction/reporting/reports/[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "@/app/api/construction/reporting/reports/report-models";
import { POST as requestReport } from "@/app/api/construction/reporting/reports/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember } from "@/test/companies";
import { contractsBilledBothWays } from "@/test/contracts-billing";
import { bytesOf } from "@/test/files";
import { TODAY } from "@/test/party-finance";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const day = (offset: number) => addDays(TODAY, offset);
const RANGE = { from: day(-60), to: TODAY };

type Ctx = Awaited<ReturnType<typeof contractsBilledBothWays>>;

function ask(kind: string, projectId: string, params: unknown) {
  return requestReport(
    new Request(REPORTS, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, projectId, params }),
    }),
  );
}

async function generate(
  kind: string,
  projectId: string,
  params: unknown,
): Promise<Job> {
  const response = await ask(kind, projectId, params);
  expect(response.status, await response.clone().text()).toBe(
    StatusCodes.CREATED,
  );
  const job = (await response.json()) as Job;
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  expect(job.downloads.pdf).not.toBeNull();
  return job;
}

/** Each sheet's rows from the header row on, as text. */
async function sheets(job: Job): Promise<Record<string, string[][]>> {
  const response = await downloadReport(
    new Request(`${REPORTS}/${job.id}/download?format=xlsx`),
    { params: Promise.resolve({ id: job.id }) },
  );
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.from(await bytesOf(response)) as unknown as ExcelJS.Buffer,
  );
  const out: Record<string, string[][]> = {};
  book.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      rows.push(
        Array.from(row.values as unknown[])
          .slice(1)
          .map((value) =>
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : "",
          ),
      );
    });
    out[sheet.name] = rows;
  });
  return out;
}

async function withVariation(ctx: Ctx) {
  const item = await prisma.constructionContractsBoqItem.findFirstOrThrow({
    where: { projectId: ctx.projectId, itemNo: "1.2" },
  });
  await prisma.constructionContractsVariation.create({
    data: {
      id: randomUUID(),
      workspaceId: ctx.ws,
      projectId: ctx.projectId,
      number: "VAR-001",
      kind: "quantity",
      status: "pending_approval",
      boqItemId: item.id,
      previousQuantity: "10",
      newQuantity: "14",
      reason: "Deeper footings",
      createdBy: ctx.by,
      updatedBy: ctx.by,
    },
  });
}

/** A sheet's header row and the rows under it (the Company header block dropped). */
function table(book: Record<string, string[][]>, name: string, first: string) {
  const rows = book[name] ?? [];
  const at = rows.findIndex((row) => row[0] === first);
  expect(at, `${name}: no header`).toBeGreaterThanOrEqual(0);
  return rows.slice(at);
}

async function member(ctx: Ctx, permissions: Record<string, readonly Flag[]>) {
  const added = await addMember(ctx.ws, ctx.by, permissions);
  await sharedAssign(added.memberId, ctx.projectId);
  actAs({ userId: added.userId, workspaceId: ctx.ws, role: "member" });
}

describe("Contracts reports (CM-1111)", () => {
  it("lays out each register from the Project's contracts, Excel and PDF", async () => {
    const ctx = await contractsBilledBothWays();
    await withVariation(ctx);
    const run = async (kind: string, params: unknown) =>
      sheets(await generate(kind, ctx.projectId, params));

    const boq = table(
      await run("boq_vs_executed", { asOn: TODAY }),
      "BOQ vs executed",
      "Section",
    );
    expect(boq.slice(1)).toEqual([
      [
        "Civil works",
        "1.1",
        "Item 1.1",
        "cum",
        "100",
        "40",
        "30",
        "60",
        "40",
        "450",
        "45000",
        "18000",
        "13500",
      ],
      [
        "Civil works",
        "1.2",
        "Item 1.2",
        "cum",
        "10",
        "0",
        "0",
        "10",
        "0",
        "1000",
        "10000",
        "0",
        "0",
      ],
      [
        "Total",
        "",
        "2 items",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "55000",
        "18000",
        "13500",
      ],
    ]);
    // As on before the second measurement: 30 executed.
    const earlier = table(
      await run("boq_vs_executed", { asOn: day(-7) }),
      "BOQ vs executed",
      "Section",
    );
    expect(earlier[1]?.slice(4, 7)).toEqual(["100", "30", "30"]);

    const orders = table(
      await run("work_order_register", RANGE),
      "Work Orders",
      "WO No.",
    );
    expect(orders[0]).toEqual([
      "WO No.",
      "Order Date",
      "Contractor",
      "Department",
      "Status",
      "Revision",
      "Retention %",
      "Value",
      "Billed to Date",
      "Balance",
    ]);
    expect(orders[1]?.slice(2)).toEqual([
      "Velan Constructions",
      "Civil",
      "Issued",
      "0",
      "5",
      "35000",
      "10000",
      "25000",
    ]);
    expect(orders[2]?.slice(0, 1)).toEqual(["Draft"]);
    expect(orders.at(-1)?.slice(0, 2)).toEqual(["Total", "2 Work Orders"]);

    const contractorBills = await run("contractor_bill_register", RANGE);
    expect(table(contractorBills, "Bills", "Bill No.")[1]?.slice(4)).toEqual([
      "Velan Constructions",
      "WO/26-27/00001",
      "Approved",
      "10000",
      "1800",
      "3830",
      "7970",
    ]);
    expect(table(contractorBills, "By status", "Status").slice(1)).toEqual([
      ["Approved", "1", "10000", "7970"],
      ["Total", "1", "10000", "7970"],
    ]);

    const clientBills = table(
      await run("client_bill_register", RANGE),
      "Bills",
      "Bill No.",
    );
    expect(clientBills.slice(1).map((row) => row.slice(4))).toEqual([
      ["Tamil Nadu Housing Board", "Approved", "13500", "2430", "675", "15255"],
      [
        "Tamil Nadu Housing Board",
        "Pending approval",
        "4500",
        "810",
        "225",
        "5085",
      ],
      ["", "", "18000", "3240", "900", "20340"],
    ]);

    const deductions = await run("deductions_register", RANGE);
    expect(
      table(deductions, "Deductions", "Bill Date")
        .slice(1)
        .map((row) => row.slice(4)),
    ).toEqual([
      ["Retention", "", "500"],
      [
        "Material reconciliation recovery",
        "Cement OPC 53 (site issue)",
        "3330",
      ],
      ["", "", "3830"],
    ]);
    expect(table(deductions, "By kind", "Deduction").at(-1)).toEqual([
      "Total",
      "2",
      "3830",
    ]);

    const retention = await run("retention_register", { asOn: TODAY });
    expect(
      table(retention, "Held from Contractors", "Contract").slice(1),
    ).toEqual([
      ["WO/26-27/00001", "Velan Constructions", "5", "500", "0", "500"],
      ["Total", "", "", "500", "0", "500"],
    ]);
    expect(table(retention, "Held by the Client", "Contract")[1]).toEqual([
      "Client contract",
      "Tamil Nadu Housing Board",
      "5",
      "675",
      "0",
      "675",
    ]);

    // The Work Order's statement: 50 cum × 6.34 = 317 bags, 2 % allowed.
    expect(
      table(
        await run("material_reconciliation", { asOn: TODAY }),
        "Reconciliation",
        "WO No.",
      )[1],
    ).toEqual([
      "WO/26-27/00001",
      "Velan Constructions",
      "Cement OPC 53 (site issue)",
      "Bag",
      "Free issue",
      "317",
      "2",
      "323.34",
      "330",
      "6.66",
      "",
      "500",
      "3330",
      "3330",
      "0",
    ]);

    expect(
      table(
        await run("variations_register", RANGE),
        "Variations",
        "Variation No.",
      )[1],
    ).toEqual([
      "VAR-001",
      expect.any(String),
      "Change of quantity",
      "Pending approval",
      "1.2",
      "Item 1.2",
      "cum",
      "10",
      "14",
      "",
      "",
      "4000",
      "Deeper footings",
    ]);
  });

  it("follows each menu: amounts with Financial, money registers refused without it, the client side of retention with Client Bills Financial", async () => {
    const ctx = await contractsBilledBothWays();
    await member(ctx, {
      "projects.project": ["read"],
      "contracts.contractor_bills": ["read", "report"],
    });
    const bills = table(
      await sheets(
        await generate("contractor_bill_register", ctx.projectId, RANGE),
      ),
      "Bills",
      "Bill No.",
    );
    expect(bills[0]).toEqual([
      "Bill No.",
      "RA No.",
      "Type",
      "Bill Date",
      "Contractor",
      "WO No.",
      "Status",
    ]);
    for (const kind of ["deductions_register", "retention_register"]) {
      const refused = await ask(
        kind,
        ctx.projectId,
        kind === "retention_register" ? { asOn: TODAY } : RANGE,
      );
      expect(refused.status, kind).toBe(StatusCodes.FORBIDDEN);
    }
    const client = await ask("client_bill_register", ctx.projectId, RANGE);
    expect(client.status).toBe(StatusCodes.FORBIDDEN);

    await member(ctx, {
      "projects.project": ["read"],
      "contracts.contractor_bills": ["read", "report", "financial"],
    });
    const job = await generate("retention_register", ctx.projectId, {
      asOn: TODAY,
    });
    expect(job.includesMoney).toBe(true);
    const book = await sheets(job);
    expect(Object.keys(book)).toEqual(["Held from Contractors"]);
    expect(JSON.stringify(book)).toContain(
      "The client side is left out (it needs Client Bills Financial).",
    );
  });

  it("is in the catalogue's Contracts group for those who may request it", async () => {
    const ctx = await contractsBilledBothWays();
    const response = await catalogueRoute(
      new Request(
        `${TEST_ORIGIN}/api/construction/reporting/catalogue?scope=project&projectId=${ctx.projectId}`,
      ),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const catalogue = (await response.json()) as {
      items: { kind: string; group: string; includesMoney: boolean }[];
    };
    expect(
      catalogue.items
        .filter((item) => item.group === "contracts")
        .map((item) => item.kind),
    ).toEqual([
      "boq_vs_executed",
      "work_order_register",
      "contractor_bill_register",
      "client_bill_register",
      "deductions_register",
      "retention_register",
      "material_reconciliation",
      "variations_register",
    ]);
  });
});
