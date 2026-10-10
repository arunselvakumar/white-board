import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { todayIn } from "@/src/shared-kernel/calendar-date";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import {
  addContractor,
  addMaterial,
  addMaterialCategory,
  addOpeningStock,
  addStore,
  addSupplier,
} from "@/test/procurement";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getInventory } from "../central-inventory/route";
import { GET as getLedger } from "../central-inventory/stock-ledger/route";
import { GET as getLedgerXlsx } from "../central-inventory/stock-ledger/xlsx/route";
import { POST as approveNote } from "../delivery-notes/[id]/approve/route";
import { POST as deleteNote } from "../delivery-notes/[id]/delete/route";
import { POST as markDelivered } from "../delivery-notes/[id]/mark-delivered/route";
import { GET as getNote } from "../delivery-notes/[id]/route";
import { POST as updateNote } from "../delivery-notes/[id]/update/route";
import { POST as bulkApprove } from "../delivery-notes/approve/route";
import { POST as createNote } from "../delivery-notes/route";
import { POST as deleteStore } from "../stores/[id]/delete/route";
import { GET as getStore } from "../stores/[id]/route";
import { GET as getStoreStock } from "../stores/[id]/stock/route";
import { POST as updateStore } from "../stores/[id]/update/route";
import { GET as storeFormOptions } from "../stores/form-options/route";
import { GET as storeOptions } from "../stores/options/route";
import { GET as listStores, POST as createStore } from "../stores/route";
import { POST as closeRequest } from "./[id]/close/route";
import { POST as deleteRequest } from "./[id]/delete/route";
import { GET as requestPdf } from "./[id]/pdf/route";
import { GET as getRequest } from "./[id]/route";
import { POST as updateRequest } from "./[id]/update/route";
import { GET as requestFormOptions } from "./form-options/route";
import { GET as listRequests, POST as createRequest } from "./route";

const API = `${TEST_ORIGIN}/api/construction/procurement`;
const TODAY = todayIn("Asia/Kolkata");

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Ctx = { params: Promise<{ id: string }> };

