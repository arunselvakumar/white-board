import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { bookUnitInTx } from "@/src/composition/sales-bookings";
import { PrismaStructureUsage } from "@/src/composition/structure-usage";
import { PrismaProjectUsage } from "@/src/projects/infrastructure/prisma-project-usage";
import { PrismaBookingStore } from "@/src/sales/infrastructure/prisma-booking-store";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, newCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import { salesBookingRow, salesProject, salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as cancel } from "./[id]/cancel/route";
import { POST as confirm } from "./[id]/confirm/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as extendHold } from "./[id]/extend-hold/route";
import { POST as removeFile } from "@/app/api/construction/sales/documents/[type]/[id]/files/[fileId]/delete/route";
import { GET as readFile } from "@/app/api/construction/sales/documents/[type]/[id]/files/[fileId]/route";
import { GET as listFiles } from "@/app/api/construction/sales/documents/[type]/[id]/files/route";
import {
  salesDocumentBase,
  salesDocumentParams,
  salesFileParams,
  startSalesUpload,
  uploadSalesFile,
} from "@/app/api/construction/sales/documents/document-test-fixtures";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const ORIGIN = "http://localhost";
const BASE = `${ORIGIN}/api/construction/sales/bookings`;
const TODAY = todayIn("Asia/Kolkata");
const PDF = new TextEncoder().encode("%PDF-1.7\nBooking form\n%%EOF");

type Booking = {
  id: string;
  unit: { id: string; name: string; floorName: string };
  wing: { id: string; name: string };
  status: string;
  storedStatus: string;
  bookingDate: string;
  holdUntil: string | null;
  confirmedOn: string | null;
  cancelledOn: string | null;
  cancelReason: string | null;
  customerName: string;
  customerMobile: string | null;
  referredByContact: string | null;
  inquiry: { id: string; name: string } | null;
  updatedAt: string;
  actions: Record<string, boolean>;
  history: {
    kind: string;
    status: string;
    onDate: string;
    holdUntil: string | null;
    reason: string | null;
    by: { userId: string; name: string | null };
  }[];
};
type Page = {
  items: Booking[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
};
type ErrorBody = { code: string; details?: Record<string, unknown> };
type BookingFile = {
  id: string;
  role: string;
  fileName: string;
  contentType: string;
  url: string;
  canRemove: boolean;
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function post(path: string, body: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${BASE}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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
  const unit = (name: string) => wing.units[name] ?? "";
  return { ws, by, owner, projectId, wing, unit };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { "sales.bookings": flags });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

function book(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      unitId: ctx.unit("101"),
      status: "on_hold",
      bookingDate: addDays(TODAY, -1),
      holdUntil: addDays(TODAY, 6),
      customerName: "Meena Raghavan",
      customerMobile: "98765 43210",
      referredByName: "Suresh",
      referredByContact: "09876543211",
      ...patch,
    }),
  );
}

async function booked(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await book(ctx, patch);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Booking>(response);
}

const read = async (id: string) =>
  json<Booking>(await getOne(get(`/${id}`), params(id)));

const act = (
  route: (
    request: Request,
    context: ReturnType<typeof params>,
  ) => Promise<Response>,
  action: string,
  booking: Booking,
  body: Record<string, unknown> = {},
) =>
  route(
    post(`/${booking.id}/${action}`, {
      expectedUpdatedAt: booking.updatedAt,
      ...body,
    }),
    params(booking.id),
  );

async function names(ctx: Ctx, query = ""): Promise<string[]> {
  const page = await json<Page>(
    await list(get(`?projectId=${ctx.projectId}${query}`)),
  );
  return page.items.map((item) => `${item.unit.name}:${item.status}`);
}

