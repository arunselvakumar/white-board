import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as downloadReport } from "@/app/api/construction/reporting/reports/[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "@/app/api/construction/reporting/reports/report-models";
import { POST as requestReport } from "@/app/api/construction/reporting/reports/route";
import { GET as filterOptions } from "@/app/api/construction/reporting/filter-options/route";
import { GET as listInquiries } from "@/app/api/construction/sales/inquiries/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { salesInquiryFull, salesLists, salesProject } from "@/test/sales";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const INQUIRIES = `${TEST_ORIGIN}/api/construction/sales/inquiries`;
const TODAY = todayIn("Asia/Kolkata");

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by, "Green Meadows");
  const lists = await salesLists(projectId);
  const seller = await addMember(ws, by, {
    "sales.inquiries": ["read", "report"],
  });
  await sharedAssign(seller.memberId, projectId);
  const sellerActor = {
    userId: seller.userId,
    workspaceId: ws,
    role: "member" as const,
  };
  const add = (fields: Parameters<typeof salesInquiryFull>[3]) =>
    salesInquiryFull(ws, projectId, by, fields);
  await add({
    name: "Asha Rao",
    interestType: "hot",
    leadSourceId: lists.sourceId["Walk-in"],
    funnelStageId: lists.stageId["Site Visit"],
    assigneeMemberId: seller.memberId,
    interestedUnitType: "2BHK",
    mobile: "+919876543210",
    remarks: "Wants east facing",
  });
  await add({
    name: "Bala Kumar",
    interestType: "warm",
    leadSourceId: lists.sourceId["Referral"],
    funnelStageId: lists.stageId["New"],
    leadOwnerMemberId: seller.memberId,
  });
  await add({
    name: "Chitra Devi",
    status: "lost",
    leadSourceId: lists.sourceId["Walk-in"],
    funnelStageId: lists.stageId["Contacted"],
    lostReasonId: lists.reasonId["Budget"],
  });
  await add({
    name: "Dinesh Old",
    inquiryDate: addDays(TODAY, -90),
  });
  actAs(owner);
  return { ws, by, owner, projectId, lists, seller, sellerActor };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function generate(params: Record<string, unknown>, projectId: string) {
  const response = await requestReport(
    post(REPORTS, {
      kind: "inquiry_report",
      projectId,
      params: { from: addDays(TODAY, -30), to: TODAY, ...params },
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = (await response.json()) as Job;
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

async function inquiryRows(job: Job): Promise<string[][]> {
  const response = await downloadReport(
    new Request(`${REPORTS}/${job.id}/download?format=xlsx`),
    { params: Promise.resolve({ id: job.id }) },
  );
  expect(response.status).toBe(StatusCodes.OK);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.from(await bytesOf(response)) as unknown as ExcelJS.Buffer,
  );
  const rows: string[][] = [];
  book.getWorksheet("Inquiries")?.eachRow((row) => {
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
  const header = rows.findIndex((row) => row[0] === "Inquiry Date");
  expect(rows[header]).toEqual([
    "Inquiry Date",
    "Name",
    "Mobile",
    "Interest Type",
    "Interested In",
    "Lead Source",
    "Stage",
    "Status",
    "Next follow-up",
    "Assignee",
    "Lead Owner",
    "Lost Reason",
    "Remarks",
  ]);
  const body = rows.slice(header + 1);
  return body.slice(
    0,
    body.findIndex((row) => row[0] === "Total"),
  );
}

async function listed(ctx: Ctx, query = ""): Promise<string[]> {
  const page = (await (
    await listInquiries(
      new Request(`${INQUIRIES}?projectId=${ctx.projectId}&limit=100${query}`),
    )
  ).json()) as { items: { name: string }[] };
  return page.items
    .map((item) => item.name)
    .filter((name) => name !== "Dinesh Old")
    .sort();
}

const names = (rows: string[][]) => rows.map((row) => row[1] ?? "").sort();

describe("Inquiry Report (CM-1008, CM-0022 §11)", () => {
  it("prints the period's inquiries with the ADR's columns, equal to the list", async () => {
    const ctx = await setup();
    const rows = await inquiryRows(await generate({}, ctx.projectId));
    expect(names(rows)).toEqual(await listed(ctx));
    const asha = rows.find((row) => row[1] === "Asha Rao");
    expect(asha?.slice(2)).toEqual([
      "+919876543210",
      "Hot",
      "2BHK",
      "Walk-in",
      "Site Visit",
      "Open",
      "",
      "Prabhu Saravanan",
      "",
      "",
      "Wants east facing",
    ]);
    expect(rows.find((row) => row[1] === "Chitra Devi")?.[11]).toBe("Budget");
  });

  it("filters like the list: status, stage, interest, source, assignee and lost reason", async () => {
    const ctx = await setup();
    const { lists } = ctx;
    const cases: [Record<string, unknown>, string][] = [
      [{ status: "lost" }, "&status=lost"],
      [
        { funnelStageId: lists.stageId["New"] },
        `&funnelStageId=${lists.stageId["New"] ?? ""}`,
      ],
      [{ interestType: "hot" }, "&interestType=hot"],
      [
        { leadSourceId: lists.sourceId["Walk-in"] },
        `&leadSourceId=${lists.sourceId["Walk-in"] ?? ""}`,
      ],
      [
        { assigneeMemberId: ctx.seller.memberId },
        `&assigneeMemberId=${ctx.seller.memberId}`,
      ],
    ];
    for (const [params, query] of cases)
      expect(
        names(await inquiryRows(await generate(params, ctx.projectId))),
      ).toEqual(await listed(ctx, query));
    expect(
      names(
        await inquiryRows(
          await generate(
            { lostReasonId: lists.reasonId["Budget"] },
            ctx.projectId,
          ),
        ),
      ),
    ).toEqual(["Chitra Devi"]);
    const options = (await (
      await filterOptions(
        new Request(
          `${TEST_ORIGIN}/api/construction/reporting/filter-options?scope=project&projectId=${ctx.projectId}`,
        ),
      )
    ).json()) as {
      funnelStages: { name: string }[];
      leadSources: { name: string }[];
      lostReasons: { name: string }[];
      assignees: { name: string }[];
    };
    expect(options.funnelStages.map((item) => item.name)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    expect(options.leadSources).toHaveLength(6);
    expect(options.lostReasons).toHaveLength(5);
    expect(options.assignees.map((item) => item.name)).toContain(
      "Prabhu Saravanan",
    );
  });

  it("without View all covers the requester's created, assigned and Lead Owner inquiries, as the list does", async () => {
    const ctx = await setup();
    actAs(ctx.sellerActor);
    const rows = await inquiryRows(await generate({}, ctx.projectId));
    expect(names(rows)).toEqual(["Asha Rao", "Bala Kumar"]);
    expect(names(rows)).toEqual(await listed(ctx));
    const job = await prisma.constructionReportingReportJob.findFirst({
      where: { workspaceId: ctx.ws, kind: "inquiry_report" },
      orderBy: { createdAt: "desc" },
    });
    expect(job?.params).toMatchObject({
      own: { userId: ctx.seller.userId, memberId: ctx.seller.memberId },
    });
    // Without Report on Inquiry: refused.
    const reader = await addMember(ctx.ws, ctx.by, {
      "sales.inquiries": ["read"],
    });
    await sharedAssign(reader.memberId, ctx.projectId);
    actAs({ userId: reader.userId, workspaceId: ctx.ws, role: "member" });
    const refused = await requestReport(
      post(REPORTS, {
        kind: "inquiry_report",
        projectId: ctx.projectId,
        params: { from: TODAY, to: TODAY },
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
  });
});
