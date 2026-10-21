import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { POST as deleteLibraryItem } from "@/app/api/construction/contracts/items/[id]/delete/route";
import type { Flag } from "@/src/shared-kernel/access";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { addLibraryItem, measureBoqItem } from "@/test/contracts";
import { unitNamed } from "@/test/procurement";
import { salesWing } from "@/test/sales";
import { sharedAssign, worksheetLocation } from "@/test/site-work";

import type {
  ConstructionContractsBoqItemModel,
  ConstructionContractsBoqSectionResponseModel,
  ConstructionContractsBoqSettingsResponseModel,
  GetConstructionContractsBoqItemResponseModel,
  GetConstructionContractsBoqResponseModel,
  ListConstructionContractsBoqDeviationsResponseModel,
  ListConstructionContractsBoqLibraryItemsResponseModel,
} from "./boq-models";
import { GET as deviationsRoute } from "./deviations/route";
import { GET as formOptionsRoute } from "./form-options/route";
import { POST as deleteItemRoute } from "./items/[id]/delete/route";
import { POST as moveItemRoute } from "./items/[id]/move/route";
import { GET as getItemRoute } from "./items/[id]/route";
import { POST as updateItemRoute } from "./items/[id]/update/route";
import { POST as createItemRoute } from "./items/route";
import { GET as libraryRoute } from "./library-items/route";
import { GET as boqRoute } from "./route";
import { POST as deleteSectionRoute } from "./sections/[id]/delete/route";
import { POST as moveSectionRoute } from "./sections/[id]/move/route";
import { POST as renameSectionRoute } from "./sections/[id]/update/route";
import { POST as createSectionRoute } from "./sections/route";
import { GET as settingsRoute } from "./settings/route";
import { POST as updateSettingsRoute } from "./settings/update/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE = "http://localhost/api/construction/contracts/boq";

type Boq = GetConstructionContractsBoqResponseModel;
type Item = ConstructionContractsBoqItemModel;
type Section = ConstructionContractsBoqSectionResponseModel;

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
  boq: (projectId: string) =>
    boqRoute(request(`${BASE}?projectId=${projectId}`)),
  addSection: (projectId: string, title: string) =>
    createSectionRoute(request(`${BASE}/sections`, { projectId, title })),
  renameSection: (id: string, body: Record<string, unknown>) =>
    renameSectionRoute(
      request(`${BASE}/sections/${id}/update`, body),
      params(id),
    ),
  moveSection: (id: string, direction: "up" | "down") =>
    moveSectionRoute(
      request(`${BASE}/sections/${id}/move`, { direction }),
      params(id),
    ),
  deleteSection: (id: string) =>
    deleteSectionRoute(
      request(`${BASE}/sections/${id}/delete`, {}),
      params(id),
    ),
  addItem: (body: Record<string, unknown>) =>
    createItemRoute(request(`${BASE}/items`, body)),
  item: (id: string) =>
    getItemRoute(request(`${BASE}/items/${id}`), params(id)),
  updateItem: (id: string, body: Record<string, unknown>) =>
    updateItemRoute(request(`${BASE}/items/${id}/update`, body), params(id)),
  moveItem: (id: string, direction: "up" | "down") =>
    moveItemRoute(
      request(`${BASE}/items/${id}/move`, { direction }),
      params(id),
    ),
  deleteItem: (id: string, body: unknown = {}) =>
    deleteItemRoute(request(`${BASE}/items/${id}/delete`, body), params(id)),
};

async function setup() {
  const company = await newCompany();
  const ws = company.workspaceId;
  const by = company.ownerId;
  const owner = { userId: by, workspaceId: ws, role: "owner" as const };
  const projectId = await addProject(ws, by);
  const cum = await unitNamed(ws, by, "cum");
  const sqm = await unitNamed(ws, by, "sqm");
  actAs(owner);
  const section = async (title: string) => {
    const response = await api.addSection(projectId, title);
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<Section>(response);
  };
  const item = async (
    sectionId: string,
    body: Partial<Record<string, unknown>> = {},
  ) => {
    const response = await api.addItem({
      projectId,
      sectionId,
      itemNo: "1.1",
      description: "Earthwork in excavation",
      uomId: cum,
      quantity: "450",
      rate: 285_50,
      ...body,
    });
    expect(response.status).toBe(StatusCodes.CREATED);
    return json<Item>(response);
  };
  const boq = async (id = projectId) => {
    const response = await api.boq(id);
    expect(response.status).toBe(StatusCodes.OK);
    return json<Boq>(response);
  };
  return { ws, by, owner, projectId, cum, sqm, section, item, boq };
}

