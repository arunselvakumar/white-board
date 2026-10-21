import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { measureBoqItem } from "@/test/contracts";
import { watchEvents } from "@/test/dispatched-events";
import { unitNamed } from "@/test/procurement";
import { sharedAssign } from "@/test/site-work";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
  ConstructionContractsVariationModel,
  GetConstructionContractsBoqItemResponseModel,
  GetConstructionContractsBoqResponseModel,
  ListConstructionContractsVariationsResponseModel,
} from "./boq-models";
import { GET as deviationsRoute } from "./deviations/route";
import { POST as deleteItemRoute } from "./items/[id]/delete/route";
import { GET as getItemRoute } from "./items/[id]/route";
import { POST as createItemRoute } from "./items/route";
import { GET as boqRoute } from "./route";
import { POST as deleteSectionRoute } from "./sections/[id]/delete/route";
import { POST as createSectionRoute } from "./sections/route";
import { POST as approveRoute } from "./variations/[id]/approve/route";
import { POST as deleteRoute } from "./variations/[id]/delete/route";
import { POST as rejectRoute } from "./variations/[id]/reject/route";
import { GET as getRoute } from "./variations/[id]/route";
import { POST as updateRoute } from "./variations/[id]/update/route";
import { GET as listRoute, POST as createRoute } from "./variations/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE = "http://localhost/api/construction/contracts/boq";

type Variation = ConstructionContractsVariationModel;
type Item = ConstructionContractsBoqItemModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(response: Response): Promise<{ code: string }> {
  return json<{ code: string }>(response);
}

const request = (url: string, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const api = {
  create: (body: Record<string, unknown>) =>
    createRoute(request(`${BASE}/variations`, body)),
  list: (query: string) => listRoute(request(`${BASE}/variations?${query}`)),
  get: (id: string) =>
    getRoute(request(`${BASE}/variations/${id}`), params(id)),
  update: (id: string, body: Record<string, unknown>) =>
    updateRoute(request(`${BASE}/variations/${id}/update`, body), params(id)),
  remove: (id: string) =>
    deleteRoute(request(`${BASE}/variations/${id}/delete`, {}), params(id)),
  approve: (id: string) =>
    approveRoute(request(`${BASE}/variations/${id}/approve`, {}), params(id)),
  reject: (id: string, reason: string) =>
    rejectRoute(
      request(`${BASE}/variations/${id}/reject`, { reason }),
      params(id),
    ),
};

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by);
  const cum = await unitNamed(ws, by, "cum");
  actAs(owner);
  const section = await json<ConstructionContractsBoqSectionResponseModel>(
    await createSectionRoute(
      request(`${BASE}/sections`, { projectId, title: "Earthwork" }),
    ),
  );
  const addItem = async (itemNo: string, quantity = "100", rate = 450_00) => {
    const response = await createItemRoute(
      request(`${BASE}/items`, {
        projectId,
        sectionId: section.id,
        itemNo,
        description: `Item ${itemNo}`,
        uomId: cum,
        quantity,
        rate,
      }),
    );
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<Item>(response);
  };
  const item = await addItem("1.1");
  const created = async (body: Record<string, unknown>) => {
    const response = await api.create({ projectId, ...body });
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      StatusCodes.CREATED,
    );
    return json<Variation>(response);
  };
  const boq = async () =>
    json<GetConstructionContractsBoqResponseModel>(
      await boqRoute(request(`${BASE}?projectId=${projectId}`)),
    );
  return {
    ws,
    by,
    owner,
    projectId,
    cum,
    section,
    item,
    addItem,
    created,
    boq,
  };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(ctx: Ctx, flags: Flag[]) {
  const added = await addMember(ctx.ws, ctx.by, { "contracts.boq": flags });
  await sharedAssign(added.memberId, ctx.projectId);
  return { userId: added.userId, workspaceId: ctx.ws, role: "member" as const };
}

