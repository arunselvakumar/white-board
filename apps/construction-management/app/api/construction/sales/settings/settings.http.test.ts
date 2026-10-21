import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { salesInquiryRow, salesLists, salesProject } from "@/test/sales";
import { sharedAssign } from "@/test/site-work";

import { POST as deleteStage } from "./funnel-stages/[id]/delete/route";
import { POST as moveStage } from "./funnel-stages/[id]/move/route";
import { POST as renameStage } from "./funnel-stages/[id]/update/route";
import { POST as createStage } from "./funnel-stages/route";
import { POST as deleteSource } from "./lead-sources/[id]/delete/route";
import { POST as disableSource } from "./lead-sources/[id]/disable/route";
import { POST as enableSource } from "./lead-sources/[id]/enable/route";
import { POST as renameSource } from "./lead-sources/[id]/update/route";
import { POST as createSource } from "./lead-sources/route";
import { POST as deleteReason } from "./lost-reasons/[id]/delete/route";
import { POST as createReason } from "./lost-reasons/route";
import { GET as getSettings } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/sales/settings";

type Stage = {
  id: string;
  name: string;
  isSeed: boolean;
  sortOrder: number;
  openCount: number;
  updatedAt: string;
};
type Pick = {
  id: string;
  name: string;
  isActive: boolean;
  usedCount: number;
  updatedAt: string;
};
type Settings = {
  funnelStages: Stage[];
  leadSources: Pick[];
  lostReasons: Pick[];
  canManage: boolean;
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
  const projectId = await salesProject(ws, by, "Green Meadows");
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  actAs(owner);
  return { ws, by, owner, projectId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[], onProject = true) {
  const added = await addMember(ctx.ws, ctx.by, { "sales.inquiries": flags });
  if (onProject) await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

async function read(ctx: Ctx): Promise<Settings> {
  const response = await getSettings(
    new Request(`${BASE}?projectId=${ctx.projectId}`),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Settings>(response);
}

const stageNames = (settings: Settings) =>
  settings.funnelStages.map((stage) => stage.name);

describe("Sales settings (CM-1002)", () => {
  it("reads the seeded lists, in funnel order and by name", async () => {
    const ctx = await setup();
    const settings = await read(ctx);
    expect(stageNames(settings)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    expect(settings.funnelStages.map((stage) => stage.sortOrder)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(settings.leadSources.map((source) => source.name)).toEqual([
      "Hoarding",
      "Property portal",
      "Referral",
      "Social media",
      "Walk-in",
      "Website",
    ]);
    expect(settings.lostReasons).toHaveLength(5);
    expect(settings.funnelStages[0]).toMatchObject({
      isSeed: true,
      openCount: 0,
    });
    expect(settings.canManage).toBe(true);
  });

  it("seeds a Project whose seed failed when its lists are read, but never refills them", async () => {
    const ctx = await setup();
    const unseeded = await addProject(ctx.ws, ctx.by, "Seed failed");
    const read = (projectId: string) =>
      getSettings(new Request(`${BASE}?projectId=${projectId}`)).then((r) =>
        json<Settings>(r),
      );
    const healed = await read(unseeded);
    expect(stageNames(healed)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    expect(healed.leadSources).toHaveLength(6);
    expect(healed.lostReasons).toHaveLength(5);
    expect(
      await prisma.constructionSalesFunnelStage.count({
        where: { projectId: unseeded },
      }),
    ).toBe(4);

    await prisma.constructionSalesLeadSource.updateMany({
      where: { projectId: unseeded },
      data: { deletedAt: new Date() },
    });
    expect((await read(unseeded)).leadSources).toEqual([]);
  });

  it("needs Inquiry read to see them and Update to change them", async () => {
    const ctx = await setup();
    actAs(await member(ctx, ["read"]));
    const settings = await read(ctx);
    expect(settings.canManage).toBe(false);
    const refused = await createStage(
      post("/funnel-stages", { projectId: ctx.projectId, name: "Booked" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    const [stage] = settings.funnelStages;
    if (stage == null) throw new Error("seeded");
    const rename = await renameStage(
      post(`/funnel-stages/${stage.id}/update`, {
        name: "Fresh",
        expectedUpdatedAt: stage.updatedAt,
      }),
      params(stage.id),
    );
    expect(rename.status).toBe(StatusCodes.FORBIDDEN);

    actAs(await member(ctx, [], true));
    const none = await getSettings(
      new Request(`${BASE}?projectId=${ctx.projectId}`),
    );
    expect(none.status).toBe(StatusCodes.FORBIDDEN);

    actAs(await member(ctx, ["read", "update"], false));
    const offProject = await getSettings(
      new Request(`${BASE}?projectId=${ctx.projectId}`),
    );
    expect(offProject.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("answers 404 for another Company's Project and rows", async () => {
    const ctx = await setup();
    const { stages } = await salesLists(ctx.projectId);
    const other = await newCompany();
    actAs({ userId: other.ownerId, workspaceId: other.workspaceId });
    const response = await getSettings(
      new Request(`${BASE}?projectId=${ctx.projectId}`),
    );
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<ErrorBody>(response)).code).toBe("PROJECT_NOT_FOUND");
    const stage = stages[0];
    if (stage == null) throw new Error("seeded");
    const rename = await renameStage(
      post(`/funnel-stages/${stage.id}/update`, {
        name: "Mine",
        expectedUpdatedAt: stage.updatedAt.toISOString(),
      }),
      params(stage.id),
    );
    expect(rename.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<ErrorBody>(rename)).code).toBe("FUNNEL_STAGE_NOT_FOUND");
  });

  it("adds a stage last, with names unique ignoring case, and audits it", async () => {
    const ctx = await setup();
    const created = await createStage(
      post("/funnel-stages", {
        projectId: ctx.projectId,
        name: "  Token   paid ",
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const stage = await json<Stage>(created);
    expect(stage).toMatchObject({
      name: "Token paid",
      sortOrder: 5,
      isSeed: false,
    });
    const taken = await createStage(
      post("/funnel-stages", { projectId: ctx.projectId, name: "site visit" }),
    );
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(taken)).toMatchObject({
      code: "FUNNEL_STAGE_NAME_IN_USE",
      details: { field: "name" },
    });
    const empty = await createStage(
      post("/funnel-stages", { projectId: ctx.projectId, name: "   " }),
    );
    expect(empty.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<ErrorBody>(empty)).code).toBe(
      "FUNNEL_STAGE_NAME_REQUIRED",
    );
    const long = await createStage(
      post("/funnel-stages", {
        projectId: ctx.projectId,
        name: "x".repeat(61),
      }),
    );
    expect((await json<ErrorBody>(long)).code).toBe(
      "FUNNEL_STAGE_NAME_TOO_LONG",
    );
    // The same name in another Project is fine.
    const otherProject = await salesProject(ctx.ws, ctx.by);
    const elsewhere = await createStage(
      post("/funnel-stages", { projectId: otherProject, name: "Token paid" }),
    );
    expect(elsewhere.status).toBe(StatusCodes.CREATED);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { workspaceId: ctx.ws, entityId: stage.id },
    });
    expect(audit?.action).toBe("sales_funnel_stage.created");
  });

  it("renames with the updatedAt it loaded", async () => {
    const ctx = await setup();
    const [first, second] = (await read(ctx)).funnelStages as [Stage, Stage];
    const renamed = await renameStage(
      post(`/funnel-stages/${first.id}/update`, {
        name: "Fresh lead",
        expectedUpdatedAt: first.updatedAt,
      }),
      params(first.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    expect((await json<Stage>(renamed)).name).toBe("Fresh lead");
    const stale = await renameStage(
      post(`/funnel-stages/${first.id}/update`, {
        name: "Again",
        expectedUpdatedAt: first.updatedAt,
      }),
      params(first.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(stale)).code).toBe("FUNNEL_STAGE_CHANGED");
    const taken = await renameStage(
      post(`/funnel-stages/${second.id}/update`, {
        name: "FRESH LEAD",
        expectedUpdatedAt: second.updatedAt,
      }),
      params(second.id),
    );
    expect((await json<ErrorBody>(taken)).code).toBe(
      "FUNNEL_STAGE_NAME_IN_USE",
    );
    // A change of case on its own name is allowed.
    const recased = await renameStage(
      post(`/funnel-stages/${second.id}/update`, {
        name: "CONTACTED",
        expectedUpdatedAt: second.updatedAt,
      }),
      params(second.id),
    );
    expect(recased.status).toBe(StatusCodes.OK);
  });

  it("moves a stage up and down; the ends change nothing", async () => {
    const ctx = await setup();
    const stages = (await read(ctx)).funnelStages;
    const [newStage, , siteVisit, negotiation] = stages;
    if (newStage == null || siteVisit == null || negotiation == null)
      throw new Error("seeded");
    const up = await moveStage(
      post(`/funnel-stages/${siteVisit.id}/move`, { direction: "up" }),
      params(siteVisit.id),
    );
    expect(up.status).toBe(StatusCodes.OK);
    const moved = await json<{ items: Stage[] }>(up);
    expect(moved.items.map((stage) => stage.name)).toEqual([
      "New",
      "Site Visit",
      "Contacted",
      "Negotiation",
    ]);
    expect(moved.items.map((stage) => stage.sortOrder)).toEqual([1, 2, 3, 4]);
    await moveStage(
      post(`/funnel-stages/${newStage.id}/move`, { direction: "down" }),
      params(newStage.id),
    );
    expect(stageNames(await read(ctx))).toEqual([
      "Site Visit",
      "New",
      "Contacted",
      "Negotiation",
    ]);
    const edge = await moveStage(
      post(`/funnel-stages/${negotiation.id}/move`, { direction: "down" }),
      params(negotiation.id),
    );
    expect(edge.status).toBe(StatusCodes.OK);
    expect(stageNames(await read(ctx))).toEqual([
      "Site Visit",
      "New",
      "Contacted",
      "Negotiation",
    ]);
    // A move does not touch stages whose place stays.
    const untouched = (await read(ctx)).funnelStages.find(
      (stage) => stage.id === negotiation.id,
    );
    expect(untouched?.updatedAt).toBe(negotiation.updatedAt);
  });

  it("refuses to delete a stage with Open inquiries, or the last one", async () => {
    const ctx = await setup();
    const { stageId } = await salesLists(ctx.projectId);
    const contacted = stageId["Contacted"] ?? "";
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      funnelStageId: contacted,
    });
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      funnelStageId: contacted,
    });
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      funnelStageId: contacted,
      status: "lost",
    });
    expect(
      (await read(ctx)).funnelStages.find((stage) => stage.id === contacted)
        ?.openCount,
    ).toBe(2);
    const inUse = await deleteStage(
      post(`/funnel-stages/${contacted}/delete`),
      params(contacted),
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(inUse)).toMatchObject({
      code: "FUNNEL_STAGE_IN_USE",
      details: { openCount: 2 },
    });
    // Only closed inquiries in it: it goes, and the rest are renumbered.
    const siteVisit = stageId["Site Visit"] ?? "";
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      funnelStageId: siteVisit,
      status: "converted",
    });
    const gone = await deleteStage(
      post(`/funnel-stages/${siteVisit}/delete`),
      params(siteVisit),
    );
    expect(gone.status).toBe(StatusCodes.NO_CONTENT);
    const after = await read(ctx);
    expect(stageNames(after)).toEqual(["New", "Contacted", "Negotiation"]);
    expect(after.funnelStages.map((stage) => stage.sortOrder)).toEqual([
      1, 2, 3,
    ]);
    for (const name of ["New", "Negotiation"]) {
      const id = stageId[name] ?? "";
      expect(
        (await deleteStage(post(`/funnel-stages/${id}/delete`), params(id)))
          .status,
      ).toBe(StatusCodes.NO_CONTENT);
    }
    await prisma.constructionSalesInquiry.updateMany({
      where: { projectId: ctx.projectId },
      data: { status: "lost" },
    });
    const last = await deleteStage(
      post(`/funnel-stages/${contacted}/delete`),
      params(contacted),
    );
    expect(last.status).toBe(StatusCodes.CONFLICT);
    expect((await json<ErrorBody>(last)).code).toBe("FUNNEL_STAGE_LAST");
  });

  it("disables, enables and deletes Lead Sources and Lost Reasons", async () => {
    const ctx = await setup();
    const { sourceId, reasonId } = await salesLists(ctx.projectId);
    const walkIn = sourceId["Walk-in"] ?? "";
    const disabled = await disableSource(
      post(`/lead-sources/${walkIn}/disable`),
      params(walkIn),
    );
    expect(disabled.status).toBe(StatusCodes.OK);
    expect((await json<Pick>(disabled)).isActive).toBe(false);
    const enabled = await enableSource(
      post(`/lead-sources/${walkIn}/enable`),
      params(walkIn),
    );
    const enabledBody = await json<Pick>(enabled);
    expect(enabledBody.isActive).toBe(true);

    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      leadSourceId: walkIn,
    });
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      leadSourceId: walkIn,
      status: "lost",
    });
    // A deleted inquiry does not count.
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      leadSourceId: walkIn,
      deletedAt: new Date(),
    });
    const inUse = await deleteSource(
      post(`/lead-sources/${walkIn}/delete`),
      params(walkIn),
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json<ErrorBody>(inUse)).toMatchObject({
      code: "LEAD_SOURCE_IN_USE",
      details: { count: 2 },
    });
    const hoarding = sourceId["Hoarding"] ?? "";
    expect(
      (
        await deleteSource(
          post(`/lead-sources/${hoarding}/delete`),
          params(hoarding),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    // The name is free again once deleted.
    const again = await createSource(
      post("/lead-sources", { projectId: ctx.projectId, name: "hoarding" }),
    );
    expect(again.status).toBe(StatusCodes.CREATED);
    const renamed = await renameSource(
      post(`/lead-sources/${walkIn}/update`, {
        name: "Walk in",
        expectedUpdatedAt: enabledBody.updatedAt,
      }),
      params(walkIn),
    );
    expect(renamed.status).toBe(StatusCodes.OK);

    const budget = reasonId["Budget"] ?? "";
    await salesInquiryRow(ctx.ws, ctx.projectId, ctx.by, {
      status: "lost",
      lostReasonId: budget,
    });
    const reasonInUse = await deleteReason(
      post(`/lost-reasons/${budget}/delete`),
      params(budget),
    );
    expect(await json<ErrorBody>(reasonInUse)).toMatchObject({
      code: "LOST_REASON_IN_USE",
      details: { count: 1 },
    });
    const reason = await createReason(
      post("/lost-reasons", { projectId: ctx.projectId, name: "BUDGET" }),
    );
    expect((await json<ErrorBody>(reason)).code).toBe(
      "LOST_REASON_NAME_IN_USE",
    );
  });

  it("is on /api/docs", async () => {
    const doc = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
    };
    for (const path of [
      "/api/construction/sales/settings",
      "/api/construction/sales/settings/funnel-stages",
      "/api/construction/sales/settings/funnel-stages/{id}/move",
      "/api/construction/sales/settings/lead-sources/{id}/disable",
      "/api/construction/sales/settings/lost-reasons/{id}/delete",
    ])
      expect(doc.paths).toHaveProperty([path]);
  });
});