describe("Bookings (CM-1006, CM-0022 §7)", () => {
  it("holds a unit with its history, customer and Referred By", async () => {
    const ctx = await setup();
    const hold = await booked(ctx);
    expect(hold).toMatchObject({
      unit: { id: ctx.unit("101"), name: "101", floorName: "Floor 1" },
      wing: { id: ctx.wing.wingId, name: "Tower A" },
      status: "on_hold",
      holdUntil: addDays(TODAY, 6),
      confirmedOn: null,
      customerName: "Meena Raghavan",
      customerMobile: "+919876543210",
      referredByContact: "+919876543211",
      inquiry: null,
      actions: {
        edit: true,
        confirm: true,
        extendHold: true,
        cancel: true,
        delete: true,
        files: true,
      },
    });
    expect(hold.history).toEqual([
      expect.objectContaining({
        kind: "created",
        status: "on_hold",
        onDate: addDays(TODAY, -1),
        holdUntil: addDays(TODAY, 6),
        by: { userId: ctx.by, name: "Arun Selva Kumar" },
      }),
    ]);
    const full = await booked(ctx, {
      unitId: ctx.unit("102"),
      status: "booked",
      holdUntil: addDays(TODAY, 3),
    });
    expect(full).toMatchObject({
      status: "booked",
      holdUntil: null,
      confirmedOn: addDays(TODAY, -1),
      actions: { confirm: false, extendHold: false, cancel: true },
    });
    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: ctx.ws,
        entityId: hold.id,
        action: "booking.created",
      },
    });
    expect(audit).toBe(1);
  });

  it("keeps one active booking per unit and refuses unavailable or foreign units", async () => {
    const ctx = await setup();
    const first = await booked(ctx);
    const again = await book(ctx, { customerName: "Ravi" });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(again)).toMatchObject({
      code: "UNIT_BOOKED",
      details: { bookingId: first.id },
    });
    await prisma.constructionSalesUnitProfile.create({
      data: {
        unitId: ctx.unit("201"),
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        wingId: ctx.wing.wingId,
        unavailable: true,
        unavailableReason: "landowner_share",
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const unavailable = await book(ctx, { unitId: ctx.unit("201") });
    expect((await json<ErrorBody>(unavailable)).code).toBe("UNIT_UNAVAILABLE");
    const elsewhere = await salesProject(ctx.ws, ctx.by);
    const foreign = await salesWing(ctx.ws, elsewhere, ctx.by, { floors: 0 });
    const wrong = await book(ctx, { unitId: foreign.units["G01"] });
    expect(wrong.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<ErrorBody>(wrong)).code).toBe("UNIT_NOT_FOUND");

    // A race the lock did not cover still meets the partial unique index.
    const store = new PrismaBookingStore();
    await expect(
      store.insert(
        prisma,
        {
          id: newId(),
          workspaceId: ctx.ws,
          projectId: ctx.projectId,
          wingId: ctx.wing.wingId,
          unitId: ctx.unit("101"),
          status: "booked",
          inquiryId: null,
          confirmedOn: TODAY,
          bookingDate: TODAY,
          holdUntil: null,
          customerName: "Racer",
          customerMobile: null,
          customerEmail: null,
          customerAddress: null,
          referredByName: null,
          referredByContact: null,
          remarks: null,
        },
        ctx.by,
        new Date(),
      ),
    ).rejects.toMatchObject({ code: "UNIT_BOOKED", kind: "conflict" });
  });

  it("cancels an expired hold for the system when the unit is booked again", async () => {
    const ctx = await setup();
    const expired = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.unit("101"),
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -6),
        holdUntil: addDays(TODAY, -1),
      },
    );
    expect((await read(expired)).status).toBe("hold_expired");
    const next = await booked(ctx, { status: "booked", customerName: "Ravi" });
    expect(next.status).toBe("booked");
    const old = await read(expired);
    expect(old).toMatchObject({
      status: "cancelled",
      cancelledOn: TODAY,
      cancelReason: "Hold expired",
    });
    expect(old.history.at(-1)).toMatchObject({
      kind: "cancelled",
      reason: "Hold expired",
      by: { userId: "system", name: "System" },
    });
  });

  it("confirms, extends and cancels with history; refuses what the status does not take", async () => {
    const ctx = await setup();
    const hold = await booked(ctx);
    const extended = await json<Booking>(
      await act(extendHold, "extend-hold", hold, {
        holdUntil: addDays(TODAY, 20),
      }),
    );
    expect(extended.holdUntil).toBe(addDays(TODAY, 20));
    const past = await act(extendHold, "extend-hold", extended, {
      holdUntil: addDays(TODAY, -1),
    });
    expect((await json<ErrorBody>(past)).code).toBe("HOLD_UNTIL_IN_PAST");
    const stale = await act(confirm, "confirm", hold, { confirmedOn: TODAY });
    expect((await json<ErrorBody>(stale)).code).toBe("BOOKING_CHANGED");
    const confirmed = await json<Booking>(
      await act(confirm, "confirm", extended, { confirmedOn: TODAY }),
    );
    expect(confirmed).toMatchObject({
      status: "booked",
      confirmedOn: TODAY,
      holdUntil: null,
    });
    const twice = await act(confirm, "confirm", confirmed, {
      confirmedOn: TODAY,
    });
    expect((await json<ErrorBody>(twice)).code).toBe("BOOKING_NOT_ON_HOLD");
    const noReason = await act(cancel, "cancel", confirmed, {
      reason: " ",
      cancelledOn: TODAY,
    });
    expect((await json<ErrorBody>(noReason)).code).toBe(
      "CANCEL_REASON_REQUIRED",
    );
    const cancelled = await json<Booking>(
      await act(cancel, "cancel", confirmed, {
        reason: "Loan refused",
        cancelledOn: TODAY,
      }),
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      cancelReason: "Loan refused",
      actions: { edit: false, cancel: false, confirm: false },
    });
    expect(cancelled.history.map((item) => item.kind)).toEqual([
      "created",
      "hold_extended",
      "confirmed",
      "cancelled",
    ]);
    const again = await act(cancel, "cancel", cancelled, {
      reason: "Again",
      cancelledOn: TODAY,
    });
    expect((await json<ErrorBody>(again)).code).toBe("BOOKING_CANCELLED");
    // The unit is free: book it again.
    expect((await book(ctx, { customerName: "Ravi" })).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("edits details without the status and deletes a booking to free its unit", async () => {
    const ctx = await setup();
    const hold = await booked(ctx);
    const edited = await update(
      post(`/${hold.id}/update`, {
        expectedUpdatedAt: hold.updatedAt,
        bookingDate: addDays(TODAY, -2),
        customerName: "Meena R",
        customerEmail: "meena@example.com",
        remarks: "Wants a corner unit",
      }),
      params(hold.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const body = await json<Booking>(edited);
    expect(body).toMatchObject({
      status: "on_hold",
      customerName: "Meena R",
      bookingDate: addDays(TODAY, -2),
      holdUntil: addDays(TODAY, 6),
    });
    expect(body.history).toHaveLength(1);
    const future = await update(
      post(`/${hold.id}/update`, {
        expectedUpdatedAt: body.updatedAt,
        bookingDate: addDays(TODAY, 1),
        customerName: "Meena R",
      }),
      params(hold.id),
    );
    expect((await json<ErrorBody>(future)).code).toBe("BOOKING_DATE_IN_FUTURE");
    const deleted = await act(remove, "delete", body);
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${hold.id}`), params(hold.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await book(ctx)).status).toBe(StatusCodes.CREATED);
  });

  it("applies the back-dated window to the Booking Date", async () => {
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
          booking: {
            mode: "custom",
            create: { days: 3, overrideRoleIds: [] },
            edit: { days: 3, overrideRoleIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    actAs(await member(ctx, ["read", "create", "update"]));
    const old = await book(ctx, {
      bookingDate: addDays(TODAY, -10),
      holdUntil: null,
    });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(old)).code).toBe("BACKDATED_CREATE_BLOCKED");
    expect((await book(ctx, { bookingDate: addDays(TODAY, -2) })).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("lists by status (Hold expired included), Wing and search with cursors and total", async () => {
    const ctx = await setup();
    await booked(ctx);
    await booked(ctx, {
      unitId: ctx.unit("102"),
      status: "booked",
      customerName: "Ravi Kumar",
      customerMobile: "9123456789",
    });
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.unit("201"),
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -6),
        holdUntil: addDays(TODAY, -1),
      },
    );
    expect((await names(ctx)).sort()).toEqual([
      "101:on_hold",
      "102:booked",
      "201:hold_expired",
    ]);
    expect(await names(ctx, "&status=hold_expired")).toEqual([
      "201:hold_expired",
    ]);
    expect((await names(ctx, "&status=on_hold,booked")).sort()).toEqual([
      "101:on_hold",
      "102:booked",
    ]);
    expect(await names(ctx, "&search=ravi")).toEqual(["102:booked"]);
    expect(await names(ctx, "&search=91234")).toEqual(["102:booked"]);
    expect(await names(ctx, `&wingId=${ctx.wing.wingId}`)).toHaveLength(3);
    expect(await names(ctx, `&wingId=${newId()}`)).toEqual([]);
    const first = await json<Page>(
      await list(get(`?projectId=${ctx.projectId}&limit=2`)),
    );
    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(first.prevCursor).toBeNull();
    const second = await json<Page>(
      await list(
        get(
          `?projectId=${ctx.projectId}&limit=2&after=${first.nextCursor ?? ""}`,
        ),
      ),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(second.prevCursor).not.toBeNull();
  });

  it("offers only bookable units: free, not unavailable, an expired hold counts free", async () => {
    const ctx = await setup();
    await booked(ctx);
    await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.unit("201"),
      ctx.by,
      {
        status: "on_hold",
        bookingDate: addDays(TODAY, -6),
        holdUntil: addDays(TODAY, -1),
      },
    );
    const options = await json<{
      wings: { name: string; units: { name: string }[] }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.wings).toHaveLength(1);
    expect(options.wings[0]?.units.map((unit) => unit.name)).toEqual([
      "201",
      "202",
      "102",
      "G01",
      "G02",
    ]);
  });

  it("checks access: Read lists, Create books, other Projects and Companies are refused", async () => {
    const ctx = await setup();
    const hold = await booked(ctx);
    actAs(await member(ctx, ["read"]));
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.OK,
    );
    const view = await read(hold.id);
    expect(Object.values(view.actions).every((value) => !value)).toBe(true);
    expect((await book(ctx, { unitId: ctx.unit("102") })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await act(cancel, "cancel", hold, { reason: "x", cancelledOn: TODAY }))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "create"], false));
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const stranger = await newCompany();
    actAs({ userId: stranger.ownerId, workspaceId: stranger.workspaceId });
    expect((await getOne(get(`/${hold.id}`), params(hold.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("notifies Booking Read + Notification holders on the Project", async () => {
    const ctx = await setup();
    const watcher = await member(ctx, ["read", "notification"]);
    const silent = await member(ctx, ["read"]);
    const hold = await booked(ctx);
    await act(cancel, "cancel", hold, {
      reason: "Changed plans",
      cancelledOn: TODAY,
    });
    const rows = await prisma.constructionMessagingNotification.findMany({
      where: { workspaceId: ctx.ws, menu: "sales.bookings" },
      orderBy: { createdAt: "asc" },
    });
    expect(rows.map((row) => [row.recipientUserId, row.type])).toEqual([
      [watcher.userId, "booking.created"],
      [watcher.userId, "booking.cancelled"],
    ]);
    expect(rows.some((row) => row.recipientUserId === silent.userId)).toBe(
      false,
    );
    expect(rows[0]?.title).toBe("Tower A · 101 is on hold");
  });

  it("books a unit inside a caller's transaction for a converted inquiry (CM-1007)", async () => {
    const ctx = await setup();
    const inquiryId = newId();
    const { bookingId, afterCommit } = await prisma.$transaction((tx) =>
      bookUnitInTx(tx, {
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        unitId: ctx.unit("101"),
        bookingDate: TODAY,
        customer: { name: "Lakshmi", mobile: "9988776655", email: null },
        inquiryId,
        by: ctx.by,
        now: new Date(),
      }),
    );
    await afterCommit();
    const body = await read(bookingId);
    expect(body).toMatchObject({
      status: "booked",
      customerName: "Lakshmi",
      customerMobile: "+919988776655",
      inquiry: { id: inquiryId, name: "" },
    });
    await expect(
      prisma.$transaction((tx) =>
        bookUnitInTx(tx, {
          workspaceId: ctx.ws,
          projectId: ctx.projectId,
          unitId: ctx.unit("101"),
          bookingDate: TODAY,
          customer: { name: "Second" },
          inquiryId: newId(),
          by: ctx.by,
          now: new Date(),
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe("Booking files (CM-1006): Booking Form and photos, not in the Gallery", () => {
  it("keeps one Booking Form and photos on the sales document routes", async () => {
    const ctx = await setup();
    const hold = await booked(ctx);
    const form = await uploadSalesFile(
      "booking",
      hold.id,
      "booking_form",
      "form.pdf",
      PDF,
    );
    expect(form).toMatchObject({
      role: "booking_form",
      contentType: "application/pdf",
      canRemove: true,
    });
    const second = await startSalesUpload(
      "booking",
      hold.id,
      "booking_form",
      "again.pdf",
      PDF.byteLength,
    );
    expect(second.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(second)).code).toBe("BOOKING_FORM_EXISTS");
    const pdfPhoto = await startSalesUpload(
      "booking",
      hold.id,
      "photo",
      "scan.pdf",
      PDF.byteLength,
    );
    expect((await json<ErrorBody>(pdfPhoto)).code).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    const card = await startSalesUpload(
      "booking",
      hold.id,
      "visiting_card",
      "card.png",
      64,
    );
    expect((await json<ErrorBody>(card)).code).toBe("FILE_ROLE_NOT_ALLOWED");
    await uploadSalesFile("booking", hold.id, "photo", "site.png", pngBytes());
    const listed = await json<{ items: BookingFile[]; canUpload: boolean }>(
      await listFiles(
        get(`/${hold.id}/files`),
        salesDocumentParams("booking", hold.id),
      ),
    );
    expect(listed.items.map((file) => file.role)).toEqual([
      "booking_form",
      "photo",
    ]);
    expect(listed.canUpload).toBe(true);
    const served = await readFile(
      new Request(`${salesDocumentBase("booking", hold.id)}/files/${form.id}`),
      salesFileParams("booking", hold.id, form.id),
    );
    expect(served.status).toBe(StatusCodes.OK);
    expect(served.headers.get("content-type")).toContain("application/pdf");
    expect(
      await prisma.constructionProjectsMediaItem.count({
        where: { workspaceId: ctx.ws, projectId: ctx.projectId },
      }),
    ).toBe(0);
    const removed = await removeFile(
      post(`/${hold.id}/files/${form.id}/delete`, {}),
      salesFileParams("booking", hold.id, form.id),
    );
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    // A Create holder (without Update) uploads too; Read alone does not.
    actAs(await member(ctx, ["read", "create"]));
    expect(
      (
        await startSalesUpload(
          "booking",
          hold.id,
          "photo",
          "x.png",
          pngBytes().byteLength,
        )
      ).status,
    ).toBe(StatusCodes.CREATED);
    actAs(await member(ctx, ["read"]));
    expect(
      (
        await startSalesUpload(
          "booking",
          hold.id,
          "photo",
          "x.png",
          pngBytes().byteLength,
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Structure and Project usage (CM-1006)", () => {
  it("keeps units, floors and Wings any live booking names, cancelled ones too", async () => {
    const ctx = await setup();
    const usage = new PrismaStructureUsage(prisma);
    const cancelled = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.unit("101"),
      ctx.by,
      { status: "cancelled" },
    );
    const deleted = await salesBookingRow(
      ctx.ws,
      ctx.projectId,
      ctx.wing.wingId,
      ctx.unit("201"),
      ctx.by,
    );
    await prisma.constructionSalesBooking.update({
      where: { id: deleted },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });
    const used = await usage.usedFloorsAndUnits(ctx.ws, {
      floorIds: ctx.wing.floorIds,
      unitIds: [ctx.unit("101"), ctx.unit("102"), ctx.unit("201")],
    });
    expect(used.unitIds).toEqual([ctx.unit("101")]);
    expect(used.floorIds).toEqual([ctx.wing.floorIds[1]]);
    expect(await usage.isWingUsed(ctx.ws, ctx.wing.wingId)).toBe(true);
    await prisma.constructionSalesBooking.update({
      where: { id: cancelled },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });
    expect(await usage.isWingUsed(ctx.ws, ctx.wing.wingId)).toBe(false);
  });

  it("keeps a Project with inquiries or bookings", async () => {
    const ctx = await setup();
    const projectUsage = new PrismaProjectUsage(prisma);
    const bare = await salesProject(ctx.ws, ctx.by);
    expect(await projectUsage.isInUse(ctx.ws, bare)).toBe(false);
    await prisma.constructionSalesInquiry.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        projectId: bare,
        inquiryDate: new Date(`${TODAY}T00:00:00.000Z`),
        name: "Walk-in",
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    expect(await projectUsage.isInUse(ctx.ws, bare)).toBe(true);
  });

  it("is in the OpenAPI document", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/sales/bookings",
      "/api/construction/sales/bookings/{id}/cancel",
      "/api/construction/sales/bookings/form-options",
    ])
      expect(document.paths).toHaveProperty(path);
  });
});
