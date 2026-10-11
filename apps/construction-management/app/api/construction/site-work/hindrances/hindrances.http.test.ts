import { Prisma, prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createSiteRecordQueries } from "@/src/composition/site-records";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addContractor } from "@/test/procurement";
import { sharedAddEquipmentUsageRow } from "@/test/site-work";

import { POST as close } from "./[id]/close/route";
import { POST as remove } from "./[id]/delete/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/site-work/hindrances";
const TODAY = todayIn("Asia/Kolkata");
const MENU = "site_work.hindrances";

type Hindrance = {
  id: string;
  number: string;
  startDate: string;
  endDate: string | null;
  status: string;
  daysLost: number;
  hoursLost: string | null;
  cause: string;
  affectedActivity: string;
  responsibleParty: string;
  contractor: { id: string; name: string | null } | null;
  equipmentUsageSheet: { id: string; number: string } | null;
  signOff: {
    teamMember: { userId: string; name: string | null } | null;
    partyName: string;
    partyRole: string | null;
    signedOn: string;
  } | null;
  updatedAt: string;
  actions: Record<string, boolean>;
};

type Page = { items: Hindrance[]; total: number };
type ErrorBody = { code: string; details?: { field?: string } };

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
  const owner = { userId: company.ownerId, workspaceId: company.workspaceId };
  const projectId = await addProject(
    company.workspaceId,
    company.ownerId,
    "Tower A",
  );
  const contractorId = await addContractor(
    company.workspaceId,
    company.ownerId,
    [projectId],
  );
  actAs({ ...owner, role: "owner" });
  return { company, owner, projectId, contractorId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.company.workspaceId, ctx.company.ownerId, {
    [MENU]: flags,
  });
  if (onProject)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId: ctx.projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.company.workspaceId,
    role: "member" as const,
  };
}

function record(ctx: Ctx, patch: Record<string, unknown> = {}) {
  return create(
    post("", {
      projectId: ctx.projectId,
      startDate: addDays(TODAY, -3),
      cause: "weather",
      affectedActivity: "Roof slab shuttering",
      responsibleParty: "force_majeure",
      description: "Heavy rain from noon",
      ...patch,
    }),
  );
}

async function filter(ctx: Ctx, query: string): Promise<string[]> {
  const page = await json<Page>(
    await list(get(`?projectId=${ctx.projectId}&${query}`)),
  );
  return page.items.map((item) => item.affectedActivity).sort();
}