async function member(
  ctx: Awaited<ReturnType<typeof setup>>,
  flags: Flag[],
  options: { onProject?: boolean } = {},
) {
  const added = await addMember(ctx.ws, ctx.by, { "contracts.boq": flags });
  if (options.onProject !== false)
    await sharedAssign(added.memberId, ctx.projectId);
  return {
    userId: added.userId,
    workspaceId: ctx.ws,
    role: "member" as const,
  };
}

describe("BOQ sections (CM-1103)", () => {
  it("starts empty with the Order Value beside a ₹0 total", async () => {
    const ctx = await setup();
    await prisma.constructionProjectsProject.update({
      where: { id: ctx.projectId },
      data: { orderValue: 10_00_000_00n, role: "contract" },
    });
    const boq = await ctx.boq();
    expect(boq).toMatchObject({
      projectId: ctx.projectId,
      role: "contract",
      structure: "wings",
      financial: true,
      deviationLimitPercent: "25.00",
      itemCount: 0,
      total: 0,
      orderValue: 10_00_000_00,
      difference: -10_00_000_00,
      sections: [],
    });
    expect(boq.viewerFlags).toContain("import");
  });

  it("adds sections in order, unique ignoring case, and renames them", async () => {
    const ctx = await setup();
    const earth = await ctx.section("Earthwork");
    const concrete = await ctx.section("  Concrete   work ");
    expect([earth.position, concrete.position]).toEqual([0, 1]);
    expect(concrete.title).toBe("Concrete work");

    const taken = await api.addSection(ctx.projectId, "EARTHWORK");
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(taken)).toMatchObject({
      code: "BOQ_SECTION_TITLE_TAKEN",
    });
    // Another Project may use the same title.
    const other = await addProject(ctx.ws, ctx.by);
    expect((await api.addSection(other, "Earthwork")).status).toBe(
      StatusCodes.CREATED,
    );

    const renamed = await api.renameSection(earth.id, {
      title: "Earthwork & filling",
      expectedUpdatedAt: earth.updatedAt,
    });
    expect(renamed.status).toBe(StatusCodes.OK);
    const stale = await api.renameSection(earth.id, {
      title: "Earth",
      expectedUpdatedAt: earth.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(stale)).toMatchObject({ code: "BOQ_SECTION_CHANGED" });
    const clash = await api.renameSection(concrete.id, {
      title: "earthwork & FILLING",
      expectedUpdatedAt: concrete.updatedAt,
    });
    expect(await errorOf(clash)).toMatchObject({
      code: "BOQ_SECTION_TITLE_TAKEN",
    });
  });

  it("moves a section up and down, and not past either end", async () => {
    const ctx = await setup();
    const a = await ctx.section("A");
    const b = await ctx.section("B");
    const c = await ctx.section("C");
    expect((await api.moveSection(c.id, "up")).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await ctx.boq()).sections.map((s) => s.title)).toEqual([
      "A",
      "C",
      "B",
    ]);
    await api.moveSection(a.id, "up");
    await api.moveSection(b.id, "down");
    expect((await ctx.boq()).sections.map((s) => s.title)).toEqual([
      "A",
      "C",
      "B",
    ]);
    await api.moveSection(a.id, "down");
    expect((await ctx.boq()).sections.map((s) => s.title)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("deletes a section only when it has no live items", async () => {
    const ctx = await setup();
    const section = await ctx.section("Earthwork");
    const item = await ctx.item(section.id);
    const busy = await api.deleteSection(section.id);
    expect(busy.status).toBe(StatusCodes.CONFLICT);
    expect(await json(busy)).toMatchObject({
      code: "BOQ_SECTION_NOT_EMPTY",
      details: { count: 1 },
    });
    expect((await api.deleteItem(item.id)).status).toBe(StatusCodes.NO_CONTENT);
    expect((await api.deleteSection(section.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await ctx.boq()).sections).toEqual([]);
    // Its title is free again.
    expect((await api.addSection(ctx.projectId, "Earthwork")).status).toBe(
      StatusCodes.CREATED,
    );
  });
});

describe("BOQ items (CM-1103)", () => {
  it("adds typed items with original = current, and totals them half up per line", async () => {
    const ctx = await setup();
    await prisma.constructionProjectsProject.update({
      where: { id: ctx.projectId },
      data: { orderValue: 2_00_000_00n },
    });
    const earth = await ctx.section("Earthwork");
    const concrete = await ctx.section("Concrete");
    const first = await ctx.item(earth.id, {
      itemNo: " 1.1 ",
      quantity: "450.5",
      rate: 285_50,
      sacHsn: "995411",
    });
    expect(first).toMatchObject({
      itemNo: "1.1",
      originalQuantity: "450.5000",
      quantity: "450.5000",
      originalRate: 285_50,
      rate: 285_50,
      // 450.5 × ₹285.50 = ₹1,28,617.75.
      amount: 1_28_617_75,
      sacHsn: "995411",
      uomName: "cum",
      measured: false,
      libraryItemId: null,
    });
    // 12.3456 × ₹0.33 = ₹4.074048 → 407 paise; 0.0015 × ₹1 = 0.15 → 0.
    await ctx.item(concrete.id, {
      itemNo: "2.1",
      quantity: "12.3456",
      rate: 33,
    });
    await ctx.item(concrete.id, {
      itemNo: "2.2",
      quantity: "0.0015",
      rate: 100,
    });
    const boq = await ctx.boq();
    expect(boq.sections.map((s) => s.subtotal)).toEqual([1_28_617_75, 407]);
    expect(boq.total).toBe(1_28_621_82);
    expect(boq.difference).toBe(1_28_621_82 - 2_00_000_00);
    expect(boq.itemCount).toBe(3);
  });

  it("keeps item numbers unique in the Project ignoring case", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    await ctx.item(section.id, { itemNo: "A.1" });
    const taken = await api.addItem({
      projectId: ctx.projectId,
      sectionId: section.id,
      itemNo: "a.1",
      description: "Again",
      uomId: ctx.cum,
      quantity: "1",
      rate: 100,
    });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(taken)).toMatchObject({ code: "BOQ_ITEM_NO_TAKEN" });
    const other = await ctx.item(section.id, { itemNo: "A.2" });
    const renumber = await api.updateItem(other.id, {
      sectionId: section.id,
      itemNo: "A.1 ",
      description: other.description,
      uomId: ctx.cum,
      quantity: "1",
      rate: 100,
      expectedUpdatedAt: other.updatedAt,
    });
    expect(await errorOf(renumber)).toMatchObject({
      code: "BOQ_ITEM_NO_TAKEN",
    });
  });

  it("checks quantity, rate, UoM, section and the Wing or Location against the Project", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const base = {
      projectId: ctx.projectId,
      sectionId: section.id,
      itemNo: "9",
      description: "x",
      uomId: ctx.cum,
      quantity: "1",
      rate: 100,
    };
    const cases: [Record<string, unknown>, string][] = [
      [{ quantity: "0" }, "BOQ_QUANTITY_INVALID"],
      [{ quantity: "1.00001" }, "BOQ_QUANTITY_INVALID"],
      [{ rate: -1 }, "BOQ_RATE_INVALID"],
      [{ rate: null }, "BOQ_RATE_INVALID"],
      [{ uomId: crypto.randomUUID() }, "BOQ_ITEM_UOM_INVALID"],
      [{ sectionId: crypto.randomUUID() }, "BOQ_SECTION_NOT_FOUND"],
      [{ locationId: crypto.randomUUID() }, "BOQ_ITEM_LOCATION_INVALID"],
      [{ wingId: crypto.randomUUID() }, "BOQ_ITEM_WING_INVALID"],
      [{ sacHsn: "12" }, "SAC_HSN_INVALID"],
    ];
    for (const [change, code] of cases) {
      const response = await api.addItem({ ...base, ...change });
      expect(await errorOf(response), JSON.stringify(change)).toMatchObject({
        code,
      });
    }
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
      name: "A Wing",
    });
    const placed = await ctx.item(section.id, { wingId: wing.wingId });
    expect(placed).toMatchObject({ wingId: wing.wingId, placeName: "A Wing" });
    // A Wing of another Project is not this one's.
    const other = await addProject(ctx.ws, ctx.by);
    const theirs = await salesWing(ctx.ws, other, ctx.by);
    expect(
      await errorOf(
        await api.addItem({ ...base, itemNo: "10", wingId: theirs.wingId }),
      ),
    ).toMatchObject({ code: "BOQ_ITEM_WING_INVALID" });
    // A Project with Locations takes Locations.
    const plant = await addProject(ctx.ws, ctx.by);
    await prisma.constructionProjectsProject.update({
      where: { id: plant },
      data: { projectType: "infrastructure" },
    });
    const plantBoq = await ctx.boq(plant);
    expect(plantBoq.structure).toBe("locations");
    const plantSection = await json<Section>(
      await api.addSection(plant, "Civil"),
    );
    const location = await worksheetLocation(
      ctx.ws,
      ctx.by,
      plant,
      "Pump house",
    );
    const atLocation = await api.addItem({
      ...base,
      projectId: plant,
      sectionId: plantSection.id,
      locationId: location,
    });
    expect(await json(atLocation)).toMatchObject({
      locationId: location,
      placeName: "Pump house",
    });
  });

  it("edits with the optimistic check, moves between sections and up and down", async () => {
    const ctx = await setup();
    const earth = await ctx.section("Earthwork");
    const concrete = await ctx.section("Concrete");
    const a = await ctx.item(earth.id, { itemNo: "1" });
    const b = await ctx.item(earth.id, { itemNo: "2" });
    const c = await ctx.item(concrete.id, { itemNo: "3" });
    const edit = (item: Item, change: Record<string, unknown>) =>
      api.updateItem(item.id, {
        sectionId: item.sectionId,
        itemNo: item.itemNo,
        description: item.description,
        uomId: item.uomId,
        quantity: item.quantity,
        rate: item.rate,
        expectedUpdatedAt: item.updatedAt,
        ...change,
      });
    const saved = await edit(a, { quantity: "500", rate: 300_00 });
    expect(saved.status).toBe(StatusCodes.OK);
    // Before any measurement the original moves with the edit.
    expect(await json(saved)).toMatchObject({
      quantity: "500.0000",
      originalQuantity: "500.0000",
      rate: 300_00,
      originalRate: 300_00,
    });
    const stale = await edit(a, { description: "Changed" });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(stale)).toMatchObject({ code: "BOQ_ITEM_CHANGED" });

    // To another section: it joins the end.
    const moved = await edit(b, { sectionId: concrete.id });
    expect(await json(moved)).toMatchObject({ sectionId: concrete.id });
    let boq = await ctx.boq();
    expect(boq.sections[1]?.items.map((item) => item.itemNo)).toEqual([
      "3",
      "2",
    ]);
    expect((await api.moveItem(b.id, "up")).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    await api.moveItem(c.id, "down");
    await api.moveItem(b.id, "up");
    boq = await ctx.boq();
    expect(boq.sections[1]?.items.map((item) => item.itemNo)).toEqual([
      "2",
      "3",
    ]);
  });

  it("refuses new quantities and rates and delete once a checked measurement names the item", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const other = await ctx.section("Other");
    const item = await ctx.item(section.id, { quantity: "100" });
    // A draft, a submitted and a deleted checked sheet do not count.
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: item.id,
      quantity: "10",
      status: "draft",
    });
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: item.id,
      quantity: "10",
      status: "submitted",
    });
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: item.id,
      quantity: "10",
      deleted: true,
    });
    expect((await ctx.boq()).sections[0]?.items[0]?.measured).toBe(false);
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: item.id,
      quantity: "40.5",
    });
    const current = (await ctx.boq()).sections[0]?.items[0];
    expect(current).toMatchObject({
      measured: true,
      measuredQuantity: "40.5000",
    });
    const body = {
      sectionId: section.id,
      itemNo: item.itemNo,
      description: item.description,
      uomId: item.uomId,
      quantity: item.quantity,
      rate: item.rate,
      expectedUpdatedAt: item.updatedAt,
    };
    for (const change of [{ quantity: "120" }, { rate: 1 }]) {
      const refused = await api.updateItem(item.id, { ...body, ...change });
      expect(refused.status).toBe(StatusCodes.CONFLICT);
      expect(await errorOf(refused)).toMatchObject({
        code: "BOQ_ITEM_MEASURED",
      });
    }
    const deleted = await api.deleteItem(item.id);
    expect(await errorOf(deleted)).toMatchObject({ code: "BOQ_ITEM_MEASURED" });
    // The number, description, place and section stay editable.
    const edited = await api.updateItem(item.id, {
      ...body,
      itemNo: "1.1a",
      description: "Earthwork in hard soil",
      sectionId: other.id,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await json(edited)).toMatchObject({
      itemNo: "1.1a",
      sectionId: other.id,
      quantity: "100.0000",
    });
  });

  it("copies an Item from the library and locks it against delete", async () => {
    const ctx = await setup();
    const section = await ctx.section("Concrete");
    const libraryId = await addLibraryItem(ctx.ws, ctx.by, {
      code: "5.1.1",
      uomId: ctx.cum,
      adoptedRate: 6_123_45n,
      shortDescription: "PCC 1:4:8",
      description: "PCC 1:4:8 in foundations",
      sacHsn: "995411",
    });
    const options = await libraryRoute(
      request(`${BASE}/library-items?projectId=${ctx.projectId}&q=pcc`),
    );
    expect(
      (
        await json<ListConstructionContractsBoqLibraryItemsResponseModel>(
          options,
        )
      ).items,
    ).toEqual([
      expect.objectContaining({
        id: libraryId,
        code: "5.1.1",
        uomName: "cum",
        adoptedRate: 6_123_45,
      }),
    ]);
    const copied = await ctx.item(section.id, {
      libraryItemId: libraryId,
      itemNo: "5.1.1",
      description: "PCC 1:4:8 in foundations",
      quantity: "32.5",
      rate: 6_123_45,
    });
    expect(copied).toMatchObject({
      libraryItemId: libraryId,
      libraryCode: "5.1.1",
    });

    const refused = await deleteLibraryItem(
      request(
        `http://localhost/api/construction/contracts/items/${libraryId}/delete`,
        {},
      ),
      params(libraryId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(refused)).toMatchObject({ code: "ITEM_IN_USE" });

    // A deleted library Item cannot be copied.
    const gone = await addLibraryItem(ctx.ws, ctx.by, {
      code: "OWN-1",
      uomId: ctx.cum,
      adoptedRate: 100n,
    });
    await prisma.constructionContractsItem.update({
      where: { id: gone },
      data: { deletedAt: new Date(), deletedBy: ctx.by },
    });
    const missing = await api.addItem({
      projectId: ctx.projectId,
      sectionId: section.id,
      libraryItemId: gone,
      itemNo: "X",
      description: "x",
      uomId: ctx.cum,
      quantity: "1",
      rate: 1,
    });
    expect(await errorOf(missing)).toMatchObject({
      code: "BOQ_LIBRARY_ITEM_NOT_FOUND",
    });
  });

  it("never lets a copy and the library Item's delete both succeed", async () => {
    const ctx = await setup();
    const section = await ctx.section("Race");
    for (let round = 0; round < 6; round += 1) {
      const libraryId = await addLibraryItem(ctx.ws, ctx.by, {
        code: `R-${String(round)}`,
        uomId: ctx.cum,
        adoptedRate: 100n,
      });
      const [copy, removal] = await Promise.all([
        api.addItem({
          projectId: ctx.projectId,
          sectionId: section.id,
          libraryItemId: libraryId,
          itemNo: `R-${String(round)}`,
          description: "Race",
          uomId: ctx.cum,
          quantity: "1",
          rate: 100,
        }),
        deleteLibraryItem(
          request(
            `http://localhost/api/construction/contracts/items/${libraryId}/delete`,
            {},
          ),
          params(libraryId),
        ),
      ]);
      const copied = copy.status === StatusCodes.CREATED;
      const deleted = removal.status === StatusCodes.NO_CONTENT;
      expect(copied !== deleted, `round ${String(round)}`).toBe(true);
      if (copied)
        expect(await errorOf(removal)).toMatchObject({ code: "ITEM_IN_USE" });
      else
        expect(await errorOf(copy)).toMatchObject({
          code: "BOQ_LIBRARY_ITEM_NOT_FOUND",
        });
    }
  });

  it("deletes softly; the item number is free again", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const item = await ctx.item(section.id);
    const stale = await api.deleteItem(item.id, {
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(await errorOf(stale)).toMatchObject({ code: "BOQ_ITEM_CHANGED" });
    expect((await api.deleteItem(item.id)).status).toBe(StatusCodes.NO_CONTENT);
    const row = await prisma.constructionContractsBoqItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect((await api.item(item.id)).status).toBe(StatusCodes.NOT_FOUND);
    await ctx.item(section.id);
  });

  it("offers UoMs, the Project's Wings and its sections in the form", async () => {
    const ctx = await setup();
    await ctx.section("Works");
    const wing = await salesWing(ctx.ws, ctx.projectId, ctx.by, {
      name: "B Wing",
    });
    const response = await formOptionsRoute(
      request(`${BASE}/form-options?projectId=${ctx.projectId}`),
    );
    expect(await json(response)).toMatchObject({
      structure: "wings",
      wings: [{ id: wing.wingId, name: "B Wing", phaseName: "Phase 1" }],
      locations: [],
      sections: [{ title: "Works" }],
    });
  });
});

