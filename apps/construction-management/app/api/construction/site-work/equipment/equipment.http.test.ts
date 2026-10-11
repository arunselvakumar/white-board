import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import type { Flag } from "@/src/shared-kernel/access";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { TEST_ORIGIN } from "@/test/sessions";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { pngBytes } from "@/test/files";
import { addContractor } from "@/test/procurement";
import {
  EQUIPMENT_API,
  equipmentAdd,
  equipmentLogMaintenance,
  equipmentOwnedInput,
  equipmentRentedInput,
  equipmentSheetRow,
  equipmentTransfer,
  type EquipmentJson,
} from "@/test/site-work";

import { POST as availability } from "./[id]/availability/route";
import { POST as remove } from "./[id]/delete/route";
import { POST as closeMaintenance } from "./[id]/maintenance/[maintenanceId]/close/route";
import { POST as deleteMaintenance } from "./[id]/maintenance/[maintenanceId]/delete/route";
import { POST as updateMaintenance } from "./[id]/maintenance/[maintenanceId]/update/route";
import { POST as openMaintenance } from "./[id]/maintenance/route";
import { POST as removePhoto } from "./[id]/photo/remove/route";
import { GET as photo, POST as completePhoto } from "./[id]/photo/route";
import { GET as photoThumbnail } from "./[id]/photo/thumbnail/route";
import { POST as receivePhoto } from "./[id]/photo/uploads/app/route";
import { POST as startPhoto } from "./[id]/photo/uploads/route";
import { GET as getOne } from "./[id]/route";
import { POST as transfer } from "./[id]/transfer/route";
import { POST as update } from "./[id]/update/route";
import { GET as formOptions } from "./form-options/route";
import { GET as list, POST as create } from "./route";
import { GET as sheetOptions } from "./sheet-options/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const TODAY = todayIn("Asia/Kolkata");
const MENU = "masters.equipments";
const USAGE = "site_work.equipment_usage";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const entryParams = (id: string, maintenanceId: string) => ({
  params: Promise.resolve({ id, maintenanceId }),
});