describe("Hindrance register", () => {
  it("numbers, reads and lists hindrances with days lost", async () => {
    const ctx = await setup();
    const response = await record(ctx, { hoursLost: "6.5" });
    expect(response.status).toBe(StatusCodes.CREATED);
    const first = await json<Hindrance>(response);
    expect(first).toMatchObject({
      status: "open",
      daysLost: 4,
      hoursLost: "6.5",
      cause: "weather",
      contractor: null,
      signOff: null,
      actions: { edit: true, close: true, delete: true, print: true },
    });
    expect(first.number).toMatch(/^HR\/\d{2}-\d{2}\/00001$/);
    const second = await json<Hindrance>(
      await record(ctx, {
        startDate: addDays(TODAY, -2),
        endDate: addDays(TODAY, -1),
      }),
    );
    expect(second.number).toMatch(/\/00002$/);
    expect(second).toMatchObject({ status: "closed", daysLost: 2 });

    const one = await json<Hindrance>(
      await getOne(get(`/${first.id}`), params(first.id)),
    );
    expect(one.id).toBe(first.id);
    const page = await json<Page>(
      await list(get(`?projectId=${ctx.projectId}`)),
    );
    expect(page.total).toBe(2);
    expect(page.items.map((h) => h.number)).toEqual([
      second.number,
      first.number,
    ]);
  });

  it("needs a Contractor on the Project when the party is a Contractor", async () => {
    const ctx = await setup();
    const missing = await record(ctx, { responsibleParty: "contractor" });
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(missing)).toMatchObject({
      code: "HINDRANCE_CONTRACTOR_REQUIRED",
      details: { field: "contractorId" },
    });

    const elsewhere = await addContractor(
      ctx.company.workspaceId,
      ctx.company.ownerId,
    );
    const offProject = await record(ctx, {
      responsibleParty: "contractor",
      contractorId: elsewhere,
    });
    expect(offProject.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(offProject)).toMatchObject({
      code: "CONTRACTOR_NOT_ON_PROJECT",
      details: { field: "contractorId" },
    });

    const saved = await json<Hindrance>(
      await record(ctx, {
        cause: "labour_shortage",
        responsibleParty: "contractor",
        contractorId: ctx.contractorId,
      }),
    );
    expect(saved.contractor?.id).toBe(ctx.contractorId);
    expect(saved.contractor?.name).toMatch(/^Velan Constructions/);

    // Another party drops the Contractor.
    const other = await json<Hindrance>(
      await record(ctx, {
        responsibleParty: "client",
        contractorId: ctx.contractorId,
      }),
    );
    expect(other.contractor).toBeNull();
  });

  it("refuses an end before the start and future dates", async () => {
    const ctx = await setup();
    const backwards = await record(ctx, { endDate: addDays(TODAY, -4) });
    expect(backwards.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(backwards)).toMatchObject({
      code: "HINDRANCE_END_BEFORE_START",
      details: { field: "endDate" },
    });
    const future = await record(ctx, { startDate: addDays(TODAY, 1) });
    expect((await json<ErrorBody>(future)).code).toBe(
      "HINDRANCE_DATE_IN_FUTURE",
    );
    const hours = await record(ctx, { hoursLost: "-1" });
    expect((await json<ErrorBody>(hours)).code).toBe("HINDRANCE_HOURS_INVALID");
  });

  it("records the joint sign-off, all or none", async () => {
    const ctx = await setup();
    const half = await record(ctx, { signOff: { partyName: "Suresh (PMC)" } });
    expect(half.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<ErrorBody>(half)).toMatchObject({
      code: "HINDRANCE_SIGN_OFF_INCOMPLETE",
      details: { field: "signOff.signedOn" },
    });
    const stranger = await record(ctx, {
      signOff: {
        userId: "not-a-member",
        partyName: "Suresh",
        signedOn: TODAY,
      },
    });
    expect((await json<ErrorBody>(stranger)).code).toBe(
      "SIGN_OFF_MEMBER_NOT_FOUND",
    );
    const saved = await json<Hindrance>(
      await record(ctx, {
        signOff: {
          userId: ctx.company.ownerId,
          partyName: "Suresh",
          partyRole: "PMC engineer",
          signedOn: TODAY,
        },
      }),
    );
    expect(saved.signOff).toEqual({
      teamMember: { userId: ctx.company.ownerId, name: "Arun Selva Kumar" },
      partyName: "Suresh",
      partyRole: "PMC engineer",
      signedOn: TODAY,
    });

    const options = await json<{
      contractors: { id: string }[];
      teamMembers: { userId: string; isOwner: boolean }[];
    }>(await formOptions(get(`/form-options?projectId=${ctx.projectId}`)));
    expect(options.contractors.map((c) => c.id)).toEqual([ctx.contractorId]);
    expect(options.teamMembers).toEqual([
      expect.objectContaining({ userId: ctx.company.ownerId, isOwner: true }),
    ]);
  });

  it("links a usage sheet on the Project", async () => {
    const ctx = await setup();
    const sheet = await sharedAddEquipmentUsageRow(
      ctx.company.workspaceId,
      ctx.company.ownerId,
      ctx.projectId,
    );
    const saved = await json<Hindrance>(
      await record(ctx, {
        startDate: addDays(TODAY, -1),
        cause: "equipment_breakdown",
        responsibleParty: "company",
        equipmentUsageSheetId: sheet.id,
      }),
    );
    expect(saved.equipmentUsageSheet).toMatchObject({
      id: sheet.id,
      number: sheet.label,
    });
    const other = await addProject(
      ctx.company.workspaceId,
      ctx.company.ownerId,
    );
    const wrong = await record(
      { ...ctx, projectId: other },
      { equipmentUsageSheetId: sheet.id },
    );
    expect(await json<ErrorBody>(wrong)).toMatchObject({
      code: "EQUIPMENT_USAGE_SHEET_NOT_FOUND",
      details: { field: "equipmentUsageSheetId" },
    });
  });

  it("closes an open hindrance once", async () => {
    const ctx = await setup();
    const open = await json<Hindrance>(await record(ctx, { hoursLost: "2" }));
    const early = await close(
      post(`/${open.id}/close`, {
        endDate: addDays(TODAY, -4),
        expectedUpdatedAt: open.updatedAt,
      }),
      params(open.id),
    );
    expect((await json<ErrorBody>(early)).code).toBe(
      "HINDRANCE_END_BEFORE_START",
    );
    const closed = await close(
      post(`/${open.id}/close`, {
        endDate: addDays(TODAY, -2),
        hoursLost: "12",
        expectedUpdatedAt: open.updatedAt,
      }),
      params(open.id),
    );
    expect(closed.status).toBe(StatusCodes.OK);
    const body = await json<Hindrance>(closed);
    expect(body).toMatchObject({
      status: "closed",
      endDate: addDays(TODAY, -2),
      hoursLost: "12",
      daysLost: 2,
      actions: { close: false, edit: true },
    });
    const again = await close(
      post(`/${open.id}/close`, {
        endDate: TODAY,
        expectedUpdatedAt: body.updatedAt,
      }),
      params(open.id),
    );
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(again)).code).toBe("HINDRANCE_CLOSED");
  });

  it("filters by status, cause, party, contractor, overlap and search", async () => {
    const ctx = await setup();
    await record(ctx, {
      affectedActivity: "A rain",
      startDate: addDays(TODAY, -20),
      endDate: addDays(TODAY, -15),
    });
    await record(ctx, {
      affectedActivity: "B labour",
      cause: "labour_shortage",
      responsibleParty: "contractor",
      contractorId: ctx.contractorId,
      startDate: addDays(TODAY, -10),
    });
    await record(ctx, {
      affectedActivity: "C drawings",
      cause: "drawing_delay",
      responsibleParty: "consultant",
      startDate: addDays(TODAY, -5),
      endDate: addDays(TODAY, -4),
    });

    expect(await filter(ctx, "status=open")).toEqual(["B labour"]);
    expect(await filter(ctx, "status=closed")).toEqual([
      "A rain",
      "C drawings",
    ]);
    expect(await filter(ctx, "cause=drawing_delay")).toEqual(["C drawings"]);
    expect(await filter(ctx, "responsibleParty=contractor")).toEqual([
      "B labour",
    ]);
    expect(await filter(ctx, `contractorId=${ctx.contractorId}`)).toEqual([
      "B labour",
    ]);
    // Overlapping a range: A ended before it, B is open, C is inside it.
    expect(
      await filter(ctx, `from=${addDays(TODAY, -14)}&to=${addDays(TODAY, -4)}`),
    ).toEqual(["B labour", "C drawings"]);
    expect(await filter(ctx, `to=${addDays(TODAY, -16)}`)).toEqual(["A rain"]);
    expect(await filter(ctx, `from=${addDays(TODAY, -3)}`)).toEqual([
      "B labour",
    ]);
    expect(await filter(ctx, "search=draw")).toEqual(["C drawings"]);
    expect(await filter(ctx, "search=00001")).toEqual(["A rain"]);
  });

  it("stores no location as SQL NULL, on create and on edit", async () => {
    const ctx = await setup();
    const h = await json<Hindrance>(await record(ctx));
    const isNull = async () => {
      const [row] = await prisma.$queryRaw<{ empty: boolean }[]>(
        Prisma.sql`SELECT site_location IS NULL AS empty
          FROM construction_site_work.hindrances WHERE id = ${h.id}::uuid`,
      );
      return row?.empty;
    };
    expect(await isNull()).toBe(true);
    // A location written earlier is cleared to NULL by an edit without one.
    const stored = await prisma.constructionSiteWorkHindrance.update({
      where: { id: h.id },
      data: {
        siteLocation: { type: "location", locationId: newId() },
        siteLocationType: "location",
      },
    });
    expect(await isNull()).toBe(false);
    const saved = await update(
      post(`/${h.id}/update`, {
        startDate: h.startDate,
        cause: "weather",
        affectedActivity: "Roof slab shuttering",
        responsibleParty: "force_majeure",
        siteLocation: null,
        expectedUpdatedAt: stored.updatedAt.toISOString(),
      }),
      params(h.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    expect(
      (await json<{ siteLocation: unknown }>(saved)).siteLocation,
    ).toBeNull();
    expect(await isNull()).toBe(true);
  });

  it("checks the concurrency token on update and delete", async () => {
    const ctx = await setup();
    const h = await json<Hindrance>(await record(ctx));
    const saved = await update(
      post(`/${h.id}/update`, {
        startDate: h.startDate,
        cause: "power_water",
        affectedActivity: "Curing",
        responsibleParty: "client",
        expectedUpdatedAt: h.updatedAt,
      }),
      params(h.id),
    );
    expect(saved.status).toBe(StatusCodes.OK);
    expect(await json<Hindrance>(saved)).toMatchObject({
      cause: "power_water",
      affectedActivity: "Curing",
      number: h.number,
    });
    const stale = await update(
      post(`/${h.id}/update`, {
        startDate: h.startDate,
        cause: "weather",
        affectedActivity: "Curing",
        responsibleParty: "client",
        expectedUpdatedAt: h.updatedAt,
      }),
      params(h.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("HINDRANCE_CHANGED");
    const staleDelete = await remove(
      post(`/${h.id}/delete`, { expectedUpdatedAt: h.updatedAt }),
      params(h.id),
    );
    expect(staleDelete.status).toBe(StatusCodes.CONFLICT);
    const fresh = await json<Hindrance>(
      await getOne(get(`/${h.id}`), params(h.id)),
    );
    const gone = await remove(
      post(`/${h.id}/delete`, { expectedUpdatedAt: fresh.updatedAt }),
      params(h.id),
    );
    expect(gone.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${h.id}`), params(h.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // The number is not reused.
    expect((await json<Hindrance>(await record(ctx))).number).toMatch(
      /\/00002$/,
    );
  });

  it("applies the back-dated limit to the start date", async () => {
    const ctx = await setup();
    const old = await json<Hindrance>(
      await record(ctx, { startDate: addDays(TODAY, -30) }),
    );
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: ctx.company.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          hindrance: {
            mode: "custom",
            create: { days: 3, overrideDesignationIds: [] },
            edit: { days: 3, overrideDesignationIds: [] },
          },
        },
        createdBy: ctx.company.ownerId,
        updatedBy: ctx.company.ownerId,
      },
    });
    actAs(await member(ctx, ["read", "create", "update"]));
    const created = await record(ctx, { startDate: addDays(TODAY, -10) });
    expect(created.status).toBe(StatusCodes.FORBIDDEN);
    expect((await json<ErrorBody>(created)).code).toBe(
      "BACKDATED_CREATE_BLOCKED",
    );
    const edited = await update(
      post(`/${old.id}/update`, {
        startDate: old.startDate,
        cause: "weather",
        affectedActivity: "Changed",
        responsibleParty: "force_majeure",
        expectedUpdatedAt: old.updatedAt,
      }),
      params(old.id),
    );
    expect((await json<ErrorBody>(edited)).code).toBe("BACKDATED_EDIT_BLOCKED");
    // Close checks the end date, so a long hindrance can still be closed.
    const closed = await close(
      post(`/${old.id}/close`, {
        endDate: TODAY,
        expectedUpdatedAt: old.updatedAt,
      }),
      params(old.id),
    );
    expect(closed.status).toBe(StatusCodes.OK);
  });

  it("follows the Permission Matrix on the Project", async () => {
    const ctx = await setup();
    const h = await json<Hindrance>(await record(ctx));
    actAs(await member(ctx, ["read"]));
    const denied = await record(ctx);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    // Access comes before validation: no details for a caller without it.
    const invalid = await record(ctx, { cause: "not-a-cause" });
    expect(invalid.status).toBe(StatusCodes.FORBIDDEN);
    const read = await json<Hindrance>(
      await getOne(get(`/${h.id}`), params(h.id)),
    );
    expect(read.actions).toEqual({
      edit: false,
      close: false,
      delete: false,
      print: false,
    });
    expect(
      (
        await close(
          post(`/${h.id}/close`, {
            endDate: TODAY,
            expectedUpdatedAt: h.updatedAt,
          }),
          params(h.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read", "create"], false));
    expect((await list(get(`?projectId=${ctx.projectId}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await list(get(`?projectId=${ctx.projectId}&status=bogus`))).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("gives the DPR the hindrances on a date", async () => {
    const ctx = await setup();
    await record(ctx, {
      affectedActivity: "Ended before",
      startDate: addDays(TODAY, -9),
      endDate: addDays(TODAY, -6),
    });
    await record(ctx, {
      affectedActivity: "Ends on the day",
      startDate: addDays(TODAY, -7),
      endDate: addDays(TODAY, -5),
      signOff: { partyName: "Suresh", signedOn: addDays(TODAY, -5) },
    });
    await record(ctx, {
      affectedActivity: "Still open",
      startDate: addDays(TODAY, -6),
      cause: "material_shortage",
      responsibleParty: "supplier",
    });
    await record(ctx, {
      affectedActivity: "Later",
      startDate: addDays(TODAY, -4),
    });
    const reads = createSiteRecordQueries();
    const on = await reads.hindrancesOn(
      ctx.company.workspaceId,
      ctx.projectId,
      addDays(TODAY, -5),
    );
    expect(on.map((h) => [h.affectedActivity, h.status, h.daysLost])).toEqual([
      ["Ends on the day", "closed", 3],
      ["Still open", "open", 2],
    ]);
    expect(on[1]).toMatchObject({
      causeLabel: "Material shortage",
      responsiblePartyLabel: "Supplier",
    });
    expect(on[0]?.signOff).toMatchObject({ partyName: "Suresh" });
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/site-work/hindrances",
      "/api/construction/site-work/hindrances/form-options",
      "/api/construction/site-work/hindrances/{id}",
      "/api/construction/site-work/hindrances/{id}/update",
      "/api/construction/site-work/hindrances/{id}/close",
      "/api/construction/site-work/hindrances/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
