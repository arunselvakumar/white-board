import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, newCompany } from "@/test/companies";
import { salesLists, salesProject, salesWing } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as remove } from "./[id]/delete/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/inquiries";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "sales.inquiries";

type Named = { id: string; name: string | null } | null;

type Inquiry = {
  id: string;
  inquiryDate: string;
  name: string;
  mobile: string | null;
  email: string | null;
  interestType: string | null;
  interestedWing: Named;
  interestedUnitType: string | null;
  leadSource: Named;
  funnelStage: Named;
  status: string;
  nextFollowUp: { date: string; time: string | null } | null;
  due: string | null;
  assignee: Named;
  leadOwner: Named;
  remarks: string | null;
  createdBy: { userId: string; name: string | null };
  updatedAt: string;
  actions: Record<string, boolean>;
  history: {
    type: string;
    details: Record<string, unknown> | null;
    names: Record<string, string | null>;
    by: { userId: string; name: string | null };
  }[];
};

type Page = {
  items: Inquiry[];
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
};
type ErrorBody = { code: string; details?: Record<string, unknown> };

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

let mobiles = 0;
/** A fresh valid mobile per call, so tests never collide. */
function mobile(): string {
  mobiles += 1;
  return `9${String(Date.now() % 1e5).padStart(5, "0")}${String(mobiles).padStart(4, "0")}`;
}

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await salesProject(ws, by, "Green Meadows");
  const lists = await salesLists(projectId);
  const ownerMember = await prisma.constructionOrganizationTeamMember.findFirst(
    {
      where: { workspaceId: ws, isOwner: true },
      select: { id: true },
    },
  );
  actAs(owner);
  return {
    ws,
    by,
    owner,
    projectId,
    lists,
    ownerMemberId: ownerMember?.id ?? "",
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { [MENU]: flags });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return {
    memberId: added.memberId,
    actor: {
      userId: added.userId,
      workspaceId: ctx.ws,
      role: "member" as const,
    },
  };
}

function add(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      name: "Lakshmi Narayanan",
      ...patch,
    }),
  );
}

async function added(ctx: Ctx, patch: Record<string, unknown> = {}) {
  const response = await add(ctx, patch);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(
    StatusCodes.CREATED,
  );
  return json<Inquiry>(response);
}

const edit = (inquiry: Inquiry, patch: Record<string, unknown> = {}) =>
  update(
    post(`/${inquiry.id}/update`, {
      inquiryDate: inquiry.inquiryDate,
      name: inquiry.name,
      mobile: inquiry.mobile,
      email: inquiry.email,
      interestType: inquiry.interestType,
      interestedWingId: inquiry.interestedWing?.id ?? null,
      interestedUnitType: inquiry.interestedUnitType,
      leadSourceId: inquiry.leadSource?.id ?? null,
      funnelStageId: inquiry.funnelStage?.id ?? null,
      nextFollowUpDate: inquiry.nextFollowUp?.date ?? null,
      nextFollowUpTime: inquiry.nextFollowUp?.time ?? null,
      assigneeMemberId: inquiry.assignee?.id ?? null,
      leadOwnerMemberId: inquiry.leadOwner?.id ?? null,
      remarks: inquiry.remarks,
      expectedUpdatedAt: inquiry.updatedAt,
      ...patch,
    }),
    params(inquiry.id),
  );

const read = (id: string) => getOne(get(`/${id}`), params(id));

async function page(ctx: Ctx, query = ""): Promise<Page> {
  const response = await list(get(`?projectId=${ctx.projectId}${query}`));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Page>(response);
}

async function names(ctx: Ctx, query = ""): Promise<string[]> {
  return (await page(ctx, query)).items.map((item) => item.name).sort();
}