function post(path: string, body: unknown): Request {
  return new Request(`${EQUIPMENT_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const get = (path: string) => new Request(`${EQUIPMENT_API}${path}`);

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function error(
  response: Response,
): Promise<{ status: number; code: string; field?: unknown }> {
  const body = await json<{ code: string; details?: { field?: unknown } }>(
    response,
  );
  return {
    status: response.status,
    code: body.code,
    field: body.details?.field,
  };
}

async function setup() {
  const company = await newCompany();
  const owner = {
    userId: company.ownerId,
    workspaceId: company.workspaceId,
    role: "owner" as const,
  };
  const tower = await addProject(
    company.workspaceId,
    company.ownerId,
    "Tower A",
  );
  const villa = await addProject(
    company.workspaceId,
    company.ownerId,
    "Villa B",
  );
  const hireParty = await addContractor(company.workspaceId, company.ownerId);
  actAs(owner);
  return { company, owner, tower, villa, hireParty };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function member(
  ctx: Ctx,
  grants: Record<string, Flag[]>,
  projectIds: readonly string[] = [],
) {
  const added = await addMember(
    ctx.company.workspaceId,
    ctx.company.ownerId,
    grants,
  );
  for (const projectId of projectIds)
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: added.memberId, projectId },
    });
  return {
    userId: added.userId,
    workspaceId: ctx.company.workspaceId,
    role: "member" as const,
  };
}

async function detail(id: string): Promise<EquipmentJson> {
  return json<EquipmentJson>(await getOne(get(`/${id}`), params(id)));
}

describe("Equipment register (CM-603)", () => {
  it("adds owned equipment at a Project with an added movement, reads and lists it", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.tower,
        equipmentNumber: "TN-09-AB-1234",
      }),
    );
    expect(added.currentProject).toEqual({ id: ctx.tower, name: "Tower A" });
    expect(added.currentLocationName).toBe("Tower A");
    expect(added.state).toBe("available");
    expect(added.movements).toEqual([
      expect.objectContaining({
        kind: "added",
        movementDate: TODAY,
        before: null,
        toProject: { id: ctx.tower, name: "Tower A" },
      }),
    ]);
    const page = await json<{ items: EquipmentJson[]; total: number }>(
      await list(get(`?projectId=${ctx.tower}`)),
    );
    expect(page.items.map((item) => item.id)).toEqual([added.id]);
    const warehouse = await json<{ total: number }>(
      await list(get("?warehouse=true")),
    );
    expect(warehouse.total).toBe(0);
    const searched = await json<{ total: number }>(
      await list(get("?search=ab-12")),
    );
    expect(searched.total).toBe(1);
  });

  it("keeps the Equipment Number unique among live equipment, ignoring case", async () => {
    const ctx = await setup();
    const first = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({ equipmentNumber: "KA-01-X-1" }),
    );
    const again = await create(
      post("", equipmentOwnedInput({ equipmentNumber: "ka-01-x-1" })),
    );
    expect(await error(again)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_NUMBER_TAKEN",
    });
    const second = await equipmentAdd(ctx.owner);
    const renamed = await update(
      post(`/${second.id}/update`, {
        ...equipmentOwnedInput({ equipmentNumber: "KA-01-X-1" }),
        expectedUpdatedAt: second.updatedAt,
      }),
      params(second.id),
    );
    expect((await error(renamed)).code).toBe("EQUIPMENT_NUMBER_TAKEN");
    // A deleted machine's number is free again.
    expect(
      (
        await remove(
          post(`/${first.id}/delete`, { expectedUpdatedAt: first.updatedAt }),
          params(first.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect(
      (
        await create(
          post("", equipmentOwnedInput({ equipmentNumber: "KA-01-X-1" })),
        )
      ).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("validates the fields of CM-0016 §10", async () => {
    const ctx = await setup();
    const cases: [Record<string, unknown>, string, string][] = [
      [equipmentOwnedInput({ name: " " }), "EQUIPMENT_NAME_REQUIRED", "name"],
      [
        equipmentOwnedInput({
          utilisationBasis: "km",
          targetUnit: "km_per_day",
        }),
        "WORKING_TIME_METHOD_INVALID",
        "workingTimeMethod",
      ],
      [
        equipmentOwnedInput({ targetUnit: "trips_per_day" }),
        "TARGET_UNIT_INVALID",
        "targetUnit",
      ],
      [
        equipmentOwnedInput({ minUtilisationPct: "101" }),
        "MIN_UTILISATION_INVALID",
        "minUtilisationPct",
      ],
      [
        equipmentOwnedInput({ purchaseYear: 1949 }),
        "PURCHASE_YEAR_INVALID",
        "purchaseYear",
      ],
      [
        equipmentRentedInput(ctx.hireParty, { purchaseYear: 2020 }),
        "PURCHASE_YEAR_OWNED_ONLY",
        "purchaseYear",
      ],
      [
        equipmentRentedInput(ctx.hireParty, { hireBasis: null }),
        "HIRE_BASIS_REQUIRED",
        "hireBasis",
      ],
      [
        equipmentOwnedInput({ idleChargeable: true }),
        "IDLE_CHARGEABLE_RENTED_ONLY",
        "idleChargeable",
      ],
      [
        equipmentRentedInput(crypto.randomUUID()),
        "HIRE_PARTY_NOT_FOUND",
        "hirePartyId",
      ],
      [
        equipmentOwnedInput({ projectId: crypto.randomUUID() }),
        "PROJECT_NOT_FOUND",
        "projectId",
      ],
      [
        equipmentOwnedInput({ placedOn: addDays(TODAY, 1) }),
        "PLACED_ON_IN_FUTURE",
        "placedOn",
      ],
    ];
    for (const [input, code, field] of cases)
      expect(await error(await create(post("", input))), code).toEqual({
        status: StatusCodes.BAD_REQUEST,
        code,
        field,
      });
  });

  it("hides hire rates and maintenance costs without Financial", async () => {
    const ctx = await setup();
    const rented = await equipmentAdd(
      ctx.owner,
      equipmentRentedInput(ctx.hireParty, { projectId: ctx.tower }),
    );
    expect(rented.hireRate).toBe(120_000);
    expect(rented.hireParty?.id).toBe(ctx.hireParty);
    const logged = await equipmentLogMaintenance(ctx.owner, rented, {
      startDate: TODAY,
      cost: 450_000,
    });
    expect(logged.maintenance?.[0]?.cost).toBe(450_000);

    const reader = await member(ctx, { [MENU]: ["read", "update"] });
    actAs(reader);
    const seen = await detail(rented.id);
    expect(seen.hireRate).toBeNull();
    expect(seen.maintenance?.[0]?.cost).toBeNull();
    expect(seen.actions?.["seeRates"]).toBe(false);
    const listed = await json<{ items: EquipmentJson[] }>(await list(get("")));
    expect(listed.items[0]?.hireRate).toBeNull();

    // Without Financial a rate is never sent, and an edit keeps it.
    const kept = await update(
      post(`/${rented.id}/update`, {
        ...equipmentRentedInput(ctx.hireParty, { name: "Hired JCB" }),
        hireRate: undefined,
        equipmentNumber: "RT-KEEP-1",
        expectedUpdatedAt: seen.updatedAt,
      }),
      params(rented.id),
    );
    expect(kept.status).toBe(StatusCodes.OK);
    const sent = await update(
      post(`/${rented.id}/update`, {
        ...equipmentRentedInput(ctx.hireParty, { hireRate: 1 }),
        expectedUpdatedAt: (await json<EquipmentJson>(kept)).updatedAt,
      }),
      params(rented.id),
    );
    expect((await error(sent)).status).toBe(StatusCodes.FORBIDDEN);
    actAs(ctx.owner);
    expect((await detail(rented.id)).hireRate).toBe(120_000);

    // Financial on Equipment Usage at its Project shows the rate there.
    const engineer = await member(ctx, { [USAGE]: ["read", "financial"] }, [
      ctx.tower,
    ]);
    actAs(engineer);
    const atTower = await json<{ items: EquipmentJson[] }>(
      await list(get(`?projectId=${ctx.tower}`)),
    );
    expect(atTower.items[0]?.hireRate).toBe(120_000);
    expect((await detail(rented.id)).maintenance?.[0]?.cost).toBeNull();
  });

  it("refuses a delete while it has live usage sheets, then tombstones it", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({ projectId: ctx.tower }),
    );
    const sheetId = await equipmentSheetRow(
      ctx.company.workspaceId,
      ctx.company.ownerId,
      { equipmentId: added.id, projectId: ctx.tower, sheetDate: TODAY },
    );
    const refused = await remove(
      post(`/${added.id}/delete`, { expectedUpdatedAt: added.updatedAt }),
      params(added.id),
    );
    expect(await error(refused)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_IN_USE",
    });
    await prisma.constructionSiteWorkEquipmentUsageSheet.update({
      where: { id: sheetId },
      data: { deletedAt: new Date(), deletedBy: ctx.company.ownerId },
    });
    const stale = await remove(
      post(`/${added.id}/delete`, {
        expectedUpdatedAt: new Date(0).toISOString(),
      }),
      params(added.id),
    );
    expect((await error(stale)).code).toBe("EQUIPMENT_CHANGED");
    expect(
      (
        await remove(
          post(`/${added.id}/delete`, { expectedUpdatedAt: added.updatedAt }),
          params(added.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await getOne(get(`/${added.id}`), params(added.id))).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const row = await prisma.constructionSiteWorkEquipment.findUnique({
      where: { id: added.id },
    });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("lets Equipment Usage on a Project list and add equipment there only", async () => {
    const ctx = await setup();
    await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({ projectId: ctx.tower }),
    );
    await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({ projectId: ctx.villa }),
    );
    const engineer = await member(ctx, { [USAGE]: ["read", "create"] }, [
      ctx.tower,
    ]);
    actAs(engineer);
    const atTower = await json<{ total: number }>(
      await list(get(`?projectId=${ctx.tower}`)),
    );
    expect(atTower.total).toBe(1);
    expect((await list(get(""))).status).toBe(StatusCodes.FORBIDDEN);
    expect((await list(get(`?projectId=${ctx.villa}`))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const addedHere = await create(
      post("", equipmentOwnedInput({ projectId: ctx.tower })),
    );
    expect(addedHere.status).toBe(StatusCodes.CREATED);
    const addedId = (await json<EquipmentJson>(addedHere)).id;
    expect((await getOne(get(`/${addedId}`), params(addedId))).status).toBe(
      StatusCodes.OK,
    );
    expect(
      (await create(post("", equipmentOwnedInput({ projectId: ctx.villa }))))
        .status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await create(post("", equipmentOwnedInput({ projectId: null })))).status,
    ).toBe(StatusCodes.FORBIDDEN);
    // Rented equipment needs a rate, which needs Financial.
    expect(
      (
        await create(
          post(
            "",
            equipmentRentedInput(ctx.hireParty, { projectId: ctx.tower }),
          ),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    const options = await formOptions(
      get(`/form-options?projectId=${ctx.tower}`),
    );
    expect(options.status).toBe(StatusCodes.OK);
    expect((await formOptions(get("/form-options"))).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    // Equipments Create alone adds anywhere.
    const clerk = await member(ctx, { [MENU]: ["create"] });
    actAs(clerk);
    expect(
      (await create(post("", equipmentOwnedInput({ projectId: ctx.villa }))))
        .status,
    ).toBe(StatusCodes.CREATED);
  });

  it("uploads, shows and removes the photo through the attachments service", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(ctx.owner);
    const started = await startPhoto(
      post(`/${added.id}/photo/uploads`, {
        fileName: "jcb.png",
        bytes: pngBytes().byteLength,
      }),
      params(added.id),
    );
    expect(started.status).toBe(StatusCodes.CREATED);
    const body = await json<{
      key: string;
      upload: { via: string; url?: string };
    }>(started);
    expect(body.upload.via).toBe("app");
    const sent = await receivePhoto(
      new Request(`${TEST_ORIGIN}${body.upload.url ?? ""}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: Uint8Array.from(pngBytes()),
      }),
      params(added.id),
    );
    expect(sent.status).toBe(StatusCodes.NO_CONTENT);
    const completed = await completePhoto(
      post(`/${added.id}/photo`, { key: body.key, fileName: "jcb.png" }),
      params(added.id),
    );
    expect(completed.status).toBe(StatusCodes.CREATED);
    expect((await json<EquipmentJson>(completed)).photo?.url).toMatch(
      /\/photo\?v=/,
    );
    const image = await photo(get(`/${added.id}/photo`), params(added.id));
    expect(image.status).toBe(StatusCodes.OK);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(
      (
        await photoThumbnail(
          get(`/${added.id}/photo/thumbnail`),
          params(added.id),
        )
      ).status,
    ).toBe(StatusCodes.OK);
    const pdf = await startPhoto(
      post(`/${added.id}/photo/uploads`, { fileName: "jcb.pdf", bytes: 100 }),
      params(added.id),
    );
    expect((await error(pdf)).code).toBe("FILE_TYPE_NOT_ALLOWED");
    const removed = await removePhoto(
      post(`/${added.id}/photo/remove`, {}),
      params(added.id),
    );
    expect((await json<EquipmentJson>(removed)).photo).toBeNull();
    expect(
      (await photo(get(`/${added.id}/photo`), params(added.id))).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("keeps each Company's equipment to itself", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.tower,
        placedOn: addDays(TODAY, -5),
      }),
    );
    const logged = await equipmentLogMaintenance(ctx.owner, added, {
      startDate: addDays(TODAY, -1),
    });
    const entryId = logged.openMaintenance?.id ?? "";

    // Another Company's owner, with full rights in their own Company.
    const other = await setup();
    const hidden = async (response: Response) => {
      expect(await error(response)).toMatchObject({
        status: StatusCodes.NOT_FOUND,
        code: "EQUIPMENT_NOT_FOUND",
      });
    };
    await hidden(await getOne(get(`/${added.id}`), params(added.id)));
    await hidden(
      await update(
        post(`/${added.id}/update`, {
          ...equipmentOwnedInput({ equipmentNumber: "XC-01" }),
          expectedUpdatedAt: logged.updatedAt,
        }),
        params(added.id),
      ),
    );
    await hidden(
      await transfer(
        post(`/${added.id}/transfer`, {
          expectedUpdatedAt: logged.updatedAt,
          kind: "to_project",
          toProjectId: other.tower,
          movementDate: TODAY,
          locationName: "Yard",
        }),
        params(added.id),
      ),
    );
    await hidden(
      await updateMaintenance(
        post(`/${added.id}/maintenance/${entryId}/update`, {
          expectedUpdatedAt: logged.updatedAt,
          kind: "repair",
          startDate: addDays(TODAY, -1),
          workshop: "Elsewhere",
        }),
        entryParams(added.id, entryId),
      ),
    );
    await hidden(await photo(get(`/${added.id}/photo`), params(added.id)));
    // Nothing changed in the first Company.
    actAs(ctx.owner);
    expect(await detail(added.id)).toMatchObject({
      updatedAt: logged.updatedAt,
      currentProject: { id: ctx.tower },
    });
  });
});

