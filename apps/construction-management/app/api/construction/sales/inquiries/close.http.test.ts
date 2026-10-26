import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, newCompany } from "@/test/companies";
import {
  salesBookingRow,
  salesLists,
  salesProject,
  salesWing,
} from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as cancelBooking } from "../bookings/[id]/cancel/route";
import { GET as listBookings } from "../bookings/route";
import { POST as convert } from "./[id]/convert/route";
import { POST as lose } from "./[id]/lose/route";
import { POST as reopen } from "./[id]/reopen/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/inquiries";
const TODAY = todayIn("Asia/Kolkata");

type Named = { id: string; name: string | null } | null;
type Inquiry = {
  id: string;
  name: string;
  status: string;
  funnelStage: Named;
  convertedUnitId: string | null;
  convertedBookingId: string | null;
  convertedUnit: Named;
  lostReason: Named;
  lostRemarks: string | null;
  closedAt: string | null;
  updatedAt: string;
  actions: Record<string, boolean>;
  history: {
    type: string;
    details: Record<string, unknown> | null;
    names: Record<string, string | null>;
  }[];
};
type ErrorBody = { code: string; details?: Record<string, unknown> };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by);
  const lists = await salesLists(projectId);
  const wing = await salesWing(ws, projectId, by, { name: "A Wing" });
  actAs(owner);
  return { ws, by, owner, projectId, lists, wing };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function added(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await create(
    post("", {
      projectId: ctx.projectId,
      name: "Lakshmi Narayanan",
      mobile: "9845012345",
      email: "lakshmi@example.com",
      address: "12, Gandhi Road",
      funnelStageId: ctx.lists.stageId["Negotiation"],
      allowDuplicate: true,
      ...patch,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Inquiry>(response);
}

async function member(ctx: Ctx, flags: Record<string, Flag[]>) {
  const made = await addMember(ctx.ws, ctx.by, flags);
  await sharedAssign(made.memberId, ctx.projectId);
  return {
    memberId: made.memberId,
    actor: {
      userId: made.userId,
      workspaceId: ctx.ws,
      role: "member" as const,
    },
  };
}

const read = async (id: string) =>
  json<Inquiry>(await getOne(new Request(`${BASE}/${id}`), params(id)));

const converting = (
  inquiry: Inquiry,
  unitId: string,
  patch: Record<string, unknown> = {},
) =>
  convert(
    post(`/${inquiry.id}/convert`, {
      unitId,
      expectedUpdatedAt: inquiry.updatedAt,
      ...patch,
    }),
    params(inquiry.id),
  );

describe("Close as Converted (CM-1007)", () => {
  it("books the unit in the same save and links both ways", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    const unitId = ctx.wing.units["101"] ?? "";
    const response = await converting(inquiry, unitId);
    expect(response.status).toBe(StatusCodes.OK);
    const closed = await json<Inquiry>(response);
    expect(closed).toMatchObject({
      status: "converted",
      convertedUnitId: unitId,
      convertedUnit: { id: unitId, name: "A Wing 101" },
      funnelStage: { name: "Negotiation" },
      actions: { reopen: true, close: false, convert: false, followUp: false },
    });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.history.at(-1)).toMatchObject({
      type: "converted",
      details: { unitId, bookingId: closed.convertedBookingId },
      names: { unitId: "A Wing 101" },
    });
    const booking = await prisma.constructionSalesBooking.findUnique({
      where: { id: closed.convertedBookingId ?? "" },
    });
    expect(booking).toMatchObject({
      status: "booked",
      unitId,
      inquiryId: inquiry.id,
      customerName: "Lakshmi Narayanan",
      customerMobile: "+919845012345",
      customerEmail: "lakshmi@example.com",
      customerAddress: "12, Gandhi Road",
    });
    const page = await json<{
      items: { id: string; inquiry: { id: string; name: string } | null }[];
    }>(
      await listBookings(
        new Request(
          `http://localhost/api/construction/sales/bookings?projectId=${ctx.projectId}`,
        ),
      ),
    );
    expect(page.items.find((item) => item.id === booking?.id)).toMatchObject({
      inquiry: { id: inquiry.id, name: "Lakshmi Narayanan" },
    });
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: inquiry.id, action: "inquiry.converted" },
    });
    expect(audit).not.toBeNull();
  });

  it("needs Inquiry Update and Booking Create", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    const unitId = ctx.wing.units["101"] ?? "";
    const seller = await member(ctx, {
      "sales.inquiries": ["read", "update", "view_all"],
    });
    actAs(seller.actor);
    expect((await read(inquiry.id)).actions).toMatchObject({
      convert: false,
      close: true,
    });
    expect((await converting(inquiry, unitId)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const both = await member(ctx, {
      "sales.inquiries": ["read", "update", "view_all"],
      "sales.bookings": ["create"],
    });
    actAs(both.actor);
    expect((await converting(inquiry, unitId)).status).toBe(StatusCodes.OK);
  });

  it("refuses a unit taken, unavailable or not of the Project, and a stale save", async () => {
    const ctx = await setup();
    const first = await added(ctx);
    const second = await added(ctx, { name: "Ravi Kumar" });
    const unitId = ctx.wing.units["101"] ?? "";
    // Two inquiries at the same unit at once: one wins.
    const results = await Promise.all([
      converting(first, unitId),
      converting(second, unitId),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      StatusCodes.OK,
      StatusCodes.CONFLICT,
    ]);
    const loser = results.find((result) => !result.ok);
    expect((await json<ErrorBody>(loser ?? new Response())).code).toBe(
      "UNIT_BOOKED",
    );
    const open = [await read(first.id), await read(second.id)].find(
      (inquiry) => inquiry.status === "open",
    );
    if (open == null) throw new Error("one is still open");
    const again = await converting(open, unitId);
    expect((await json<ErrorBody>(again)).code).toBe("UNIT_BOOKED");
    expect(
      await prisma.constructionSalesBooking.count({ where: { unitId } }),
    ).toBe(1);

    const unavailable = ctx.wing.units["102"] ?? "";
    await prisma.constructionSalesUnitProfile.create({
      data: {
        unitId: unavailable,
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        wingId: ctx.wing.wingId,
        unavailable: true,
        unavailableReason: "reserved",
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    expect(
      (await json<ErrorBody>(await converting(open, unavailable))).code,
    ).toBe("UNIT_UNAVAILABLE");
    expect((await json<ErrorBody>(await converting(open, newId()))).code).toBe(
      "UNIT_NOT_FOUND",
    );
    const future = await converting(open, ctx.wing.units["G01"] ?? "", {
      bookingDate: addDays(TODAY, 1),
    });
    expect(future.status).toBe(StatusCodes.BAD_REQUEST);
    const stale = await converting(open, ctx.wing.units["G01"] ?? "", {
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect((await json<ErrorBody>(stale)).code).toBe("INQUIRY_CHANGED");
    // A hold past its Hold until date does not block: it is cancelled.
    const held = ctx.wing.units["G02"] ?? "";
    const holdId = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      held,
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -10),
        holdUntil: addDays(TODAY, -2),
      },
    );
    expect((await converting(open, held)).status).toBe(StatusCodes.OK);
    const hold = await prisma.constructionSalesBooking.findUnique({
      where: { id: holdId },
    });
    expect(hold?.status).toBe("cancelled");
  });

  it("keeps the back-dated booking window", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideRoleIds: [],
        editDays: 0,
        editOverrideRoleIds: [],
        modules: {
          booking: {
            mode: "custom",
            create: { days: 2, overrideRoleIds: [] },
            edit: { days: 2, overrideRoleIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const seller = await member(ctx, {
      "sales.inquiries": ["read", "update", "view_all"],
      "sales.bookings": ["create"],
    });
    actAs(seller.actor);
    const old = await converting(inquiry, ctx.wing.units["101"] ?? "", {
      bookingDate: addDays(TODAY, -5),
    });
    expect((await json<ErrorBody>(old)).code).toBe("BACKDATED_CREATE_BLOCKED");
  });
});

describe("Close as Lost and Reopen (CM-1007)", () => {
  it("closes as Lost with a live reason, then reopens at the stage it had", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    const budget = ctx.lists.reasonId["Budget"] ?? "";
    const otherProject = await salesProject(ctx.ws, ctx.by);
    const other = await salesLists(otherProject);
    const wrong = await lose(
      post(`/${inquiry.id}/lose`, {
        lostReasonId: other.reasonId["Budget"],
        expectedUpdatedAt: inquiry.updatedAt,
      }),
      params(inquiry.id),
    );
    expect((await json<ErrorBody>(wrong)).code).toBe("LOST_REASON_NOT_FOUND");
    const location = ctx.lists.reasonId["Location"] ?? "";
    await prisma.constructionSalesLostReason.update({
      where: { id: location },
      data: { isActive: false },
    });
    const disabled = await lose(
      post(`/${inquiry.id}/lose`, {
        lostReasonId: location,
        expectedUpdatedAt: inquiry.updatedAt,
      }),
      params(inquiry.id),
    );
    expect((await json<ErrorBody>(disabled)).code).toBe("LOST_REASON_DISABLED");
    const lost = await json<Inquiry>(
      await lose(
        post(`/${inquiry.id}/lose`, {
          lostReasonId: budget,
          remarks: " Wants under 40 lakhs ",
          expectedUpdatedAt: inquiry.updatedAt,
        }),
        params(inquiry.id),
      ),
    );
    expect(lost).toMatchObject({
      status: "lost",
      lostReason: { id: budget, name: "Budget" },
      lostRemarks: "Wants under 40 lakhs",
    });
    expect(lost.history.at(-1)).toMatchObject({
      type: "lost",
      names: { lostReasonId: "Budget" },
    });
    const twice = await lose(
      post(`/${inquiry.id}/lose`, {
        lostReasonId: budget,
        expectedUpdatedAt: lost.updatedAt,
      }),
      params(inquiry.id),
    );
    expect((await json<ErrorBody>(twice)).code).toBe("INQUIRY_NOT_OPEN");
    // Its stage was deleted while it was closed: it reopens at the first.
    await prisma.constructionSalesFunnelStage.update({
      where: { id: ctx.lists.stageId["Negotiation"] ?? "" },
      data: { deletedAt: new Date() },
    });
    const reopened = await json<Inquiry>(
      await reopen(
        post(`/${inquiry.id}/reopen`, { expectedUpdatedAt: lost.updatedAt }),
        params(inquiry.id),
      ),
    );
    expect(reopened).toMatchObject({
      status: "open",
      lostReason: null,
      lostRemarks: null,
      closedAt: null,
      funnelStage: { name: "New" },
    });
    expect(reopened.history.at(-1)).toMatchObject({
      type: "reopened",
      details: { from: "lost" },
    });
    const open = await reopen(
      post(`/${inquiry.id}/reopen`, { expectedUpdatedAt: reopened.updatedAt }),
      params(inquiry.id),
    );
    expect((await json<ErrorBody>(open)).code).toBe("INQUIRY_NOT_CLOSED");
  });

  it("reopens a Converted inquiry only once its booking is cancelled", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    const converted = await json<Inquiry>(
      await converting(inquiry, ctx.wing.units["101"] ?? ""),
    );
    const blocked = await reopen(
      post(`/${inquiry.id}/reopen`, { expectedUpdatedAt: converted.updatedAt }),
      params(inquiry.id),
    );
    expect(blocked.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(blocked)).toMatchObject({
      code: "INQUIRY_BOOKING_ACTIVE",
      details: { bookingId: converted.convertedBookingId },
    });
    const bookingId = converted.convertedBookingId ?? "";
    const booking = await prisma.constructionSalesBooking.findUnique({
      where: { id: bookingId },
    });
    const cancelled = await cancelBooking(
      new Request(
        `http://localhost/api/construction/sales/bookings/${bookingId}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reason: "Loan not sanctioned",
            cancelledOn: TODAY,
            expectedUpdatedAt: booking?.updatedAt.toISOString(),
          }),
        },
      ),
      params(bookingId),
    );
    expect(cancelled.status).toBe(StatusCodes.OK);
    const reopened = await json<Inquiry>(
      await reopen(
        post(`/${inquiry.id}/reopen`, {
          expectedUpdatedAt: converted.updatedAt,
        }),
        params(inquiry.id),
      ),
    );
    expect(reopened).toMatchObject({
      status: "open",
      convertedUnitId: null,
      convertedBookingId: null,
      funnelStage: { name: "Negotiation" },
    });
    expect(reopened.history.at(-1)).toMatchObject({
      type: "reopened",
      details: { from: "converted", bookingId },
    });
    // Reopening never releases a unit by itself; the cancel did.
    const after = await prisma.constructionSalesBooking.findUnique({
      where: { id: bookingId },
    });
    expect(after?.status).toBe("cancelled");
  });

  it("scopes by View all and needs Update", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx, {
      assigneeMemberId: null,
      leadOwnerMemberId: null,
    });
    const seller = await member(ctx, { "sales.inquiries": ["read", "update"] });
    actAs(seller.actor);
    const hidden = await lose(
      post(`/${inquiry.id}/lose`, {
        lostReasonId: ctx.lists.reasonId["Budget"],
        expectedUpdatedAt: inquiry.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(hidden.status).toBe(StatusCodes.NOT_FOUND);
    const reader = await member(ctx, {
      "sales.inquiries": ["read", "view_all"],
    });
    actAs(reader.actor);
    const refused = await lose(
      post(`/${inquiry.id}/lose`, {
        lostReasonId: ctx.lists.reasonId["Budget"],
        expectedUpdatedAt: inquiry.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    // An edit of a closed inquiry still works; its stage stays.
    actAs(ctx.owner);
    const lost = await json<Inquiry>(
      await lose(
        post(`/${inquiry.id}/lose`, {
          lostReasonId: ctx.lists.reasonId["Budget"],
          expectedUpdatedAt: inquiry.updatedAt,
        }),
        params(inquiry.id),
      ),
    );
    const edited = await update(
      post(`/${inquiry.id}/update`, {
        name: "Lakshmi N",
        expectedUpdatedAt: lost.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
  });

  it("is on /api/docs", async () => {
    const doc = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    for (const action of ["convert", "lose", "reopen"])
      expect(doc.paths).toHaveProperty([
        `/api/construction/sales/inquiries/{id}/${action}`,
      ]);
    expect(doc.paths).toHaveProperty([
      "/api/construction/sales/inquiries/import",
    ]);
  });
});