describe("Inquiries (CM-1003)", () => {
  it("adds an inquiry with the full form, normalised, at the first stage", async () => {
    const ctx = await setup();
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
      name: "A Wing",
    });
    const number = mobile();
    const inquiry = await added(ctx, {
      inquiryDate: addDays(TODAY, -1),
      mobile: `${number.slice(0, 5)} ${number.slice(5)}`,
      email: "Lakshmi.N@Example.com",
      address: "12, Gandhi Road, Coimbatore",
      occupation: "Teacher",
      interestType: "hot",
      interestedWingId: wing.wingId,
      interestedUnitType: "2BHK",
      leadSourceId: ctx.lists.sourceId["Walk-in"],
      nextFollowUpDate: addDays(TODAY, 2),
      nextFollowUpTime: "10:30",
      remarks: "Wants east facing",
    });
    expect(inquiry).toMatchObject({
      inquiryDate: addDays(TODAY, -1),
      name: "Lakshmi Narayanan",
      mobile: `+91${number}`,
      email: "Lakshmi.N@Example.com",
      interestType: "hot",
      interestedWing: { id: wing.wingId, name: "A Wing" },
      interestedUnitType: "2BHK",
      leadSource: { name: "Walk-in" },
      funnelStage: { name: "New" },
      status: "open",
      nextFollowUp: { date: addDays(TODAY, 2), time: "10:30" },
      due: "upcoming",
      assignee: { id: ctx.ownerMemberId, name: "Arun Selva Kumar" },
      leadOwner: { id: ctx.ownerMemberId },
      createdBy: { userId: ctx.by, name: "Arun Selva Kumar" },
      actions: { edit: true, delete: true, followUp: true, manageTasks: true },
    });
    expect(inquiry.history).toMatchObject([
      {
        type: "created",
        names: { stageId: "New", assigneeMemberId: "Arun Selva Kumar" },
        by: { userId: ctx.by },
      },
    ]);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { workspaceId: ctx.ws, entityId: inquiry.id },
    });
    expect(audit?.action).toBe("inquiry.created");
  });

  it("adds with quick add: a name is enough, dated today", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx, {
      name: "  Ravi   Kumar ",
      interestType: "warm",
      interestedUnitType: "3BHK",
    });
    expect(inquiry).toMatchObject({
      name: "Ravi Kumar",
      inquiryDate: TODAY,
      mobile: null,
      nextFollowUp: null,
      due: "none",
      funnelStage: { name: "New" },
    });
  });

  it("refuses bad fields, with the field they are about", async () => {
    const ctx = await setup();
    const otherProject = await salesProject(ctx.ws, ctx.by);
    const otherWing = await salesWing(ctx.ws, otherProject, ctx.by);
    const otherLists = await salesLists(otherProject);
    const offProject = await member(ctx, ["read"], false);
    await prisma.constructionSalesLeadSource.update({
      where: { id: ctx.lists.sourceId["Hoarding"] ?? "" },
      data: { isActive: false },
    });
    const cases: [Record<string, unknown>, string, string][] = [
      [{ name: "  " }, "INQUIRY_NAME_REQUIRED", "name"],
      [{ name: "x".repeat(121) }, "INQUIRY_NAME_TOO_LONG", "name"],
      [{ mobile: "12345" }, "INQUIRY_MOBILE_INVALID", "mobile"],
      [{ email: "lakshmi@" }, "INQUIRY_EMAIL_INVALID", "email"],
      [
        { inquiryDate: addDays(TODAY, 1) },
        "INQUIRY_DATE_IN_FUTURE",
        "inquiryDate",
      ],
      [
        { interestedWingId: otherWing.wingId },
        "WING_NOT_FOUND",
        "interestedWingId",
      ],
      [
        { leadSourceId: otherLists.sourceId["Walk-in"] },
        "LEAD_SOURCE_NOT_FOUND",
        "leadSourceId",
      ],
      [
        { leadSourceId: ctx.lists.sourceId["Hoarding"] },
        "LEAD_SOURCE_DISABLED",
        "leadSourceId",
      ],
      [
        { funnelStageId: otherLists.stageId["New"] },
        "FUNNEL_STAGE_NOT_FOUND",
        "funnelStageId",
      ],
      [
        { assigneeMemberId: offProject.memberId },
        "ASSIGNEE_NOT_ON_PROJECT",
        "assigneeMemberId",
      ],
      [
        { leadOwnerMemberId: newId() },
        "TEAM_MEMBER_NOT_FOUND",
        "leadOwnerMemberId",
      ],
    ];
    for (const [patch, code, field] of cases) {
      const response = await add(ctx, patch);
      expect(response.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect(await json<ErrorBody>(response)).toMatchObject({
        code,
        details: { field },
      });
    }
    // Picks: a stage other than the first, no Assignee.
    const picked = await added(ctx, {
      funnelStageId: ctx.lists.stageId["Site Visit"],
      assigneeMemberId: null,
      mobile: "+44 20 7946 0958",
    });
    expect(picked).toMatchObject({
      funnelStage: { name: "Site Visit" },
      assignee: null,
      leadOwner: { id: ctx.ownerMemberId },
      mobile: "+442079460958",
    });
  });

  it("refuses a duplicate mobile or email unless Save anyway", async () => {
    const ctx = await setup();
    const number = mobile();
    const first = await added(ctx, {
      mobile: number,
      email: "ravi@example.com",
    });
    const again = await add(ctx, { name: "Ravi K", mobile: `+91 ${number}` });
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(again)).toMatchObject({
      code: "INQUIRY_DUPLICATE",
      details: {
        matches: [{ id: first.id, name: "Lakshmi Narayanan", status: "open" }],
      },
    });
    const byEmail = await add(ctx, { email: "RAVI@example.COM" });
    expect((await json<ErrorBody>(byEmail)).code).toBe("INQUIRY_DUPLICATE");
    const anyway = await add(ctx, { mobile: number, allowDuplicate: true });
    expect(anyway.status).toBe(StatusCodes.CREATED);
    // Another Project's inquiries are not duplicates.
    const elsewhere = await salesProject(ctx.ws, ctx.by);
    const there = await create(
      post("", { projectId: elsewhere, name: "Lakshmi", mobile: number }),
    );
    expect(there.status).toBe(StatusCodes.CREATED);
    // An edit that keeps the mobile is not checked again; one that takes
    // another inquiry's is.
    const second = await json<Inquiry>(anyway);
    const kept = await edit(second, { remarks: "Called back" });
    expect(kept.status).toBe(StatusCodes.OK);
    const other = await added(ctx, { name: "Meena", mobile: mobile() });
    const taken = await edit(other, { email: "ravi@EXAMPLE.com" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(taken)).code).toBe("INQUIRY_DUPLICATE");
    // A deleted inquiry no longer counts.
    const reread = await json<Inquiry>(await read(first.id));
    await remove(
      post(`/${first.id}/delete`, { expectedUpdatedAt: reread.updatedAt }),
      params(first.id),
    );
    const afterDelete = await add(ctx, { email: "ravi@example.com" });
    expect(afterDelete.status).toBe(StatusCodes.CREATED);
  });

  it("scopes by View all: own, assigned and lead-owned inquiries only", async () => {
    const ctx = await setup();
    const seller = await member(ctx, ["create", "read", "update", "delete"]);
    const others = await added(ctx, {
      name: "Owner's lead",
      mobile: mobile(),
      assigneeMemberId: null,
      leadOwnerMemberId: null,
    });
    const assigned = await added(ctx, {
      name: "Assigned lead",
      assigneeMemberId: seller.memberId,
      leadOwnerMemberId: null,
    });
    const owned = await added(ctx, {
      name: "Owned lead",
      assigneeMemberId: null,
      leadOwnerMemberId: seller.memberId,
    });
    actAs(seller.actor);
    const mine = await added(ctx, { name: "My lead" });
    expect(mine.assignee?.id).toBe(seller.memberId);
    expect(await names(ctx)).toEqual([
      "Assigned lead",
      "My lead",
      "Owned lead",
    ]);
    expect((await page(ctx)).total).toBe(3);
    expect((await read(others.id)).status).toBe(StatusCodes.NOT_FOUND);
    expect((await read(assigned.id)).status).toBe(StatusCodes.OK);
    expect((await read(owned.id)).status).toBe(StatusCodes.OK);
    const editOthers = await edit(others, { remarks: "Mine now" });
    expect(editOthers.status).toBe(StatusCodes.NOT_FOUND);
    const deleteOthers = await remove(
      post(`/${others.id}/delete`, { expectedUpdatedAt: others.updatedAt }),
      params(others.id),
    );
    expect(deleteOthers.status).toBe(StatusCodes.NOT_FOUND);
    // A duplicate of an inquiry they cannot see is named without its name.
    const dup = await add(ctx, { mobile: others.mobile });
    expect(await json<ErrorBody>(dup)).toMatchObject({
      code: "INQUIRY_DUPLICATE",
      details: { matches: [{ id: others.id, name: null }] },
    });

    const viewAll = await member(ctx, ["read", "view_all"]);
    actAs(viewAll.actor);
    expect((await page(ctx)).total).toBe(4);
    expect((await read(others.id)).status).toBe(StatusCodes.OK);
    expect((await json<Inquiry>(await read(others.id))).actions).toMatchObject({
      edit: false,
      delete: false,
      followUp: false,
    });

    const noRead = await member(ctx, ["create"]);
    actAs(noRead.actor);
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("edits with history for the Assignee, Lead Owner and stage, and tells the new Assignee", async () => {
    const ctx = await setup();
    const seller = await member(ctx, ["read", "notification"]);
    const inquiry = await added(ctx, { name: "Priya" });
    const edited = await edit(inquiry, {
      assigneeMemberId: seller.memberId,
      leadOwnerMemberId: seller.memberId,
      funnelStageId: ctx.lists.stageId["Contacted"],
      interestType: "cold",
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const body = await json<Inquiry>(edited);
    expect(body).toMatchObject({
      assignee: { id: seller.memberId, name: "Prabhu Saravanan" },
      funnelStage: { name: "Contacted" },
      interestType: "cold",
    });
    expect(body.history.map((item) => item.type)).toEqual([
      "created",
      "assigned",
      "lead_owner_changed",
      "stage_moved",
    ]);
    expect(body.history[1]).toMatchObject({
      details: { fromMemberId: ctx.ownerMemberId, toMemberId: seller.memberId },
      names: {
        fromMemberId: "Arun Selva Kumar",
        toMemberId: "Prabhu Saravanan",
      },
    });
    expect(body.history[3]).toMatchObject({
      names: { fromStageId: "New", toStageId: "Contacted" },
    });
    const notices = await prisma.constructionMessagingNotification.findMany({
      where: { workspaceId: ctx.ws, recipientUserId: seller.actor.userId },
    });
    expect(notices).toMatchObject([
      {
        type: "inquiry.assigned",
        title: "Inquiry from Priya was assigned to you",
        link: {
          href: `/app/projects/${ctx.projectId}/inquiries/list/${inquiry.id}`,
        },
      },
    ]);
    // The Owner assigned their own: no notice to themselves.
    expect(
      await prisma.constructionMessagingNotification.count({
        where: { workspaceId: ctx.ws, recipientUserId: ctx.by },
      }),
    ).toBe(0);
    const stale = await edit(inquiry, { remarks: "Late" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("INQUIRY_CHANGED");
    // Leaving funnelStageId and assigneeMemberId out keeps them.
    const kept = await update(
      post(`/${inquiry.id}/update`, {
        name: "Priya S",
        expectedUpdatedAt: body.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(await json<Inquiry>(kept)).toMatchObject({
      name: "Priya S",
      funnelStage: { name: "Contacted" },
      assignee: { id: seller.memberId },
      interestType: null,
    });
  });

  it("keeps a closed inquiry's stage, and edits it otherwise", async () => {
    const ctx = await setup();
    const inquiry = await added(ctx);
    await prisma.constructionSalesInquiry.update({
      where: { id: inquiry.id },
      data: { status: "lost" },
    });
    const reread = await json<Inquiry>(await read(inquiry.id));
    expect(reread.due).toBeNull();
    const moved = await edit(reread, {
      funnelStageId: ctx.lists.stageId["Negotiation"],
    });
    expect(moved.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(moved)).code).toBe("INQUIRY_NOT_OPEN");
    const renamed = await edit(reread, { name: "Lakshmi N" });
    expect(renamed.status).toBe(StatusCodes.OK);
  });

  it("deletes, unless it converted to a booking that is still active", async () => {
    const ctx = await setup();
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by);
    const inquiry = await added(ctx);
    const bookingId = newId();
    await prisma.constructionSalesBooking.create({
      data: {
        id: bookingId,
        workspaceId: ctx.ws,
        projectId: ctx.projectId,
        wingId: wing.wingId,
        unitId: wing.units["101"] ?? "",
        status: "booked",
        bookingDate: new Date(`${TODAY}T00:00:00Z`),
        customerName: "Lakshmi Narayanan",
        inquiryId: inquiry.id,
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    await prisma.constructionSalesInquiry.update({
      where: { id: inquiry.id },
      data: { status: "converted", convertedBookingId: bookingId },
    });
    const converted = await json<Inquiry>(await read(inquiry.id));
    const refused = await remove(
      post(`/${inquiry.id}/delete`, {
        expectedUpdatedAt: converted.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(refused)).toMatchObject({
      code: "INQUIRY_HAS_BOOKING",
      details: { bookingId },
    });
    await prisma.constructionSalesBooking.update({
      where: { id: bookingId },
      data: { status: "cancelled" },
    });
    const deleted = await remove(
      post(`/${inquiry.id}/delete`, {
        expectedUpdatedAt: converted.updatedAt,
      }),
      params(inquiry.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await read(inquiry.id)).status).toBe(StatusCodes.NOT_FOUND);
    const row = await prisma.constructionSalesInquiry.findUnique({
      where: { id: inquiry.id },
    });
    expect(row?.deletedBy).toBe(ctx.by);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: inquiry.id, action: "inquiry.deleted" },
    });
    expect(audit).not.toBeNull();
    // Delete needs Inquiry delete.
    const other = await added(ctx, { name: "Second" });
    const updater = await member(ctx, ["read", "update", "view_all"]);
    actAs(updater.actor);
    const noDelete = await remove(
      post(`/${other.id}/delete`, { expectedUpdatedAt: other.updatedAt }),
      params(other.id),
    );
    expect(noDelete.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("refuses a back-dated Inquiry Date beyond the policy", async () => {
    const ctx = await setup();
    const old = await added(ctx, { inquiryDate: addDays(TODAY, -10) });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.ws,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          inquiry: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.by,
        updatedBy: ctx.by,
      },
    });
    const seller = await member(ctx, ["read", "create", "update", "view_all"]);
    actAs(seller.actor);
    const created = await add(ctx, { inquiryDate: addDays(TODAY, -10) });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(created)).code).toBe(
      "BACKDATED_CREATE_BLOCKED",
    );
    expect((await add(ctx, { inquiryDate: addDays(TODAY, -2) })).status).toBe(
      StatusCodes.CREATED,
    );
    const edited = await edit(old, { remarks: "Changed" });
    expect((await json<ErrorBody>(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");
  });

  it("filters by status, stage, interest, source, assignee, due and search", async () => {
    const ctx = await setup();
    const seller = await member(ctx, ["read"]);
    const hot = await added(ctx, {
      name: "Anand",
      interestType: "hot",
      mobile: "98450 12345",
      leadSourceId: ctx.lists.sourceId["Referral"],
      nextFollowUpDate: addDays(TODAY, -1),
    });
    await added(ctx, {
      name: "Bhavana",
      interestType: "warm",
      email: "bhavana@example.com",
      funnelStageId: ctx.lists.stageId["Site Visit"],
      assigneeMemberId: seller.memberId,
      nextFollowUpDate: TODAY,
    });
    await added(ctx, {
      name: "Chitra",
      interestType: "cold",
      nextFollowUpDate: addDays(TODAY, 3),
      nextFollowUpTime: "09:00",
    });
    const lost = await added(ctx, { name: "Deepak" });
    await prisma.constructionSalesInquiry.update({
      where: { id: lost.id },
      data: { status: "lost" },
    });
    // A follow-up earlier today, with a time, is overdue already.
    await added(ctx, {
      name: "Esther",
      nextFollowUpDate: TODAY,
      nextFollowUpTime: "00:00",
    });

    expect(await names(ctx, "&status=lost")).toEqual(["Deepak"]);
    expect(await names(ctx, "&status=open")).toHaveLength(4);
    expect(
      await names(ctx, `&funnelStageId=${ctx.lists.stageId["Site Visit"]}`),
    ).toEqual(["Bhavana"]);
    expect(await names(ctx, "&interestType=hot,cold")).toEqual([
      "Anand",
      "Chitra",
    ]);
    expect(
      await names(ctx, `&leadSourceId=${ctx.lists.sourceId["Referral"]}`),
    ).toEqual(["Anand"]);
    expect(await names(ctx, `&assigneeMemberId=${seller.memberId}`)).toEqual([
      "Bhavana",
    ]);
    expect(await names(ctx, "&due=overdue")).toEqual(["Anand", "Esther"]);
    expect(await names(ctx, "&due=today")).toEqual(["Bhavana"]);
    expect(await names(ctx, "&due=upcoming")).toEqual(["Chitra"]);
    // Deepak is Lost: no longer "no follow-up".
    expect(await names(ctx, "&due=none")).toEqual([]);
    expect(await names(ctx, "&search=bhav")).toEqual(["Bhavana"]);
    expect(await names(ctx, "&search=EXAMPLE.COM")).toEqual(["Bhavana"]);
    expect(await names(ctx, "&search=98450")).toEqual(["Anand"]);
    expect(await names(ctx, "&search=98450%2012345")).toEqual(["Anand"]);
    const overdue = (await page(ctx, "&due=overdue")).items.find(
      (item) => item.id === hot.id,
    );
    expect(overdue?.due).toBe("overdue");
  });

  it("pages with cursors and a total", async () => {
    const ctx = await setup();
    for (const name of ["One", "Two", "Three", "Four", "Five"])
      await added(ctx, { name });
    const first = await page(ctx, "&limit=2");
    expect(first.items.map((item) => item.name)).toEqual(["Five", "Four"]);
    expect(first.total).toBe(5);
    expect(first.prevCursor).toBeNull();
    const second = await page(ctx, `&limit=2&after=${first.nextCursor ?? ""}`);
    expect(second.items.map((item) => item.name)).toEqual(["Three", "Two"]);
    const back = await page(ctx, `&limit=2&before=${second.prevCursor ?? ""}`);
    expect(back.items.map((item) => item.name)).toEqual(["Five", "Four"]);
  });

  it("offers the form's pickers", async () => {
    const ctx = await setup();
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
      name: "B Wing",
    });
    await prisma.constructionSalesLeadSource.update({
      where: { id: ctx.lists.sourceId["Hoarding"] ?? "" },
      data: { isActive: false },
    });
    const response = await formOptions(
      get(`/form-options?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.OK);
    const options = await json<{
      members: { id: string; isOwner: boolean }[];
      wings: { id: string; name: string }[];
      funnelStages: { name: string }[];
      leadSources: { name: string }[];
      lostReasons: { name: string }[];
      viewerMemberId: string | null;
    }>(response);
    expect(options.members[0]).toMatchObject({
      id: ctx.ownerMemberId,
      isOwner: true,
    });
    expect(options.wings).toEqual([{ id: wing.wingId, name: "B Wing" }]);
    expect(options.funnelStages.map((stage) => stage.name)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    expect(options.leadSources.map((source) => source.name)).not.toContain(
      "Hoarding",
    );
    expect(options.lostReasons).toHaveLength(5);
    expect(options.viewerMemberId).toBe(ctx.ownerMemberId);
  });

  it("is on /api/docs", () => {
    const doc = getOpenApi();
    return doc.json().then((body: { paths: Record<string, unknown> }) => {
      for (const path of [
        "/api/construction/sales/inquiries",
        "/api/construction/sales/inquiries/form-options",
        "/api/construction/sales/inquiries/{id}",
        "/api/construction/sales/inquiries/{id}/update",
        "/api/construction/sales/inquiries/{id}/delete",
      ])
        expect(body.paths).toHaveProperty([path]);
    });
  });
});