describe("BOQ Financial and access (CM-1103)", () => {
  it("hides rates, amounts, totals and the Order Value without Financial", async () => {
    const ctx = await setup();
    await prisma.constructionProjectsProject.update({
      where: { id: ctx.projectId },
      data: { orderValue: 5_00_000_00n },
    });
    const section = await ctx.section("Works");
    const libraryId = await addLibraryItem(ctx.ws, ctx.by, {
      code: "L1",
      uomId: ctx.cum,
      adoptedRate: 250_00n,
    });
    await ctx.item(section.id);
    actAs(await member(ctx, ["read", "create", "update"]));
    const boq = await ctx.boq();
    expect(boq).toMatchObject({
      financial: false,
      total: null,
      orderValue: null,
      difference: null,
    });
    expect(boq.sections[0]).toMatchObject({ subtotal: null });
    expect(boq.sections[0]?.items[0]).toMatchObject({
      quantity: "450.0000",
      rate: null,
      originalRate: null,
      amount: null,
    });
    const options =
      await json<ListConstructionContractsBoqLibraryItemsResponseModel>(
        await libraryRoute(
          request(`${BASE}/library-items?projectId=${ctx.projectId}`),
        ),
      );
    expect(options.items[0]?.adoptedRate).toBeNull();
    // Without Financial the rate is not taken: a copy gets the adopted rate.
    const copied = await api.addItem({
      projectId: ctx.projectId,
      sectionId: section.id,
      libraryItemId: libraryId,
      itemNo: "L1",
      description: "Copied",
      uomId: ctx.cum,
      quantity: "2",
      rate: 1,
    });
    expect(copied.status).toBe(StatusCodes.CREATED);
    const row = await prisma.constructionContractsBoqItem.findFirstOrThrow({
      where: { projectId: ctx.projectId, itemNo: "L1" },
    });
    expect(row.rate).toBe(250_00n);
    // An edit keeps the rate.
    const view = await json<Item>(copied);
    await api.updateItem(view.id, {
      sectionId: section.id,
      itemNo: "L1",
      description: "Copied",
      uomId: ctx.cum,
      quantity: "3",
      rate: 5,
      expectedUpdatedAt: view.updatedAt,
    });
    const after = await prisma.constructionContractsBoqItem.findUniqueOrThrow({
      where: { id: view.id },
    });
    expect(after.rate).toBe(250_00n);
    expect(after.quantity.toString()).toBe("3");
  });

  it("answers 404 for another Company's Project and records, 403 off the Project", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const item = await ctx.item(section.id);
    const stranger = await newCompany();
    actAs({ userId: stranger.ownerId, workspaceId: stranger.workspaceId });
    const theirs = await api.boq(ctx.projectId);
    expect(theirs.status).toBe(StatusCodes.NOT_FOUND);
    expect(await errorOf(theirs)).toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(await errorOf(await api.item(item.id))).toMatchObject({
      code: "BOQ_ITEM_NOT_FOUND",
    });
    expect(
      await errorOf(
        await api.renameSection(section.id, {
          title: "x",
          expectedUpdatedAt: section.updatedAt,
        }),
      ),
    ).toMatchObject({ code: "BOQ_SECTION_NOT_FOUND" });

    actAs(await member(ctx, ["read", "create"], { onProject: false }));
    expect((await api.boq(ctx.projectId)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.item(item.id)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(await member(ctx, ["read"]));
    expect((await api.boq(ctx.projectId)).status).toBe(StatusCodes.OK);
    expect((await api.addSection(ctx.projectId, "New")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await api.deleteItem(item.id)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await api.moveSection(section.id, "down")).status).toBe(
      StatusCodes.FORBIDDEN,
    );
  });

  it("shows one item with the Variations that name it", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const item = await ctx.item(section.id);
    const response = await api.item(item.id);
    expect(response.status).toBe(StatusCodes.OK);
    expect(
      await json<GetConstructionContractsBoqItemResponseModel>(response),
    ).toMatchObject({
      item: { id: item.id, itemNo: "1.1" },
      variations: [],
    });
  });
});