const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function code(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

type Store = { id: string; name: string; updatedAt: string; projects: { id: string }[] };
type RequestItem = {
  id: string;
  materialId: string;
  askQty: string;
  deliveredQty: string;
  inFlightQty: string;
  pendingQty: string;
};
type MaterialRequest = {
  id: string;
  number: string;
  status: string;
  updatedAt: string;
  items: RequestItem[];
  deliveryNotes: { id: string; status: string }[];
};
type Note = {
  id: string;
  number: string;
  status: string;
  updatedAt: string;
  items: { quantity: string; pendingQty: string }[];
};

async function setup(company: Company) {
  const { workspaceId, userId } = company;
  const [tower, villa] = await Promise.all([
    addProject(workspaceId, userId, "Tower A"),
    addProject(workspaceId, userId, "Villa"),
  ]);
  const categoryId = await addMaterialCategory(workspaceId, userId, "Civil");
  const cement = await addMaterial(workspaceId, userId, {
    name: "Cement OPC 53",
    categoryId,
    minStockQty: "5",
  });
  const steel = await addMaterial(workspaceId, userId, {
    name: "TMT Steel 12 mm",
  });
  const storeId = await addStore(workspaceId, userId, [tower], {
    name: "Ambattur Store",
  });
  await addOpeningStock(
    workspaceId,
    userId,
    { kind: "store", id: storeId },
    cement.id,
    "10",
  );
  await addOpeningStock(
    workspaceId,
    userId,
    { kind: "store", id: storeId },
    steel.id,
    "100",
  );
  return { tower, villa, cement, steel, storeId, categoryId };
}

function raise(
  company: Company,
  body: Record<string, unknown>,
  cookie = company.cookie,
) {
  return createRequest(jsonRequest(`${API}/material-requests`, cookie, body));
}

describe("Central Store HTTP (CM-508)", () => {
  it("adds, lists, edits and deletes stores with their rules", async () => {
    const company = await ownerWithCompany();
    const { workspaceId, userId, cookie } = company;
    const project = await addProject(workspaceId, userId, "Site 1");
    const inactive = await addSupplier(workspaceId, userId, { isActive: false });
    const supplier = await addSupplier(workspaceId, userId);

    const none = await createStore(
      jsonRequest(`${API}/stores`, cookie, { name: "Main", projectIds: [] }),
    );
    expect(none.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await code(none)).toBe("STORE_PROJECTS_REQUIRED");

    const dead = await createStore(
      jsonRequest(`${API}/stores`, cookie, {
        name: "Main",
        projectIds: [project],
        supplierIds: [inactive],
      }),
    );
    expect(await code(dead)).toBe("SUPPLIER_INACTIVE");

    const created = await createStore(
      jsonRequest(`${API}/stores`, cookie, {
        name: "  Main   Store ",
        address: "Ambattur",
        stateCode: "33",
        projectIds: [project],
        supplierIds: [supplier],
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const store = await json<Store & { stateName: string }>(created);
    expect(store.name).toBe("Main Store");
    expect(store.stateName).toBe("Tamil Nadu");

    const twin = await createStore(
      jsonRequest(`${API}/stores`, cookie, {
        name: "main store",
        projectIds: [project],
      }),
    );
    expect(twin.status).toBe(StatusCodes.CONFLICT);
    expect(await code(twin)).toBe("STORE_NAME_TAKEN");

    const list = await json<{ items: Store[]; total: number }>(
      await listStores(jsonRequest(`${API}/stores?search=main`, cookie)),
    );
    expect(list.total).toBe(1);
    const options = await json<{ items: { id: string }[] }>(
      await storeOptions(
        jsonRequest(`${API}/stores/options?projectId=${project}`, cookie),
      ),
    );
    expect(options.items.map((item) => item.id)).toEqual([store.id]);
    const form = await json<{ projects: { id: string }[] }>(
      await storeFormOptions(jsonRequest(`${API}/stores/form-options`, cookie)),
    );
    expect(form.projects.map((item) => item.id)).toContain(project);

    const stale = await updateStore(
      jsonRequest(`${API}/stores/${store.id}/update`, cookie, {
        name: "Main Store",
        projectIds: [project],
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
      ctx(store.id),
    );
    expect(await code(stale)).toBe("STORE_CHANGED");
    const renamed = await updateStore(
      jsonRequest(`${API}/stores/${store.id}/update`, cookie, {
        name: "Ambattur Main",
        projectIds: [project],
        expectedUpdatedAt: store.updatedAt,
      }),
      ctx(store.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);
    const after = await json<Store & { suppliers: unknown[] }>(renamed);
    expect(after.suppliers).toEqual([]);

    const deleted = await deleteStore(
      jsonRequest(`${API}/stores/${store.id}/delete`, cookie, {
        expectedUpdatedAt: after.updatedAt,
      }),
      ctx(store.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getStore(
      jsonRequest(`${API}/stores/${store.id}`, cookie),
      ctx(store.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);

    const other = await ownerWithCompany("Other Builders");
    const foreign = await getStore(
      jsonRequest(`${API}/stores/${store.id}`, other.cookie),
      ctx(store.id),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);
  });

  it("refuses to delete a store that holds stock", async () => {
    const company = await ownerWithCompany();
    const { storeId } = await setup(company);
    const store = await json<Store>(
      await getStore(
        jsonRequest(`${API}/stores/${storeId}`, company.cookie),
        ctx(storeId),
      ),
    );
    const refused = await deleteStore(
      jsonRequest(`${API}/stores/${storeId}/delete`, company.cookie, {
        expectedUpdatedAt: store.updatedAt,
      }),
      ctx(storeId),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await code(refused)).toBe("STORE_IN_USE");
    const stock = await json<{ items: { stock: string; state: string }[] }>(
      await getStoreStock(
        jsonRequest(`${API}/stores/${storeId}/stock`, company.cookie),
        ctx(storeId),
      ),
    );
    expect(stock.items.map((item) => item.stock).sort()).toEqual([
      "10.000",
      "100.000",
    ]);
  });

  it("checks Request To, the Contractor and the lines of a Material Request", async () => {
    const company = await ownerWithCompany();
    const { tower, villa, cement, storeId } = await setup(company);
    const contractor = await addContractor(company.workspaceId, company.userId, [
      villa,
    ]);
    const base = {
      projectId: tower,
      requestDate: TODAY,
      storeId,
      items: [{ materialId: cement.id, askQty: "8" }],
    };
    const wrongStore = await raise(company, { ...base, projectId: villa });
    expect(await code(wrongStore)).toBe("STORE_NOT_ON_PROJECT");
    const wrongContractor = await raise(company, {
      ...base,
      contractorId: contractor,
    });
    expect(await code(wrongContractor)).toBe("CONTRACTOR_NOT_ON_PROJECT");
    const empty = await raise(company, { ...base, items: [] });
    expect(await code(empty)).toBe("MATERIAL_REQUEST_ITEMS_REQUIRED");
    const zero = await raise(company, {
      ...base,
      items: [{ materialId: cement.id, askQty: "0" }],
    });
    expect(await code(zero)).toBe("QUANTITY_INVALID");
    const repeated = await raise(company, {
      ...base,
      items: [
        { materialId: cement.id, askQty: "1" },
        { materialId: cement.id, askQty: "2" },
      ],
    });
    expect(await code(repeated)).toBe("MATERIAL_REPEATED");
    const future = await raise(company, { ...base, requestDate: "2999-01-01" });
    expect(await code(future)).toBe("DATE_IN_FUTURE");

    const options = await json<{ stores: { id: string }[] }>(
      await requestFormOptions(
        jsonRequest(
          `${API}/material-requests/form-options?projectId=${tower}`,
          company.cookie,
        ),
      ),
    );
    expect(options.stores.map((store) => store.id)).toEqual([storeId]);
  });

  it("runs the chain: request → delivery notes → issued and received → delivered", async () => {
    const company = await ownerWithCompany();
    const { cookie } = company;
    const { tower, cement, steel, storeId } = await setup(company);

    const raised = await raise(company, {
      projectId: tower,
      requestDate: TODAY,
      storeId,
      receiverName: "Murugan",
      items: [
        { materialId: cement.id, askQty: "8" },
        { materialId: steel.id, askQty: "40", remark: "For columns" },
      ],
    });
    expect(raised.status).toBe(StatusCodes.CREATED);
    let request = await json<MaterialRequest>(raised);
    expect(request.number).toMatch(/^MR/);
    expect(request.status).toBe("requested");
    const [cementLine, steelLine] = request.items;
    if (cementLine == null || steelLine == null) throw new Error("lines");

    // A Delivery Note larger than the store's stock is refused.
    const short = await createNote(
      jsonRequest(`${API}/delivery-notes`, cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        items: [{ materialRequestItemId: steelLine.id, quantity: "40.5" }],
      }),
    );
    expect(short.status).toBe(StatusCodes.CONFLICT);
    expect(await code(short)).toBe("DELIVERY_NOTE_EXCEEDS_PENDING");

    const first = await createNote(
      jsonRequest(`${API}/delivery-notes`, cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        deliveredTo: "Murugan",
        items: [
          { materialRequestItemId: cementLine.id, quantity: "5" },
          { materialRequestItemId: steelLine.id, quantity: "40" },
        ],
      }),
    );
    expect(first.status).toBe(StatusCodes.CREATED);
    let note = await json<Note>(first);
    expect(note.number).toMatch(/^DN/);
    expect(note.status).toBe("pending");

    // A pending note holds its quantity: the next one may take only 3.
    request = await json<MaterialRequest>(
      await getRequest(
        jsonRequest(`${API}/material-requests/${request.id}`, cookie),
        ctx(request.id),
      ),
    );
    expect(request.items[0]?.pendingQty).toBe("3.000");
    const over = await createNote(
      jsonRequest(`${API}/delivery-notes`, cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        items: [{ materialRequestItemId: cementLine.id, quantity: "4" }],
      }),
    );
    expect(await code(over)).toBe("DELIVERY_NOTE_EXCEEDS_PENDING");

    // Pending notes move nothing; edits are allowed.
    const edited = await updateNote(
      jsonRequest(`${API}/delivery-notes/${note.id}/update`, cookie, {
        deliveryDate: TODAY,
        items: [
          { materialRequestItemId: cementLine.id, quantity: "6" },
          { materialRequestItemId: steelLine.id, quantity: "40" },
        ],
        expectedUpdatedAt: note.updatedAt,
      }),
      ctx(note.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    note = await json<Note>(edited);

    // The request cannot be edited or deleted once a note exists.
    const editRequest = await updateRequest(
      jsonRequest(`${API}/material-requests/${request.id}/update`, cookie, {
        requestDate: TODAY,
        storeId,
        items: [{ materialId: cement.id, askQty: "9" }],
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(await code(editRequest)).toBe("MATERIAL_REQUEST_HAS_DELIVERY_NOTES");
    const removeRequest = await deleteRequest(
      jsonRequest(`${API}/material-requests/${request.id}/delete`, cookie, {
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(await code(removeRequest)).toBe("MATERIAL_REQUEST_HAS_DELIVERY_NOTES");

    // Approve: Issued at the store, in transit to the Project.
    const approved = await approveNote(
      jsonRequest(`${API}/delivery-notes/${note.id}/approve`, cookie, {}),
      ctx(note.id),
    );
    expect(approved.status).toBe(StatusCodes.OK);
    note = await json<Note>(approved);
    expect(note.status).toBe("in_transit");
    const again = await approveNote(
      jsonRequest(`${API}/delivery-notes/${note.id}/approve`, cookie, {}),
      ctx(note.id),
    );
    expect(await code(again)).toBe("DELIVERY_NOTE_NOT_PENDING");
    const noDelete = await deleteNote(
      jsonRequest(`${API}/delivery-notes/${note.id}/delete`, cookie, {
        expectedUpdatedAt: note.updatedAt,
      }),
      ctx(note.id),
    );
    expect(await code(noDelete)).toBe("DELIVERY_NOTE_NOT_PENDING");

    type Inventory = {
      materials: {
        materialId: string;
        totalStock: string;
        totalInTransit: string;
        positions: {
          location: { kind: string; id: string };
          stock: string;
          inTransit: string;
          state: string;
        }[];
      }[];
    };
    let inventory = await json<Inventory>(
      await getInventory(jsonRequest(`${API}/central-inventory`, cookie)),
    );
    const cementRow = () =>
      inventory.materials.find((row) => row.materialId === cement.id);
    expect(cementRow()?.totalStock).toBe("4.000");
    expect(cementRow()?.totalInTransit).toBe("6.000");
    expect(
      cementRow()?.positions.find((row) => row.location.id === tower)?.inTransit,
    ).toBe("6.000");
    expect(
      cementRow()?.positions.find((row) => row.location.id === storeId)?.state,
    ).toBe("low_stock");

    // Mark as Delivered: Received from store at the Project.
    const delivered = await markDelivered(
      jsonRequest(`${API}/delivery-notes/${note.id}/mark-delivered`, cookie, {
        deliveredOn: TODAY,
        expectedUpdatedAt: note.updatedAt,
      }),
      ctx(note.id),
    );
    expect(delivered.status).toBe(StatusCodes.OK);
    expect((await json<Note>(delivered)).status).toBe("delivered");
    request = await json<MaterialRequest>(
      await getRequest(
        jsonRequest(`${API}/material-requests/${request.id}`, cookie),
        ctx(request.id),
      ),
    );
    expect(request.status).toBe("partially_delivered");
    expect(request.items.map((item) => item.deliveredQty)).toEqual([
      "6.000",
      "40.000",
    ]);
    inventory = await json<Inventory>(
      await getInventory(jsonRequest(`${API}/central-inventory`, cookie)),
    );
    expect(cementRow()?.totalStock).toBe("10.000");
    expect(cementRow()?.totalInTransit).toBe("0.000");

    // Save & Approve the rest, deliver it: the request is delivered.
    const rest = await createNote(
      jsonRequest(`${API}/delivery-notes`, cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        approve: true,
        items: [{ materialRequestItemId: cementLine.id, quantity: "2" }],
      }),
    );
    expect(rest.status).toBe(StatusCodes.CREATED);
    const restNote = await json<Note>(rest);
    expect(restNote.status).toBe("in_transit");
    expect(restNote.items[0]?.pendingQty).toBe("2.000");
    await markDelivered(
      jsonRequest(`${API}/delivery-notes/${restNote.id}/mark-delivered`, cookie, {
        deliveredOn: TODAY,
        expectedUpdatedAt: restNote.updatedAt,
      }),
      ctx(restNote.id),
    );
    request = await json<MaterialRequest>(
      await getRequest(
        jsonRequest(`${API}/material-requests/${request.id}`, cookie),
        ctx(request.id),
      ),
    );
    expect(request.status).toBe("delivered");
    const closeDone = await closeRequest(
      jsonRequest(`${API}/material-requests/${request.id}/close`, cookie, {
        reason: "Nothing left",
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(await code(closeDone)).toBe("MATERIAL_REQUEST_NOT_OPEN");

    const pdf = await requestPdf(
      jsonRequest(`${API}/material-requests/${request.id}/pdf`, cookie),
      ctx(request.id),
    );
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 5))).toBe(
      "%PDF-",
    );

    // The ledger shows issued at the store and received at the Project.
    const ledger = await json<{
      rows: {
        location: { id: string };
        materialId: string;
        opening: string;
        movements: Record<string, string>;
        closing: string;
      }[];
    }>(
      await getLedger(
        jsonRequest(
          `${API}/central-inventory/stock-ledger?from=${TODAY}&to=${TODAY}&locations=store:${storeId},project:${tower}`,
          cookie,
        ),
      ),
    );
    const storeCement = ledger.rows.find(
      (row) => row.location.id === storeId && row.materialId === cement.id,
    );
    expect(storeCement).toMatchObject({
      opening: "10.000",
      closing: "2.000",
    });
    expect(storeCement?.movements["issued"]).toBe("-8.000");
    const siteCement = ledger.rows.find(
      (row) => row.location.id === tower && row.materialId === cement.id,
    );
    expect(siteCement?.movements["received_from_store"]).toBe("8.000");
    expect(siteCement?.closing).toBe("8.000");
    const xlsx = await getLedgerXlsx(
      jsonRequest(
        `${API}/central-inventory/stock-ledger/xlsx?from=${TODAY}&to=${TODAY}`,
        cookie,
      ),
    );
    expect(xlsx.status).toBe(StatusCodes.OK);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheetml");
  });

  it("closes what is left, refuses while a note is open, and approves in bulk", async () => {
    const company = await ownerWithCompany();
    const { cookie } = company;
    const { tower, cement, storeId } = await setup(company);
    let request = await json<MaterialRequest>(
      await raise(company, {
        projectId: tower,
        requestDate: TODAY,
        storeId,
        items: [{ materialId: cement.id, askQty: "8" }],
      }),
    );
    const line = request.items[0];
    if (line == null) throw new Error("line");
    const notes = [];
    for (const quantity of ["1", "2"])
      notes.push(
        await json<Note>(
          await createNote(
            jsonRequest(`${API}/delivery-notes`, cookie, {
              materialRequestId: request.id,
              deliveryDate: TODAY,
              items: [{ materialRequestItemId: line.id, quantity }],
            }),
          ),
        ),
      );
    request = await json<MaterialRequest>(
      await getRequest(
        jsonRequest(`${API}/material-requests/${request.id}`, cookie),
        ctx(request.id),
      ),
    );
    const blocked = await closeRequest(
      jsonRequest(`${API}/material-requests/${request.id}/close`, cookie, {
        reason: "Out of cement",
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(await code(blocked)).toBe("MATERIAL_REQUEST_HAS_OPEN_DELIVERY_NOTES");

    const bulk = await bulkApprove(
      jsonRequest(`${API}/delivery-notes/approve`, cookie, {
        ids: notes.map((note) => note.id),
      }),
    );
    expect(bulk.status).toBe(StatusCodes.NO_CONTENT);
    const refused = await bulkApprove(
      jsonRequest(`${API}/delivery-notes/approve`, cookie, {
        ids: notes.map((note) => note.id),
      }),
    );
    expect(await code(refused)).toBe("BULK_DECISION_REFUSED");
    for (const note of notes) {
      const fresh = await json<Note>(
        await getNote(
          jsonRequest(`${API}/delivery-notes/${note.id}`, cookie),
          ctx(note.id),
        ),
      );
      await markDelivered(
        jsonRequest(`${API}/delivery-notes/${note.id}/mark-delivered`, cookie, {
          deliveredOn: TODAY,
          expectedUpdatedAt: fresh.updatedAt,
        }),
        ctx(note.id),
      );
    }
    request = await json<MaterialRequest>(
      await getRequest(
        jsonRequest(`${API}/material-requests/${request.id}`, cookie),
        ctx(request.id),
      ),
    );
    expect(request.status).toBe("partially_delivered");
    const noReason = await closeRequest(
      jsonRequest(`${API}/material-requests/${request.id}/close`, cookie, {
        reason: " ",
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(await code(noReason)).toBe("CLOSE_REASON_REQUIRED");
    const closed = await closeRequest(
      jsonRequest(`${API}/material-requests/${request.id}/close`, cookie, {
        reason: "Out of cement",
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(closed.status).toBe(StatusCodes.OK);
    const after = await json<MaterialRequest & { closeReason: string }>(closed);
    expect(after.status).toBe("closed");
    expect(after.closeReason).toBe("Out of cement");
    expect(after.items[0]?.pendingQty).toBe("0.000");
    const late = await createNote(
      jsonRequest(`${API}/delivery-notes`, cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        items: [{ materialRequestItemId: line.id, quantity: "1" }],
      }),
    );
    expect(await code(late)).toBe("MATERIAL_REQUEST_NOT_OPEN");
  });

  it("needs the Project for the site side and the menus for the store side", async () => {
    const company = await ownerWithCompany();
    const { tower, cement, storeId } = await setup(company);
    const grants: PermissionGrants = {
      "procurement.material_requests": ["create", "read", "update"],
    };
    const member = await memberWith(company, grants);
    const body = {
      projectId: tower,
      requestDate: TODAY,
      storeId,
      items: [{ materialId: cement.id, askQty: "1" }],
    };
    const offProject = await raise(company, body, member.cookie);
    expect(offProject.status).toBe(StatusCodes.FORBIDDEN);
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: member.memberId, projectId: tower },
    });
    const onProject = await raise(company, body, member.cookie);
    expect(onProject.status).toBe(StatusCodes.CREATED);
    const request = await json<MaterialRequest>(onProject);
    const list = await json<{ total: number }>(
      await listRequests(
        jsonRequest(
          `${API}/material-requests?projectId=${tower}`,
          member.cookie,
        ),
      ),
    );
    expect(list.total).toBe(1);
    const storeSide = await listRequests(
      jsonRequest(`${API}/material-requests?storeId=${storeId}`, member.cookie),
    );
    expect(storeSide.status).toBe(StatusCodes.FORBIDDEN);
    const line = request.items[0];
    if (line == null) throw new Error("line");
    const noteByMember = await createNote(
      jsonRequest(`${API}/delivery-notes`, member.cookie, {
        materialRequestId: request.id,
        deliveryDate: TODAY,
        items: [{ materialRequestItemId: line.id, quantity: "1" }],
      }),
    );
    expect(noteByMember.status).toBe(StatusCodes.FORBIDDEN);
    const close = await closeRequest(
      jsonRequest(`${API}/material-requests/${request.id}/close`, member.cookie, {
        reason: "No",
        expectedUpdatedAt: request.updatedAt,
      }),
      ctx(request.id),
    );
    expect(close.status).toBe(StatusCodes.FORBIDDEN);

    // The site marks the store's approved note delivered with MR update.
    const note = await json<Note>(
      await createNote(
        jsonRequest(`${API}/delivery-notes`, company.cookie, {
          materialRequestId: request.id,
          deliveryDate: TODAY,
          approve: true,
          items: [{ materialRequestItemId: line.id, quantity: "1" }],
        }),
      ),
    );
    const seen = await getNote(
      jsonRequest(`${API}/delivery-notes/${note.id}`, member.cookie),
      ctx(note.id),
    );
    expect(seen.status).toBe(StatusCodes.OK);
    const done = await markDelivered(
      jsonRequest(`${API}/delivery-notes/${note.id}/mark-delivered`, member.cookie, {
        deliveredOn: TODAY,
        expectedUpdatedAt: note.updatedAt,
      }),
      ctx(note.id),
    );
    expect(done.status).toBe(StatusCodes.OK);

    const noInventory = await getInventory(
      jsonRequest(`${API}/central-inventory`, member.cookie),
    );
    expect(noInventory.status).toBe(StatusCodes.FORBIDDEN);
  });
});

describe("Central Inventory HTTP (CM-509)", () => {
  it("totals a material across two Projects and a Store, by filter", async () => {
    const company = await ownerWithCompany();
    const { workspaceId, userId, cookie } = company;
    const { tower, villa, cement, steel, storeId, categoryId } =
      await setup(company);
    await addOpeningStock(
      workspaceId,
      userId,
      { kind: "project", id: tower },
      cement.id,
      "20.5",
    );
    await addOpeningStock(
      workspaceId,
      userId,
      { kind: "project", id: villa },
      cement.id,
      "3",
    );
    type Inventory = {
      locations: { id: string }[];
      categories: { id: string }[];
      materials: {
        materialId: string;
        totalStock: string;
        positions: { location: { id: string; name: string }; state: string }[];
      }[];
    };
    const all = await json<Inventory>(
      await getInventory(jsonRequest(`${API}/central-inventory`, cookie)),
    );
    expect(all.locations.map((location) => location.id)).toEqual(
      expect.arrayContaining([tower, villa, storeId]),
    );
    expect(all.categories.map((category) => category.id)).toEqual([categoryId]);
    const cementRow = all.materials.find((row) => row.materialId === cement.id);
    expect(cementRow?.totalStock).toBe("33.500");
    expect(cementRow?.positions.map((row) => row.location.name)).toEqual([
      "Tower A",
      "Villa",
      "Ambattur Store",
    ]);
    expect(cementRow?.positions.map((row) => row.state)).toEqual([
      "in_stock",
      "low_stock",
      "in_stock",
    ]);

    const projects = await json<Inventory>(
      await getInventory(
        jsonRequest(
          `${API}/central-inventory?locations=project:${tower},project:${villa}`,
          cookie,
        ),
      ),
    );
    expect(
      projects.materials.find((row) => row.materialId === cement.id)?.totalStock,
    ).toBe("23.500");
    expect(
      projects.materials.find((row) => row.materialId === steel.id),
    ).toBeUndefined();

    const civil = await json<Inventory>(
      await getInventory(
        jsonRequest(`${API}/central-inventory?categoryId=${categoryId}`, cookie),
      ),
    );
    expect(civil.materials.map((row) => row.materialId)).toEqual([cement.id]);
    const low = await json<Inventory>(
      await getInventory(
        jsonRequest(`${API}/central-inventory?state=low_stock`, cookie),
      ),
    );
    expect(low.materials.map((row) => row.positions.length)).toEqual([1]);

    const bad = await getInventory(
      jsonRequest(`${API}/central-inventory?locations=depot:1`, cookie),
    );
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("lists every Central Store route on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      await getOpenApi(),
    );
    for (const path of [
      "/api/construction/procurement/stores",
      "/api/construction/procurement/stores/{id}/stock",
      "/api/construction/procurement/material-requests/{id}/close",
      "/api/construction/procurement/delivery-notes/{id}/mark-delivered",
      "/api/construction/procurement/central-inventory/stock-ledger/xlsx",
    ])
      expect(document.paths[path]).toBeDefined();
  });
});
