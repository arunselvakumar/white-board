import { prisma } from "@repo/construction-db";
import ExcelJS from "exceljs";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as downloadReport } from "@/app/api/construction/reporting/reports/[id]/download/route";
import type { ConstructionReportingReportJobResponseModel as Job } from "@/app/api/construction/reporting/reports/report-models";
import { POST as requestReport } from "@/app/api/construction/reporting/reports/route";
import { GET as catalogue } from "@/app/api/construction/reporting/catalogue/route";
import { GET as filterOptions } from "@/app/api/construction/reporting/filter-options/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, newCompany } from "@/test/companies";
import { bytesOf } from "@/test/files";
import { salesBookingRow, salesProject, salesWing } from "@/test/sales";
import { TEST_ORIGIN } from "@/test/sessions";
import { sharedAssign } from "@/test/site-work";

import { GET as listBookings, POST as createBooking } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const REPORTS = `${TEST_ORIGIN}/api/construction/reporting/reports`;
const BOOKINGS = `${TEST_ORIGIN}/api/construction/sales/bookings`;
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
  const projectId = await salesProject(ws, by, "Green Acres");
  const wing = await salesWing(ws, projectId, by, {
    name: "Tower A",
    floors: 2,
    perFloor: 2,
  });
  actAs(owner);
  const book = async (unit: string, body: Record<string, unknown>) => {
    const response = await createBooking(
      post(BOOKINGS, {
        projectId,
        unitId: wing.units[unit],
        status: "booked",
        bookingDate: addDays(TODAY, -3),
        customerName: "Meena Raghavan",
        ...body,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
  };
  return { ws, by, owner, projectId, wing, book };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function generate(ctx: Ctx, params: Record<string, unknown>) {
  const response = await requestReport(
    post(REPORTS, {
      kind: "booking_report",
      projectId: ctx.projectId,
      params: { from: addDays(TODAY, -30), to: TODAY, ...params },
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const job = (await response.json()) as Job;
  expect(job.error).toBeNull();
  expect(job.status).toBe("done");
  return job;
}

/** The Bookings sheet's rows under its header, without the totals. */
async function bookingRows(job: Job): Promise<string[][]> {
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
  book.getWorksheet("Bookings")?.eachRow((row) => {
    rows.push(
      (row.values as unknown[])
        .slice(1)
        .map((value) =>
          typeof value === "string" || typeof value === "number"
            ? String(value)
            : "",
        ),
    );
  });
  const header = rows.findIndex((row) => row[0] === "Booking Date");
  expect(rows[header]).toEqual([
    "Booking Date",
    "Customer",
    "Wing",
    "Unit",
    "Unit type",
    "Carpet area",
    "Status",
    "Referred By",
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
    await listBookings(
      new Request(`${BOOKINGS}?projectId=${ctx.projectId}${query}`),
    )
  ).json()) as { items: { customerName: string }[] };
  return page.items.map((item) => item.customerName).sort();
}

describe("Booking Report (CM-1008, CM-0022 §11)", () => {
  it("prints the period's bookings with the ADR's columns, equal to the list", async () => {
    const ctx = await setup();
    await prisma.constructionSalesUnitProfile.create({
      data: {
        unitId: ctx.wing.units["101"] ?? "",
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        wingId: ctx.wing.wingId,
        unitType: "2BHK",
        carpetArea: "1050.50",
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    await ctx.book("101", {
      referredByName: "Suresh",
      referredByContact: "9876543211",
      remarks: "Corner unit",
    });
    await ctx.book("102", {
      status: "on_hold",
      customerName: "Ravi Kumar",
      holdUntil: addDays(TODAY, 4),
    });
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.wing.units["201"] ?? "",
      ctx.by,
      {
        status: "on_hold",
        customerName: "Kavya S",
        bookingDate: addDays(TODAY, -10),
        holdUntil: addDays(TODAY, -1),
      },
    );
    // Outside the period.
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.wing.units["202"] ?? "",
      ctx.by,
      { customerName: "Old Buyer", bookingDate: addDays(TODAY, -60) },
    );
    const rows = await bookingRows(await generate(ctx, {}));
    expect(rows.map((row) => [row[1], row[6]])).toEqual([
      ["Kavya S", "Hold expired"],
      ["Meena Raghavan", "Booked"],
      ["Ravi Kumar", "On Hold"],
    ]);
    expect(rows[1]?.slice(2)).toEqual([
      "Tower A",
      "101",
      "2BHK",
      "1,050.5 sq ft",
      "Booked",
      "Suresh · +919876543211",
      "Corner unit",
    ]);
    // The same bookings the list shows for the period's filters.
    expect((await listed(ctx)).filter((name) => name !== "Old Buyer")).toEqual(
      rows.map((row) => row[1]).sort(),
    );
    const expired = await bookingRows(
      await generate(ctx, { status: "hold_expired" }),
    );
    expect(expired.map((row) => row[1])).toEqual(
      await listed(ctx, "&status=hold_expired"),
    );
    const held = await bookingRows(await generate(ctx, { status: "on_hold" }));
    expect(held.map((row) => row[1])).toEqual(
      await listed(ctx, "&status=on_hold"),
    );
  });

  it("filters by Wing and offers the Project's Wings as choices", async () => {
    const ctx = await setup();
    await ctx.book("101", {});
    const other = crypto.randomUUID();
    const byWing = await bookingRows(
      await generate(ctx, { wingId: ctx.wing.wingId }),
    );
    expect(byWing).toHaveLength(1);
    expect(await bookingRows(await generate(ctx, { wingId: other }))).toEqual(
      [],
    );
    const options = (await (
      await filterOptions(
        new Request(
          `${TEST_ORIGIN}/api/construction/reporting/filter-options?scope=project&projectId=${ctx.projectId}`,
        ),
      )
    ).json()) as { wings: { id: string; name: string }[] };
    expect(options.wings).toEqual([{ id: ctx.wing.wingId, name: "Tower A" }]);
  });

  it("needs Booking Report and is in the Sales group with the Inquiry Report", async () => {
    const ctx = await setup();
    const added = await addMember(ctx.ws, ctx.by, {
      "sales.bookings": ["read"],
    });
    await sharedAssign(added.memberId, ctx.projectId);
    actAs({ userId: added.userId, workspaceId: ctx.ws, role: "member" });
    const refused = await requestReport(
      post(REPORTS, {
        kind: "booking_report",
        projectId: ctx.projectId,
        params: { from: TODAY, to: TODAY },
      }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    const items = (
      (await (
        await catalogue(
          new Request(
            `${TEST_ORIGIN}/api/construction/reporting/catalogue?scope=project&projectId=${ctx.projectId}`,
          ),
        )
      ).json()) as { items: { kind: string; group: string }[] }
    ).items;
    expect(items.find((item) => item.kind === "booking_report")?.group).toBe(
      "sales",
    );
    expect(items.find((item) => item.kind === "inquiry_report")?.group).toBe(
      "sales",
    );
  });
});
