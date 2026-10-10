import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { addMaterial, addOpeningStock, addStore, addUnit } from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as inventory } from "../inventory/route";
import { POST as approve } from "./[id]/approve/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as deliver } from "./[id]/deliver/route";
import { POST as reject } from "./[id]/reject/route";
import { GET as getOne } from "./[id]/route";
import { POST as update } from "./[id]/update/route";
import { GET as availableStock } from "./available-stock/route";
import { GET as list, POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/procurement/transfers`;
const INVENTORY = `${TEST_ORIGIN}/api/construction/procurement/inventory`;
const TODAY = todayIn("Asia/Kolkata");

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Transfer = {
  id: string;
  number: string;
  status: string;
  type: string;
  updatedAt: string;
  from: { name: string };
  to: { name: string };
  deliveredOn: string | null;
  deliveredBy: { name: string | null } | null;
  rejectionReason: string | null;
  lines: { materialName: string; uomName: string; quantity: string }[];
};
type Row = { materialId: string; inStock: string; inTransitIn: string; inTransitOut: string };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup() {
  const owner = await ownerWithCompany();
  const towerId = await addProject(owner.workspaceId, owner.userId, "Tower A");
  const villaId = await addProject(owner.workspaceId, owner.userId, "Villa B");
  const storeId = await addStore(owner.workspaceId, owner.userId, [towerId], { name: "Ambattur Store" });
  const bag = await addUnit(owner.workspaceId, owner.userId, "Bag");
  const cement = await addMaterial(owner.workspaceId, owner.userId, { name: "Cement OPC 53", uomId: bag });
  const tower = { kind: "project" as const, id: towerId };
  const villa = { kind: "project" as const, id: villaId };
  const store = { kind: "store" as const, id: storeId };
  await addOpeningStock(owner.workspaceId, owner.userId, tower, cement.id, "100", addDays(TODAY, -10));
  return { owner, tower, villa, store, cement };
}

function raise(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return create(jsonRequest(BASE, cookie, body));
}

async function stockAt(company: Company, location: { kind: string; id: string }, materialId: string): Promise<Row | undefined> {
  const response = await inventory(
    jsonRequest(`${INVENTORY}?locationKind=${location.kind}&locationId=${location.id}`, company.cookie),
  );
  return (await json<{ items: Row[] }>(response)).items.find((row) => row.materialId === materialId);
}

async function memberOn(owner: Company, projectIds: string[], grants: PermissionGrants) {
  const member = await memberWith(owner, grants);
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId },
    });
  return member;
}

describe("Material Transfer (CM-507)", () => {
  it("moves nothing while pending, dispatches on approve and receives on delivery", async () => {
    const { owner, tower, villa, cement } = await setup();
    const created = await raise(owner.cookie, {
      transferDate: addDays(TODAY, -2),
      from: tower,
      to: villa,
      lines: [{ materialId: cement.id, quantity: "30", remark: "For the slab" }],
      receiverName: "Murugan",
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const pending = await json<Transfer>(created);
    expect(pending).toMatchObject({
      status: "pending",
      type: "project_to_project",
      from: { name: "Tower A" },
      to: { name: "Villa B" },
      lines: [{ materialName: "Cement OPC 53", uomName: "Bag", quantity: "30.000" }],
    });
    expect(pending.number).toMatch(/^MT/);
    expect(await stockAt(owner, tower, cement.id)).toMatchObject({ inStock: "100.000", inTransitOut: "0.000" });

    const approved = await approve(jsonRequest(`${BASE}/${pending.id}/approve`, owner.cookie, { expectedUpdatedAt: pending.updatedAt }), params(pending.id));
    expect(approved.status).toBe(StatusCodes.OK);
    expect((await json<Transfer>(approved)).status).toBe("in_transit");
    expect(await stockAt(owner, tower, cement.id)).toMatchObject({ inStock: "70.000", inTransitOut: "30.000" });
    expect(await stockAt(owner, villa, cement.id)).toMatchObject({ inStock: "0.000", inTransitIn: "30.000" });

    // Approved: not edited, not deleted, not approved again.
    const editLate = await update(jsonRequest(`${BASE}/${pending.id}/update`, owner.cookie, {
      transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }], expectedUpdatedAt: pending.updatedAt,
    }), params(pending.id));
    expect(await codeOf(editLate)).toBe("MATERIAL_TRANSFER_NOT_PENDING");
    const deleteLate = await remove(jsonRequest(`${BASE}/${pending.id}/delete`, owner.cookie, { expectedUpdatedAt: pending.updatedAt }), params(pending.id));
    expect(await codeOf(deleteLate)).toBe("MATERIAL_TRANSFER_NOT_PENDING");

    const early = await deliver(jsonRequest(`${BASE}/${pending.id}/deliver`, owner.cookie, { deliveredOn: addDays(TODAY, -3) }), params(pending.id));
    expect(await codeOf(early)).toBe("DELIVERY_DATE_BEFORE_TRANSFER");
    const delivered = await deliver(jsonRequest(`${BASE}/${pending.id}/deliver`, owner.cookie, { deliveredOn: TODAY }), params(pending.id));
    expect(delivered.status).toBe(StatusCodes.OK);
    expect(await json<Transfer>(delivered)).toMatchObject({ status: "delivered", deliveredOn: TODAY });
    expect(await stockAt(owner, villa, cement.id)).toMatchObject({ inStock: "30.000", inTransitIn: "0.000" });
    expect(await stockAt(owner, tower, cement.id)).toMatchObject({ inStock: "70.000", inTransitOut: "0.000" });
    const twice = await deliver(jsonRequest(`${BASE}/${pending.id}/deliver`, owner.cookie, { deliveredOn: TODAY }), params(pending.id));
    expect(await codeOf(twice)).toBe("MATERIAL_TRANSFER_NOT_IN_TRANSIT");

    // Both sides list it, by direction.
    const outbound = await json<{ items: Transfer[]; total: number }>(await list(jsonRequest(`${BASE}?locationKind=project&locationId=${tower.id}&direction=out`, owner.cookie)));
    expect(outbound.items.map((item) => item.id)).toEqual([pending.id]);
    const inbound = await json<{ total: number }>(await list(jsonRequest(`${BASE}?locationKind=project&locationId=${tower.id}&direction=in`, owner.cookie)));
    expect(inbound.total).toBe(0);
    const atVilla = await json<{ total: number }>(await list(jsonRequest(`${BASE}?locationKind=project&locationId=${villa.id}&status=delivered`, owner.cookie)));
    expect(atVilla.total).toBe(1);
  });

  it("refuses a dispatch the source cannot cover, and Save & Approve likewise", async () => {
    const { owner, tower, store, cement } = await setup();
    const tooMuch = await json<Transfer>(await raise(owner.cookie, {
      transferDate: TODAY, from: tower, to: store, lines: [{ materialId: cement.id, quantity: "120" }],
    }));
    const refused = await approve(jsonRequest(`${BASE}/${tooMuch.id}/approve`, owner.cookie, {}), params(tooMuch.id));
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    const body = await json<{ code: string; details: { shortfalls: { shortBy: string }[] } }>(refused);
    expect(body.code).toBe("STOCK_INSUFFICIENT");
    expect(body.details.shortfalls[0]?.shortBy).toBe("20.000");
    expect((await json<Transfer>(await getOne(jsonRequest(`${BASE}/${tooMuch.id}`, owner.cookie), params(tooMuch.id)))).status).toBe("pending");

    const saveApprove = await raise(owner.cookie, {
      transferDate: TODAY, from: tower, to: store, lines: [{ materialId: cement.id, quantity: "101" }], approve: true,
    });
    expect(await codeOf(saveApprove)).toBe("STOCK_INSUFFICIENT");
    const ok = await raise(owner.cookie, {
      transferDate: TODAY, from: tower, to: store, lines: [{ materialId: cement.id, quantity: "40" }], approve: true,
    });
    expect(ok.status).toBe(StatusCodes.CREATED);
    expect(await json<Transfer>(ok)).toMatchObject({ status: "in_transit", type: "project_to_store", to: { name: "Ambattur Store" } });

    const stock = await json<{ stock: Record<string, string> }>(await availableStock(jsonRequest(`${BASE}/available-stock?fromKind=project&fromId=${tower.id}&materialIds=${cement.id}`, owner.cookie)));
    expect(stock.stock[cement.id]).toBe("60.000");
  });

  it("rejects with a reason, edits and deletes while pending", async () => {
    const { owner, tower, villa, cement } = await setup();
    const first = await json<Transfer>(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "5" }] }));
    const noReason = await reject(jsonRequest(`${BASE}/${first.id}/reject`, owner.cookie, { reason: "" }), params(first.id));
    expect(await codeOf(noReason)).toBe("REJECTION_REASON_REQUIRED");
    const rejected = await reject(jsonRequest(`${BASE}/${first.id}/reject`, owner.cookie, { reason: "Villa has enough" }), params(first.id));
    expect(await json<Transfer>(rejected)).toMatchObject({ status: "rejected", rejectionReason: "Villa has enough" });
    expect(await stockAt(owner, tower, cement.id)).toMatchObject({ inStock: "100.000" });

    const second = await json<Transfer>(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "5" }] }));
    const edited = await update(jsonRequest(`${BASE}/${second.id}/update`, owner.cookie, {
      transferDate: addDays(TODAY, -1), from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "8" }], receiverName: "Selvam", expectedUpdatedAt: second.updatedAt,
    }), params(second.id));
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<Transfer>(edited);
    expect(after.lines[0]?.quantity).toBe("8.000");
    expect(after.number).toBe(second.number);
    const stale = await remove(jsonRequest(`${BASE}/${second.id}/delete`, owner.cookie, { expectedUpdatedAt: second.updatedAt }), params(second.id));
    expect(await codeOf(stale)).toBe("MATERIAL_TRANSFER_CHANGED");
    const removed = await remove(jsonRequest(`${BASE}/${second.id}/delete`, owner.cookie, { expectedUpdatedAt: after.updatedAt }), params(second.id));
    expect(removed.status).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(jsonRequest(`${BASE}/${second.id}`, owner.cookie), params(second.id))).status).toBe(StatusCodes.NOT_FOUND);

    const third = await json<Transfer>(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }] }));
    expect(third.number).not.toBe(second.number);
  });

  it("validates the route, lines and dates", async () => {
    const { owner, tower, cement } = await setup();
    expect(await codeOf(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: tower, lines: [{ materialId: cement.id, quantity: "1" }] }))).toBe("TRANSFER_SAME_LOCATION");
    const missingTo = await raise(owner.cookie, { transferDate: TODAY, from: tower, to: { kind: "store", id: newId() }, lines: [{ materialId: cement.id, quantity: "1" }] });
    expect(missingTo.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(missingTo)).toBe("STORE_NOT_FOUND");
    const villa = { kind: "project", id: await addProject(owner.workspaceId, owner.userId) };
    expect(await codeOf(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }, { materialId: cement.id, quantity: "2" }] }))).toBe("TRANSFER_MATERIAL_REPEATED");
    expect(await codeOf(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "0" }] }))).toBe("QUANTITY_INVALID");
    expect(await codeOf(await raise(owner.cookie, { transferDate: addDays(TODAY, 1), from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }] }))).toBe("TRANSFER_DATE_IN_FUTURE");
    expect(await codeOf(await raise(owner.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: newId(), quantity: "1" }] }))).toBe("MATERIAL_NOT_FOUND");
  });

  it("checks the source for approve and the destination for delivery", async () => {
    const { owner, tower, villa, store, cement } = await setup();
    const sender = await memberOn(owner, [tower.id], { "procurement.material_transfers": ["read", "create"] });
    const sent = await raise(sender.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "10" }] });
    expect(sent.status).toBe(StatusCodes.CREATED);
    const transfer = await json<Transfer>(sent);
    // Create without Approve: no Save & Approve, no Approve.
    expect((await raise(sender.cookie, { transferDate: TODAY, from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }], approve: true })).status).toBe(StatusCodes.FORBIDDEN);
    expect((await approve(jsonRequest(`${BASE}/${transfer.id}/approve`, sender.cookie, {}), params(transfer.id))).status).toBe(StatusCodes.FORBIDDEN);
    // Not on the source Project.
    expect((await raise(sender.cookie, { transferDate: TODAY, from: villa, to: tower, lines: [{ materialId: cement.id, quantity: "1" }] })).status).toBe(StatusCodes.FORBIDDEN);

    await approve(jsonRequest(`${BASE}/${transfer.id}/approve`, owner.cookie, {}), params(transfer.id));
    // The sender has no Update at the destination.
    expect((await deliver(jsonRequest(`${BASE}/${transfer.id}/deliver`, sender.cookie, { deliveredOn: TODAY }), params(transfer.id))).status).toBe(StatusCodes.FORBIDDEN);
    const receiver = await memberOn(owner, [villa.id], { "procurement.material_transfers": ["read", "update"] });
    expect((await getOne(jsonRequest(`${BASE}/${transfer.id}`, receiver.cookie), params(transfer.id))).status).toBe(StatusCodes.OK);
    const received = await deliver(jsonRequest(`${BASE}/${transfer.id}/deliver`, receiver.cookie, { deliveredOn: TODAY }), params(transfer.id));
    expect(received.status).toBe(StatusCodes.OK);
    expect((await json<Transfer>(received)).deliveredBy?.name).toBe("Member");

    // A Store side needs Central store too.
    const projectOnly = await memberOn(owner, [tower.id], { "procurement.material_transfers": ["read", "create"] });
    expect((await raise(projectOnly.cookie, { transferDate: TODAY, from: store, to: tower, lines: [{ materialId: cement.id, quantity: "1" }] })).status).toBe(StatusCodes.FORBIDDEN);
    const keeper = await memberOn(owner, [], { "procurement.material_transfers": ["read", "create"], "procurement.central_store": ["read", "create"] });
    expect((await raise(keeper.cookie, { transferDate: TODAY, from: store, to: tower, lines: [{ materialId: cement.id, quantity: "1" }] })).status).toBe(StatusCodes.CREATED);
    const storeList = await json<{ total: number }>(await list(jsonRequest(`${BASE}?locationKind=store&locationId=${store.id}`, keeper.cookie)));
    expect(storeList.total).toBe(1);

    const stranger = await ownerWithCompany("Other Builders");
    expect((await getOne(jsonRequest(`${BASE}/${transfer.id}`, stranger.cookie), params(transfer.id))).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("applies the back-dated policy to the transfer date", async () => {
    const { owner, tower, villa, cement } = await setup();
    const member = await memberOn(owner, [tower.id], { "procurement.material_transfers": ["read", "create"] });
    await prisma.constructionOrganizationBackdatedEntryPolicy.create({
      data: {
        id: newId(),
        workspaceId: owner.workspaceId,
        createDays: 0,
        createOverrideDesignationIds: [],
        editDays: 0,
        editOverrideDesignationIds: [],
        modules: {
          material_transfer: {
            mode: "custom",
            create: { days: 2, overrideDesignationIds: [] },
            edit: { days: 2, overrideDesignationIds: [] },
          },
        },
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const old = await raise(member.cookie, { transferDate: addDays(TODAY, -5), from: tower, to: villa, lines: [{ materialId: cement.id, quantity: "1" }] });
    expect(old.status).toBe(StatusCodes.FORBIDDEN);
    expect(await codeOf(old)).toBe("BACKDATED_CREATE_BLOCKED");
  });

  it("is on /api/docs", async () => {
    const doc = await json<{ paths: Record<string, unknown> }>(await getOpenApi());
    for (const path of ["", "/available-stock", "/{id}", "/{id}/update", "/{id}/approve", "/{id}/reject", "/{id}/deliver", "/{id}/delete"])
      expect(Object.keys(doc.paths)).toContain(`/api/construction/procurement/transfers${path}`);
  });
});