describe("Deviation limit and list (CM-1103)", () => {
  it("is 25 % by default and changed with BOQ Update, Company-wide", async () => {
    const ctx = await setup();
    const read = () => settingsRoute(request(`${BASE}/settings`));
    expect(await json(await read())).toMatchObject({
      deviationLimitPercent: "25.00",
      updatedAt: null,
      canUpdate: true,
    });
    const saved = await updateSettingsRoute(
      request(`${BASE}/settings/update`, { deviationLimitPercent: "10.5" }),
    );
    expect(
      await json<ConstructionContractsBoqSettingsResponseModel>(saved),
    ).toMatchObject({
      deviationLimitPercent: "10.50",
    });
    const bad = await updateSettingsRoute(
      request(`${BASE}/settings/update`, { deviationLimitPercent: 101 }),
    );
    expect(await errorOf(bad)).toMatchObject({
      code: "DEVIATION_LIMIT_INVALID",
    });

    // A Team Member with BOQ Update on no Project may still change it.
    actAs(await member(ctx, ["read", "update"], { onProject: false }));
    expect(
      (
        await updateSettingsRoute(
          request(`${BASE}/settings/update`, { deviationLimitPercent: 20 }),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    actAs(await member(ctx, ["read"]));
    expect(await json(await read())).toMatchObject({
      deviationLimitPercent: "20.00",
      canUpdate: false,
    });
    expect(
      (
        await updateSettingsRoute(
          request(`${BASE}/settings/update`, { deviationLimitPercent: 5 }),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("lists items measured beyond current × (1 + limit)", async () => {
    const ctx = await setup();
    const section = await ctx.section("Works");
    const within = await ctx.item(section.id, { itemNo: "1", quantity: "100" });
    const over = await ctx.item(section.id, { itemNo: "2", quantity: "100" });
    const unmeasured = await ctx.item(section.id, {
      itemNo: "3",
      quantity: "1",
    });
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: within.id,
      quantity: "125",
    });
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: over.id,
      quantity: "100",
    });
    await measureBoqItem(ctx.ws, ctx.by, {
      projectId: ctx.projectId,
      boqItemId: over.id,
      quantity: "30.25",
    });
    const list = async () =>
      json<ListConstructionContractsBoqDeviationsResponseModel>(
        await deviationsRoute(
          request(`${BASE}/deviations?projectId=${ctx.projectId}`),
        ),
      );
    expect(await list()).toEqual({
      deviationLimitPercent: "25.00",
      items: [
        {
          boqItemId: over.id,
          sectionTitle: "Works",
          itemNo: "2",
          description: over.description,
          uomName: "cum",
          quantity: "100.0000",
          measuredQuantity: "130.2500",
          percentOver: "30.25",
          rate: 285_50,
          pendingVariation: null,
        },
      ],
    });
    await updateSettingsRoute(
      request(`${BASE}/settings/update`, { deviationLimitPercent: 0 }),
    );
    expect((await list()).items.map((row) => row.itemNo)).toEqual(["1", "2"]);
    expect(unmeasured.measured).toBe(false);
  });
});

describe("BOQ in the OpenAPI document (CM-1103)", () => {
  it("lists the BOQ and Variation paths and models", async () => {
    const document = (await getOpenApi().json()) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    for (const path of [
      "/api/construction/contracts/boq",
      "/api/construction/contracts/boq/items/{id}/update",
      "/api/construction/contracts/boq/sections/{id}/move",
      "/api/construction/contracts/boq/variations/{id}/approve",
      "/api/construction/contracts/boq/import",
      "/api/construction/contracts/boq/deviations",
      "/api/construction/contracts/boq/settings/update",
    ])
      expect(document.paths).toHaveProperty([path]);
    expect(document.components.schemas).toHaveProperty(
      "GetConstructionContractsBoqResponse",
    );
    expect(document.components.schemas).toHaveProperty(
      "CreateConstructionContractsVariationRequest",
    );
  });
});
