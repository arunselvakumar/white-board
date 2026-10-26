import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, newCompany } from "@/test/companies";
import { salesLists, salesProject, salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { GET as sample } from "./import-sample/route";
import { POST as importInquiries } from "./import/route";
import { POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/inquiries";
const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TODAY = todayIn("Asia/Kolkata");

const HEADERS = [
  "Inquiry Date",
  "Name*",
  "Mobile",
  "Email",
  "Address",
  "Occupation",
  "Interest Type",
  "Interested In Wing",
  "Unit type",
  "Lead Source",
  "Funnel Stage",
  "Assignee",
  "Next follow-up",
  "Remarks",
];

type ErrorBody = {
  code: string;
  details?: { errors?: { row: number; field: string; message: string }[] };
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function workbook(rows: unknown[][], headers = HEADERS) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Inquiries");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

/** A row by column name; the rest blank. */
function row(values: Partial<Record<(typeof HEADERS)[number], unknown>>) {
  return HEADERS.map((header) => values[header] ?? null);
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by);
  const lists = await salesLists(projectId);
  await salesWing(ws, projectId, by, { name: "A Wing" });
  const seller = await addMember(ws, by, {
    "sales.inquiries": ["read", "notification"],
  });
  await sharedAssign(seller.memberId, projectId);
  const sellerMobile =
    (
      await prisma.constructionOrganizationTeamMember.findUnique({
        where: { id: seller.memberId },
        select: { mobile: true },
      })
    )?.mobile ?? "";
  actAs(owner);
  return { ws, by, owner, projectId, lists, seller, sellerMobile };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

const upload = (ctx: Ctx, bytes: Uint8Array, query = "") =>
  importInquiries(
    new Request(`${BASE}/import?projectId=${ctx.projectId}${query}`, {
      method: "POST",
      headers: { "content-type": XLSX },
      body: Buffer.from(bytes),
    }),
  );

const inquiriesOf = (ctx: Ctx) =>
  prisma.constructionSalesInquiry.findMany({
    where: { projectId: ctx.projectId, deletedAt: null },
    orderBy: { name: "asc" },
  });

describe("Inquiry import (CM-1007, CM-0022 §9)", () => {
  it("adds every row with live names, the Assignee by name or mobile", async () => {
    const ctx = await setup();
    const response = await upload(
      ctx,
      await workbook([
        row({
          "Inquiry Date": addDays(TODAY, -1),
          "Name*": "Anand Kumar",
          Mobile: "98450 11111",
          Email: "anand@example.com",
          "Interest Type": "hot",
          "Interested In Wing": "a wing",
          "Unit type": "2BHK",
          "Lead Source": "walk-in",
          "Funnel Stage": "Site Visit",
          Assignee: "prabhu saravanan",
          "Next follow-up": `${addDays(TODAY, 2)} 10:30`,
          Remarks: "From the expo",
        }),
        row({
          "Name*": "Bhavana",
          Assignee: ctx.sellerMobile,
          "Interest Type": "Warm",
        }),
        row({ "Name*": "Chitra" }),
      ]),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await json<{ imported: number }>(response)).toEqual({ imported: 3 });
    const [anand, bhavana] = await inquiriesOf(ctx);
    expect(anand).toMatchObject({
      name: "Anand Kumar",
      mobile: "+919845011111",
      interestType: "hot",
      interestedUnitType: "2BHK",
      leadSourceId: ctx.lists.sourceId["Walk-in"],
      funnelStageId: ctx.lists.stageId["Site Visit"],
      assigneeMemberId: ctx.seller.memberId,
      nextFollowUpHasTime: true,
      remarks: "From the expo",
    });
    expect(anand?.inquiryDate.toISOString().slice(0, 10)).toBe(
      addDays(TODAY, -1),
    );
    expect(bhavana).toMatchObject({
      assigneeMemberId: ctx.seller.memberId,
      funnelStageId: ctx.lists.stageId["New"],
      interestType: "warm",
    });
    expect(bhavana?.inquiryDate.toISOString().slice(0, 10)).toBe(TODAY);
    const events = await prisma.constructionSalesInquiryEvent.findMany({
      where: { inquiryId: { in: [anand?.id ?? "", bhavana?.id ?? ""] } },
    });
    expect(events.map((event) => event.type)).toEqual(["created", "created"]);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { workspaceId: ctx.ws, action: "inquiry.imported" },
    });
    expect(audit).not.toBeNull();
    // One summary for the seller's two rows; the importer's own row
    // (Chitra) tells no one.
    const notices = await prisma.constructionMessagingNotification.findMany({
      where: { workspaceId: ctx.ws, type: "inquiry.assigned" },
    });
    expect(notices).toMatchObject([
      {
        recipientUserId: ctx.seller.userId,
        title: "2 imported inquiries were assigned to you",
        link: { href: `/app/projects/${ctx.projectId}/inquiries/list` },
      },
    ]);
  });

  it("saves nothing when any row is wrong, and says which", async () => {
    const ctx = await setup();
    await prisma.constructionSalesLeadSource.update({
      where: { id: ctx.lists.sourceId["Hoarding"] ?? "" },
      data: { isActive: false },
    });
    const response = await upload(
      ctx,
      await workbook([
        row({ "Name*": "Fine" }),
        row({ "Name*": "", Mobile: "9845022222" }),
        row({ "Name*": "Bad mobile", Mobile: "12345" }),
        row({ "Name*": "Bad source", "Lead Source": "Newspaper" }),
        row({ "Name*": "Disabled source", "Lead Source": "Hoarding" }),
        row({ "Name*": "Bad stage", "Funnel Stage": "Booked" }),
        row({ "Name*": "Bad wing", "Interested In Wing": "Z Wing" }),
        row({ "Name*": "Nobody", Assignee: "Somebody Else" }),
        row({ "Name*": "Future", "Inquiry Date": addDays(TODAY, 3) }),
        row({ "Name*": "Bad date", "Inquiry Date": "31-31-2026" }),
        row({ "Name*": "Bad interest", "Interest Type": "Lukewarm" }),
      ]),
    );
    expect(response.status).toBe(StatusCodes.BAD_REQUEST);
    const body = await json<ErrorBody>(response);
    expect(body.code).toBe("IMPORT_HAS_ERRORS");
    expect(
      body.details?.errors?.map((error) => [error.row, error.field]),
    ).toEqual([
      [3, "Name*"],
      [4, "Mobile"],
      [5, "Lead Source"],
      [6, "Lead Source"],
      [7, "Funnel Stage"],
      [8, "Interested In Wing"],
      [9, "Assignee"],
      [10, "Inquiry Date"],
      [11, "Inquiry Date"],
      [12, "Interest Type"],
    ]);
    expect(await inquiriesOf(ctx)).toEqual([]);
  });

  it("treats duplicates as errors unless Import duplicates too", async () => {
    const ctx = await setup();
    await create(
      new Request(BASE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: ctx.projectId,
          name: "Existing",
          mobile: "9845033333",
        }),
      }),
    );
    const bytes = await workbook([
      row({ "Name*": "Same mobile", Mobile: "+91 98450 33333" }),
      row({ "Name*": "First", Email: "twin@example.com" }),
      row({ "Name*": "Second", Email: "TWIN@example.com" }),
    ]);
    const refused = await json<ErrorBody>(await upload(ctx, bytes));
    expect(refused.details?.errors).toMatchObject([
      { row: 2, field: "Mobile" },
      { row: 4, field: "Email", message: "Row 3 has the same email." },
    ]);
    const allowed = await upload(ctx, bytes, "&allowDuplicates=true");
    expect(await json<{ imported: number }>(allowed)).toEqual({ imported: 3 });
  });

  it("applies the back-dated window per row, and refuses empty or bad files", async () => {
    const ctx = await setup();
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideRoleIds: [],
        editDays: 0,
        editOverrideRoleIds: [],
        modules: {
          inquiry: {
            mode: "custom",
            create: { days: 3, overrideRoleIds: [] },
            edit: { days: 3, overrideRoleIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const importer = await addMember(ctx.ws, ctx.by, {
      "sales.inquiries": ["read", "create"],
    });
    await sharedAssign(importer.memberId, ctx.projectId);
    actAs({ userId: importer.userId, workspaceId: ctx.ws, role: "member" });
    const old = await json<ErrorBody>(
      await upload(
        ctx,
        await workbook([
          row({ "Name*": "Recent", "Inquiry Date": addDays(TODAY, -1) }),
          row({ "Name*": "Old", "Inquiry Date": addDays(TODAY, -10) }),
        ]),
      ),
    );
    expect(old.details?.errors).toMatchObject([
      { row: 3, field: "Inquiry Date" },
    ]);
    const empty = await upload(ctx, await workbook([]));
    expect((await json<ErrorBody>(empty)).code).toBe("IMPORT_EMPTY");
    const noHeaders = await upload(ctx, await workbook([["x"]], ["Something"]));
    expect((await json<ErrorBody>(noHeaders)).code).toBe("IMPORT_FILE_INVALID");
    const notExcel = await upload(ctx, new TextEncoder().encode("name\nAnand"));
    expect((await json<ErrorBody>(notExcel)).code).toBe("IMPORT_FILE_INVALID");
    const tooMany = await upload(
      ctx,
      await workbook(
        Array.from({ length: 1001 }, (_, at) =>
          row({ "Name*": `Lead ${String(at)}` }),
        ),
      ),
    );
    expect((await json<ErrorBody>(tooMany)).code).toBe("IMPORT_TOO_MANY");
  });

  it("needs Inquiry Create; the sample lists the Project's names", async () => {
    const ctx = await setup();
    const reader = await addMember(ctx.ws, ctx.by, {
      "sales.inquiries": ["read", "update"] satisfies Flag[],
    });
    await sharedAssign(reader.memberId, ctx.projectId);
    actAs({ userId: reader.userId, workspaceId: ctx.ws, role: "member" });
    const refused = await upload(ctx, await workbook([row({ "Name*": "X" })]));
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    const file = await sample(
      new Request(`${BASE}/import-sample?projectId=${ctx.projectId}`),
    );
    expect(file.status).toBe(StatusCodes.OK);
    expect(file.headers.get("content-type")).toBe(XLSX);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await file.arrayBuffer());
    const headers: unknown[] = [];
    book
      .getWorksheet("Inquiries")
      ?.getRow(1)
      .eachCell((cell) => headers.push(cell.value));
    expect(headers).toEqual(HEADERS);
    const lists = book.getWorksheet("Lists");
    expect(lists?.getRow(2).getCell(1).value).toBe("Hoarding");
    expect(lists?.getRow(2).getCell(2).value).toBe("New");
    expect(lists?.getRow(2).getCell(3).value).toBe("A Wing");
  });
});