describe("Variations (CM-1103)", () => {
  it("numbers each Variation from the variation sequence rule and asks for approval", async () => {
    const ctx = await setup();
    const events = watchEvents();
    const first = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "130",
      reason: "  Deeper foundations  ",
    });
    expect(first).toMatchObject({
      kind: "quantity",
      status: "pending_approval",
      boqItemId: ctx.item.id,
      boqItemNo: "1.1",
      previousQuantity: "100.0000",
      newQuantity: "130.0000",
      reason: "Deeper foundations",
      uomName: "cum",
      sectionTitle: "Earthwork",
      createdByName: "Arun Selva Kumar",
    });
    expect(first.number).toMatch(/^VAR\/\d{2}-\d{2}\/00001$/);
    const other = await ctx.addItem("1.2");
    const second = await ctx.created({
      kind: "rate",
      boqItemId: other.id,
      newRate: 480_00,
      reason: "Rate revised",
    });
    expect(second.number).toMatch(/00002$/);
    expect(events.of("document.submitted")).toEqual([
      expect.objectContaining({
        documentType: "variation",
        documentId: first.id,
        projectId: ctx.projectId,
        number: first.number,
      }),
      expect.objectContaining({ documentId: second.id }),
    ]);
    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { entityId: first.id },
    });
    expect(audit.map((row) => row.action)).toEqual(["variation.created"]);
  });

  it("allows one pending quantity or rate change per item", async () => {
    const ctx = await setup();
    const pending = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "130",
      reason: "More",
    });
    for (const body of [
      { kind: "quantity", newQuantity: "140" },
      { kind: "rate", newRate: 1 },
    ]) {
      const refused = await api.create({
        projectId: ctx.projectId,
        boqItemId: ctx.item.id,
        reason: "Again",
        ...body,
      });
      expect(refused.status).toBe(StatusCodes.CONFLICT);
      expect(await json(refused)).toMatchObject({
        code: "VARIATION_PENDING",
        details: { number: pending.number },
      });
    }
    // The item shows it, and cannot be deleted while it waits.
    expect((await ctx.boq()).sections[0]?.items[0]?.pendingVariation).toEqual({
      id: pending.id,
      number: pending.number,
      kind: "quantity",
    });
    const deleted = await deleteItemRoute(
      request(`${BASE}/items/${ctx.item.id}/delete`, {}),
      params(ctx.item.id),
    );
    expect(await errorOf(deleted)).toMatchObject({ code: "VARIATION_PENDING" });
    // Once decided, another may be raised.
    expect((await api.reject(pending.id, "Not agreed")).status).toBe(
      StatusCodes.OK,
    );
    await ctx.created({
      kind: "rate",
      boqItemId: ctx.item.id,
      newRate: 500_00,
      reason: "Rate",
    });
  });

  it("applies an approved quantity change and keeps what it replaced", async () => {
    const ctx = await setup();
    const events = watchEvents();
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: ctx.item.id,
      quantity: "140",
    });
    const variation = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "140",
      reason: "Measured more",
    });
    const approved = await api.approve(variation.id);
    expect(approved.status).toBe(StatusCodes.OK);
    expect(await json(approved)).toMatchObject({
      status: "approved",
      previousQuantity: "100.0000",
      newQuantity: "140.0000",
      decidedBy: ctx.by,
      decidedByName: "Arun Selva Kumar",
    });
    const item = (await ctx.boq()).sections[0]?.items[0];
    expect(item).toMatchObject({
      originalQuantity: "100.0000",
      quantity: "140.0000",
      // 140 × ₹450 = ₹63,000.
      amount: 63_000_00,
      measured: true,
      pendingVariation: null,
    });
    // Within the limit now, so off the deviation list.
    expect(
      (
        await json<{ items: unknown[] }>(
          await deviationsRoute(
            request(`${BASE}/deviations?projectId=${ctx.projectId}`),
          ),
        )
      ).items,
    ).toEqual([]);
    expect(events.of("document.approved")).toEqual([
      expect.objectContaining({
        documentType: "variation",
        documentId: variation.id,
        approvedBy: ctx.by,
        createdBy: ctx.by,
      }),
    ]);
    // Decided: no second decision.
    const again = await api.approve(variation.id);
    expect(again.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(again)).toMatchObject({
      code: "VARIATION_NOT_PENDING",
    });
    // Each item lists its Variations.
    const detail = await json<GetConstructionContractsBoqItemResponseModel>(
      await getItemRoute(
        request(`${BASE}/items/${ctx.item.id}`),
        params(ctx.item.id),
      ),
    );
    expect(detail.variations.map((row) => row.number)).toEqual([
      variation.number,
    ]);
  });

  it("applies an approved rate change", async () => {
    const ctx = await setup();
    const variation = await ctx.created({
      kind: "rate",
      boqItemId: ctx.item.id,
      newRate: 475_50,
      reason: "Escalated",
    });
    expect(variation).toMatchObject({ previousRate: 450_00, newRate: 475_50 });
    await api.approve(variation.id);
    const item = (await ctx.boq()).sections[0]?.items[0];
    expect(item).toMatchObject({
      originalRate: 450_00,
      rate: 475_50,
      quantity: "100.0000",
    });
  });

  it("adds an extra item on approval with the Variation's figures as its original ones", async () => {
    const ctx = await setup();
    const taken = await api.create({
      projectId: ctx.projectId,
      kind: "extra_item",
      sectionId: ctx.section.id,
      itemNo: "1.1",
      description: "Sump",
      uomId: ctx.cum,
      newQuantity: "40",
      newRate: 1000_00,
      reason: "Client asked",
    });
    expect(await errorOf(taken)).toMatchObject({ code: "BOQ_ITEM_NO_TAKEN" });
    const extra = await ctx.created({
      kind: "extra_item",
      sectionId: ctx.section.id,
      itemNo: "1.9",
      description: "Sump excavation",
      uomId: ctx.cum,
      sacHsn: "995411",
      newQuantity: "40",
      newRate: 1000_00,
      reason: "Client asked for a sump",
    });
    expect(extra).toMatchObject({ boqItemId: null, itemNo: "1.9" });
    // Another pending extra item cannot take its number.
    const twin = await api.create({
      projectId: ctx.projectId,
      kind: "extra_item",
      sectionId: ctx.section.id,
      itemNo: "1.9",
      description: "Twin",
      uomId: ctx.cum,
      newQuantity: "1",
      newRate: 1,
      reason: "x",
    });
    expect(await errorOf(twin)).toMatchObject({ code: "BOQ_ITEM_NO_TAKEN" });
    // Its section cannot be deleted while it waits (it has an item anyway).
    const approved = await json<Variation>(await api.approve(extra.id));
    expect(approved.boqItemId).not.toBeNull();
    const added = (await ctx.boq()).sections[0]?.items.find(
      (row) => row.itemNo === "1.9",
    );
    expect(added).toMatchObject({
      id: approved.boqItemId,
      variationId: extra.id,
      originalQuantity: "40.0000",
      quantity: "40.0000",
      originalRate: 1000_00,
      rate: 1000_00,
      amount: 40_000_00,
      sacHsn: "995411",
    });
  });

  it("keeps a section with a pending extra item", async () => {
    const ctx = await setup();
    const empty = await json<ConstructionContractsBoqSectionResponseModel>(
      await createSectionRoute(
        request(`${BASE}/sections`, {
          projectId: ctx.projectId,
          title: "Extras",
        }),
      ),
    );
    const extra = await ctx.created({
      kind: "extra_item",
      sectionId: empty.id,
      itemNo: "9.1",
      description: "Extra",
      uomId: ctx.cum,
      newQuantity: "1",
      newRate: 100,
      reason: "x",
    });
    const refused = await deleteSectionRoute(
      request(`${BASE}/sections/${empty.id}/delete`, {}),
      params(empty.id),
    );
    expect(await json(refused)).toMatchObject({
      code: "VARIATION_PENDING",
      details: { number: extra.number },
    });
  });

  it("rejects with a reason only", async () => {
    const ctx = await setup();
    const events = watchEvents();
    const variation = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "90",
      reason: "Less",
    });
    const blank = await api.reject(variation.id, "  ");
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await errorOf(blank)).toMatchObject({
      code: "REJECTION_REASON_REQUIRED",
    });
    const rejected = await json<Variation>(
      await api.reject(variation.id, "Not in the contract"),
    );
    expect(rejected).toMatchObject({
      status: "rejected",
      rejectReason: "Not in the contract",
    });
    expect((await ctx.boq()).sections[0]?.items[0]?.quantity).toBe("100.0000");
    expect(events.of("document.rejected")).toEqual([
      expect.objectContaining({ reason: "Not in the contract" }),
    ]);
    expect(await errorOf(await api.approve(variation.id))).toMatchObject({
      code: "VARIATION_NOT_PENDING",
    });
    // A decided Variation is no longer edited or deleted.
    expect(await errorOf(await api.remove(variation.id))).toMatchObject({
      code: "VARIATION_NOT_PENDING",
    });
  });

  it("is edited or deleted while pending by its creator or a holder of Update", async () => {
    const ctx = await setup();
    const raiser = await member(ctx, ["read", "create"]);
    const peer = await member(ctx, ["read", "create"]);
    const editor = await member(ctx, ["read", "update"]);
    actAs(raiser);
    const variation = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "120",
      reason: "More",
    });
    const edited = await api.update(variation.id, {
      boqItemId: ctx.item.id,
      newQuantity: "125.5",
      reason: "More, measured",
      expectedUpdatedAt: variation.updatedAt,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const saved = await json<Variation>(edited);
    expect(saved).toMatchObject({ newQuantity: "125.5000", kind: "quantity" });
    const stale = await api.update(variation.id, {
      boqItemId: ctx.item.id,
      newQuantity: "126",
      reason: "x",
      expectedUpdatedAt: variation.updatedAt,
    });
    expect(await errorOf(stale)).toMatchObject({ code: "VARIATION_CHANGED" });

    actAs(peer);
    expect(
      (
        await api.update(variation.id, {
          boqItemId: ctx.item.id,
          newQuantity: "1",
          reason: "x",
          expectedUpdatedAt: saved.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await api.remove(variation.id)).status).toBe(StatusCodes.FORBIDDEN);

    actAs(editor);
    expect((await api.remove(variation.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await api.get(variation.id)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("needs Approve to approve, Reject to reject and Financial for rates", async () => {
    const ctx = await setup();
    const variation = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "120",
      reason: "More",
    });
    actAs(await member(ctx, ["read", "create", "update", "reject"]));
    expect((await api.approve(variation.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    actAs(await member(ctx, ["read", "approve"]));
    expect((await api.reject(variation.id, "No")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await api.approve(variation.id)).status).toBe(StatusCodes.OK);

    // Without Financial: a quantity change yes, a rate change or an extra
    // item no, and rates read as null.
    actAs(ctx.owner);
    const other = await ctx.addItem("1.2");
    actAs(await member(ctx, ["read", "create"]));
    const rate = await api.create({
      projectId: ctx.projectId,
      kind: "rate",
      boqItemId: other.id,
      newRate: 1,
      reason: "x",
    });
    expect(rate.status).toBe(StatusCodes.FORBIDDEN);
    const list = await json<ListConstructionContractsVariationsResponseModel>(
      await api.list(`projectId=${ctx.projectId}`),
    );
    expect(list.financial).toBe(false);
    const quantity = await ctx.created({
      kind: "quantity",
      boqItemId: other.id,
      newQuantity: "5",
      reason: "x",
    });
    expect(quantity.previousRate).toBeNull();
  });

  it("lists newest first with a status filter and cursors both ways", async () => {
    const ctx = await setup();
    const items = [
      ctx.item,
      await ctx.addItem("1.2"),
      await ctx.addItem("1.3"),
    ];
    const raised: Variation[] = [];
    for (const item of items)
      raised.push(
        await ctx.created({
          kind: "quantity",
          boqItemId: item.id,
          newQuantity: "1",
          reason: "x",
        }),
      );
    await api.approve(raised[0]?.id ?? "");
    const pending =
      await json<ListConstructionContractsVariationsResponseModel>(
        await api.list(`projectId=${ctx.projectId}&status=pending_approval`),
      );
    expect(pending.total).toBe(2);
    expect(pending.items.map((row) => row.id)).toEqual([
      raised[2]?.id,
      raised[1]?.id,
    ]);
    const first = await json<ListConstructionContractsVariationsResponseModel>(
      await api.list(`projectId=${ctx.projectId}&limit=2`),
    );
    expect(first.total).toBe(3);
    expect(first.prevCursor).toBeNull();
    const next = await json<ListConstructionContractsVariationsResponseModel>(
      await api.list(
        `projectId=${ctx.projectId}&limit=2&after=${first.nextCursor ?? ""}`,
      ),
    );
    expect(next.items.map((row) => row.id)).toEqual([raised[0]?.id]);
    const back = await json<ListConstructionContractsVariationsResponseModel>(
      await api.list(
        `projectId=${ctx.projectId}&limit=2&before=${next.prevCursor ?? ""}`,
      ),
    );
    expect(back.items.map((row) => row.id)).toEqual(
      first.items.map((row) => row.id),
    );
  });

  it("answers 404 for another Company's Variation and Project", async () => {
    const ctx = await setup();
    const variation = await ctx.created({
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "2",
      reason: "x",
    });
    const stranger = await newCompany();
    actAs({ userId: stranger.ownerId, workspaceId: stranger.workspaceId });
    expect(await errorOf(await api.approve(variation.id))).toMatchObject({
      code: "VARIATION_NOT_FOUND",
    });
    expect(
      await errorOf(await api.list(`projectId=${ctx.projectId}`)),
    ).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    // A BOQ item of another Project is not found on this one.
    actAs(ctx.owner);
    const other = await addProject(ctx.ws, ctx.by);
    const wrong = await api.create({
      projectId: other,
      kind: "quantity",
      boqItemId: ctx.item.id,
      newQuantity: "2",
      reason: "x",
    });
    expect(await errorOf(wrong)).toMatchObject({ code: "BOQ_ITEM_NOT_FOUND" });
  });
});