describe("Equipment lifecycle (CM-605)", () => {
  it("transfers to another Project and to the warehouse under the date rules", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.tower,
        placedOn: addDays(TODAY, -10),
      }),
    );
    const call = (body: Record<string, unknown>, updatedAt = added.updatedAt) =>
      transfer(
        post(`/${added.id}/transfer`, {
          expectedUpdatedAt: updatedAt,
          kind: "to_project",
          toProjectId: ctx.villa,
          movementDate: addDays(TODAY, -2),
          locationName: "Block C yard",
          ...body,
        }),
        params(added.id),
      );
    expect(
      await error(await call({ movementDate: addDays(TODAY, 1) })),
    ).toMatchObject({
      code: "TRANSFER_DATE_IN_FUTURE",
      field: "movementDate",
    });
    expect(
      (await error(await call({ movementDate: addDays(TODAY, -11) }))).code,
    ).toBe("TRANSFER_BEFORE_LAST_MOVEMENT");
    expect((await error(await call({ toProjectId: ctx.tower }))).code).toBe(
      "TRANSFER_SAME_PROJECT",
    );
    expect((await error(await call({ locationName: " " }))).code).toBe(
      "LOCATION_NAME_REQUIRED",
    );
    await equipmentSheetRow(ctx.company.workspaceId, ctx.company.ownerId, {
      equipmentId: added.id,
      projectId: ctx.tower,
      sheetDate: addDays(TODAY, -1),
    });
    expect(await error(await call({}))).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      code: "TRANSFER_BEFORE_LAST_SHEET",
    });
    expect((await error(await call({}, new Date(0).toISOString()))).code).toBe(
      "EQUIPMENT_CHANGED",
    );

    // The day of the last sheet is still refused: the machine was there.
    expect(
      (await error(await call({ movementDate: addDays(TODAY, -1) }))).code,
    ).toBe("TRANSFER_BEFORE_LAST_SHEET");
    const moved = await json<EquipmentJson>(
      await call({ movementDate: TODAY, remark: "Slab work" }),
    );
    expect(moved.currentProject?.id).toBe(ctx.villa);
    expect(moved.currentLocationName).toBe("Block C yard");
    expect(moved.movements?.at(-1)).toMatchObject({
      kind: "to_project",
      before: {
        project: { id: ctx.tower, name: "Tower A" },
        locationName: "Tower A",
      },
      toProject: { id: ctx.villa, name: "Villa B" },
      locationName: "Block C yard",
      remark: "Slab work",
    });
    const atTower = await json<{ total: number }>(
      await list(get(`?projectId=${ctx.tower}`)),
    );
    expect(atTower.total).toBe(0);

    const stored = await equipmentTransfer(ctx.owner, moved, {
      kind: "to_warehouse",
      movementDate: TODAY,
      locationName: "Ambattur godown",
    });
    expect(stored.currentProject).toBeNull();
    const again = await transfer(
      post(`/${added.id}/transfer`, {
        expectedUpdatedAt: stored.updatedAt,
        kind: "to_warehouse",
        movementDate: TODAY,
        locationName: "Ambattur godown",
      }),
      params(added.id),
    );
    expect(await error(again)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_AT_WAREHOUSE",
    });

    // Transfer needs the T flag.
    const updater = await member(ctx, { [MENU]: ["read", "update"] });
    actAs(updater);
    expect(
      (
        await transfer(
          post(`/${added.id}/transfer`, {
            expectedUpdatedAt: stored.updatedAt,
            kind: "to_project",
            toProjectId: ctx.tower,
            movementDate: TODAY,
            locationName: "Yard",
          }),
          params(added.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("logs maintenance, refuses a second open entry and returns to service", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.tower,
        placedOn: addDays(TODAY, -10),
      }),
    );
    const logged = await equipmentLogMaintenance(ctx.owner, added, {
      startDate: addDays(TODAY, -3),
    });
    expect(logged.state).toBe("in_maintenance");
    expect(logged.actions).toMatchObject({
      transfer: false,
      logMaintenance: false,
      returnToService: true,
    });
    const second = await openMaintenance(
      post(`/${added.id}/maintenance`, {
        expectedUpdatedAt: logged.updatedAt,
        kind: "service",
        startDate: TODAY,
      }),
      params(added.id),
    );
    expect(await error(second)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "MAINTENANCE_ALREADY_OPEN",
    });
    const moving = await transfer(
      post(`/${added.id}/transfer`, {
        expectedUpdatedAt: logged.updatedAt,
        kind: "to_project",
        toProjectId: ctx.villa,
        movementDate: TODAY,
        locationName: "Yard",
      }),
      params(added.id),
    );
    expect(await error(moving)).toMatchObject({
      status: StatusCodes.CONFLICT,
      code: "EQUIPMENT_IN_MAINTENANCE",
    });

    const entryId = logged.openMaintenance?.id ?? "";
    const close = (body: Record<string, unknown>) =>
      closeMaintenance(
        post(`/${added.id}/maintenance/${entryId}/close`, {
          expectedUpdatedAt: logged.updatedAt,
          ...body,
        }),
        entryParams(added.id, entryId),
      );
    expect(
      (await error(await close({ endDate: addDays(TODAY, -4) }))).code,
    ).toBe("MAINTENANCE_END_BEFORE_START");
    expect(
      (await error(await close({ endDate: addDays(TODAY, 1) }))).code,
    ).toBe("MAINTENANCE_DATE_IN_FUTURE");
    const closed = await json<EquipmentJson>(
      await close({ endDate: TODAY, cost: 350_000, remark: "New hose" }),
    );
    expect(closed.state).toBe("available");
    expect(closed.maintenance?.[0]).toMatchObject({
      endDate: TODAY,
      cost: 350_000,
      remark: "New hose",
    });
    expect((await error(await close({ endDate: TODAY }))).code).toBe(
      "EQUIPMENT_CHANGED",
    );
    const closedAgain = await closeMaintenance(
      post(`/${added.id}/maintenance/${entryId}/close`, {
        expectedUpdatedAt: closed.updatedAt,
        endDate: TODAY,
      }),
      entryParams(added.id, entryId),
    );
    expect((await error(closedAgain)).code).toBe("MAINTENANCE_NOT_OPEN");

    const edited = await json<EquipmentJson>(
      await updateMaintenance(
        post(`/${added.id}/maintenance/${entryId}/update`, {
          expectedUpdatedAt: closed.updatedAt,
          kind: "repair",
          startDate: addDays(TODAY, -3),
          endDate: addDays(TODAY, -1),
          workshop: "Velan Motors",
        }),
        entryParams(added.id, entryId),
      ),
    );
    expect(edited.maintenance?.[0]).toMatchObject({
      kind: "repair",
      endDate: addDays(TODAY, -1),
      workshop: "Velan Motors",
      cost: 350_000,
    });
    const deleted = await json<EquipmentJson>(
      await deleteMaintenance(
        post(`/${added.id}/maintenance/${entryId}/delete`, {
          expectedUpdatedAt: edited.updatedAt,
        }),
        entryParams(added.id, entryId),
      ),
    );
    expect(deleted.maintenance).toEqual([]);

    // A cost needs Financial.
    const updater = await member(ctx, { [MENU]: ["read", "update"] });
    actAs(updater);
    const costly = await openMaintenance(
      post(`/${added.id}/maintenance`, {
        expectedUpdatedAt: deleted.updatedAt,
        kind: "service",
        startDate: TODAY,
        cost: 100,
      }),
      params(added.id),
    );
    expect((await error(costly)).status).toBe(StatusCodes.FORBIDDEN);
  });

  it("marks it unavailable for worksheet entry since today, and available again", async () => {
    const ctx = await setup();
    const added = await equipmentAdd(ctx.owner);
    const off = await json<EquipmentJson>(
      await availability(
        post(`/${added.id}/availability`, {
          expectedUpdatedAt: added.updatedAt,
          available: false,
        }),
        params(added.id),
      ),
    );
    expect(off).toMatchObject({
      availableForEntry: false,
      unavailableSince: TODAY,
      state: "unavailable",
    });
    const unavailable = await json<{ total: number }>(
      await list(get("?state=unavailable")),
    );
    expect(unavailable.total).toBe(1);
    const on = await json<EquipmentJson>(
      await availability(
        post(`/${added.id}/availability`, {
          expectedUpdatedAt: off.updatedAt,
          available: true,
        }),
        params(added.id),
      ),
    );
    expect(on).toMatchObject({
      availableForEntry: true,
      unavailableSince: null,
      state: "available",
    });
  });

  it("offers usage-sheet equipment only where it may take a sheet that date", async () => {
    const ctx = await setup();
    const placedOn = addDays(TODAY, -10);
    const at = (patch: Record<string, unknown> = {}) =>
      equipmentAdd(
        ctx.owner,
        equipmentOwnedInput({ projectId: ctx.tower, placedOn, ...patch }),
      );
    const ready = await at({ name: "Ready" });
    await equipmentAdd(
      ctx.owner,
      equipmentRentedInput(ctx.hireParty, {
        projectId: ctx.tower,
        placedOn,
        name: "Rented",
      }),
    );
    const broken = await at({ name: "Broken" });
    await equipmentLogMaintenance(ctx.owner, broken, {
      startDate: addDays(TODAY, -2),
    });
    const parked = await at({ name: "Parked" });
    await availability(
      post(`/${parked.id}/availability`, {
        expectedUpdatedAt: parked.updatedAt,
        available: false,
      }),
      params(parked.id),
    );
    const elsewhere = await equipmentAdd(
      ctx.owner,
      equipmentOwnedInput({
        projectId: ctx.villa,
        placedOn,
        name: "Elsewhere",
      }),
    );
    const left = await at({ name: "Left" });
    await equipmentTransfer(ctx.owner, left, {
      toProjectId: ctx.villa,
      movementDate: addDays(TODAY, -4),
    });
    await equipmentSheetRow(ctx.company.workspaceId, ctx.company.ownerId, {
      equipmentId: ready.id,
      projectId: ctx.tower,
      sheetDate: addDays(TODAY, -6),
      openingReading: "100",
      closingReading: "108.5",
    });
    await equipmentSheetRow(ctx.company.workspaceId, ctx.company.ownerId, {
      equipmentId: ready.id,
      projectId: ctx.tower,
      sheetDate: addDays(TODAY, -6),
      shift: "shift_2",
      openingReading: "108.5",
      closingReading: "112",
    });

    type Options = {
      items: (EquipmentJson & {
        lastClosingReading: { reading: string; sheetDate: string } | null;
      })[];
      blocked: { equipment: EquipmentJson; reason: string }[];
    };
    const optionsOn = async (date: string) =>
      json<Options>(
        await sheetOptions(
          get(`/sheet-options?projectId=${ctx.tower}&date=${date}`),
        ),
      );
    const today = await optionsOn(TODAY);
    expect(today.items.map((item) => item.name).sort()).toEqual([
      "Ready",
      "Rented",
    ]);
    expect(
      today.items.find((item) => item.name === "Ready")?.lastClosingReading,
    ).toEqual({
      reading: "112.00",
      sheetDate: addDays(TODAY, -6),
    });
    expect(today.items.find((item) => item.name === "Rented")?.hireRate).toBe(
      120_000,
    );
    expect(
      Object.fromEntries(
        today.blocked.map((item) => [item.equipment.name, item.reason]),
      ),
    ).toEqual({
      Broken: "EQUIPMENT_IN_MAINTENANCE",
      Parked: "EQUIPMENT_UNAVAILABLE",
    });
    expect(
      today.items.some(
        (item) => item.id === elsewhere.id || item.id === left.id,
      ),
    ).toBe(false);

    // Before the move and the breakdown, Left and Broken were at the Tower.
    const earlier = await optionsOn(addDays(TODAY, -5));
    expect(earlier.items.map((item) => item.name).sort()).toEqual([
      "Broken",
      "Left",
      "Ready",
      "Rented",
    ]);
    expect(
      earlier.items.find((item) => item.name === "Ready")?.lastClosingReading
        ?.reading,
    ).toBe("112.00");
    // Before it was placed nothing was there.
    expect((await optionsOn(addDays(TODAY, -11))).items).toEqual([]);

    // Rates follow Financial; the route needs Equipment Usage Create/Update.
    const engineer = await member(ctx, { [USAGE]: ["read", "create"] }, [
      ctx.tower,
    ]);
    actAs(engineer);
    const plain = await optionsOn(TODAY);
    expect(
      plain.items.find((item) => item.name === "Rented")?.hireRate,
    ).toBeNull();
    const viewer = await member(ctx, { [USAGE]: ["read"] }, [ctx.tower]);
    actAs(viewer);
    expect(
      (
        await sheetOptions(
          get(`/sheet-options?projectId=${ctx.tower}&date=${TODAY}`),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
  });

  it("is on /api/docs", async () => {
    const document = await json<{ paths: Record<string, unknown> }>(
      getOpenApi(),
    );
    for (const path of [
      "/api/construction/site-work/equipment",
      "/api/construction/site-work/equipment/{id}",
      "/api/construction/site-work/equipment/{id}/update",
      "/api/construction/site-work/equipment/{id}/delete",
      "/api/construction/site-work/equipment/{id}/transfer",
      "/api/construction/site-work/equipment/{id}/availability",
      "/api/construction/site-work/equipment/{id}/maintenance",
      "/api/construction/site-work/equipment/{id}/maintenance/{maintenanceId}/close",
      "/api/construction/site-work/equipment/{id}/photo",
      "/api/construction/site-work/equipment/{id}/photo/uploads",
      "/api/construction/site-work/equipment/sheet-options",
      "/api/construction/site-work/equipment/form-options",
    ])
      expect(document.paths[path], path).toBeDefined();
  });
});
