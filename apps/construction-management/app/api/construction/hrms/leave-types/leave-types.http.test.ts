import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { seedCompanyLeaveTypes } from "@/src/hrms/infrastructure/prisma-leave-type-store";
import { memberWith, ownerWithCompany } from "@/test/companies";

import { get, getItem, json, post, postItem } from "../leave-http-support";
import { POST as createStructure } from "../leave-structures/route";
import { POST as activate } from "./[id]/activate/route";
import { POST as deactivate } from "./[id]/deactivate/route";
import { POST as deleteType } from "./[id]/delete/route";
import { GET as getType } from "./[id]/route";
import { POST as updateType } from "./[id]/update/route";
import { GET as accrualOptions } from "./accrual-options/route";
import { GET as listTypes, POST as createType } from "./route";

type TypeBody = {
  id: string;
  name: string;
  yearlyLimit: number;
  isPaid: boolean;
  accrualMode: string;
  accrualDay: number | null;
  creditPerPeriod: number | null;
  carryForward: boolean;
  maxCarryForward: number | null;
  isActive: boolean;
  isSeed: boolean;
  inUse: boolean;
  updatedAt: string;
};

const WFH = {
  name: "Work From Home",
  yearlyLimit: 24,
  isPaid: true,
  requiresApproval: true,
  carryForward: false,
  accrualMode: "periodic",
  accrualDay: 5,
  creditPerPeriod: 2,
  allowAdvanceUse: false,
};

const list = async (cookie: string) =>
  (
    await json<{ items: TypeBody[] }>(
      await get(listTypes, "/leave-types", cookie),
    )
  ).items;

describe("Leave types HTTP (CM-310)", () => {
  it("gives a new Company the six seeds, once", async () => {
    const owner = await ownerWithCompany();
    const items = await list(owner.cookie);
    expect(
      items.map((item) => [
        item.name,
        item.yearlyLimit,
        item.isPaid,
        item.accrualMode,
        item.creditPerPeriod,
        item.carryForward,
        item.isSeed,
      ]),
    ).toEqual([
      ["Casual Leave", 12, true, "upfront", null, false, true],
      ["Compensatory Off", 0, true, "none", null, false, true],
      ["Loss of Pay", 0, false, "none", null, false, true],
      ["Maternity", 182, true, "periodic", 15.17, false, true],
      ["Privilege Leave", 15, true, "periodic", 1.25, true, true],
      ["Sick", 7, true, "periodic", 0.58, false, true],
    ]);
    // The listener and the backfill are idempotent.
    expect(
      await seedCompanyLeaveTypes(prisma, {
        workspaceId: owner.workspaceId,
        by: owner.userId,
      }),
    ).toBe(0);
    expect(await list(owner.cookie)).toHaveLength(6);
  });

  it("adds, edits, deactivates and deletes a type, audited", async () => {
    const owner = await ownerWithCompany();
    const created = await post(createType, "/leave-types", owner.cookie, WFH);
    expect(created.status).toBe(StatusCodes.CREATED);
    const type = await json<TypeBody>(created);
    expect(type).toMatchObject({
      name: "Work From Home",
      accrualMode: "periodic",
      accrualDay: 5,
      creditPerPeriod: 2,
      isSeed: false,
      inUse: false,
      isActive: true,
    });
    expect(
      (await getItem(getType, `/leave-types/${type.id}`, type.id, owner.cookie))
        .status,
    ).toBe(StatusCodes.OK);

    const updated = await postItem(
      updateType,
      `/leave-types/${type.id}/update`,
      type.id,
      owner.cookie,
      {
        ...WFH,
        accrualMode: "upfront",
        carryForward: true,
        maxCarryForward: 4,
        expectedUpdatedAt: type.updatedAt,
      },
    );
    expect(updated.status).toBe(StatusCodes.OK);
    const edited = await json<TypeBody>(updated);
    // Accrual settings are cleared once it is no longer monthly.
    expect(edited).toMatchObject({
      accrualMode: "upfront",
      accrualDay: null,
      creditPerPeriod: null,
      maxCarryForward: 4,
    });

    const stale = await postItem(
      updateType,
      `/leave-types/${type.id}/update`,
      type.id,
      owner.cookie,
      { ...WFH, expectedUpdatedAt: type.updatedAt },
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({ code: "LEAVE_TYPE_CHANGED" });

    const off = await postItem(
      deactivate,
      `/leave-types/${type.id}/deactivate`,
      type.id,
      owner.cookie,
      { expectedUpdatedAt: edited.updatedAt },
    );
    const inactive = await json<TypeBody>(off);
    expect(inactive.isActive).toBe(false);
    const on = await postItem(
      activate,
      `/leave-types/${type.id}/activate`,
      type.id,
      owner.cookie,
      { expectedUpdatedAt: inactive.updatedAt },
    );
    const active = await json<TypeBody>(on);
    expect(active.isActive).toBe(true);

    const deleted = await postItem(
      deleteType,
      `/leave-types/${type.id}/delete`,
      type.id,
      owner.cookie,
      { expectedUpdatedAt: active.updatedAt },
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    expect((await list(owner.cookie)).map((item) => item.name)).not.toContain(
      "Work From Home",
    );
    const actions = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: type.id },
      orderBy: { occurredAt: "asc" },
      select: { action: true },
    });
    expect(actions.map((item) => item.action)).toEqual([
      "leave_type.created",
      "leave_type.updated",
      "leave_type.deactivated",
      "leave_type.activated",
      "leave_type.deleted",
    ]);
  });

  it("names the field a broken rule is about", async () => {
    const owner = await ownerWithCompany();
    const noDay = await post(createType, "/leave-types", owner.cookie, {
      ...WFH,
      accrualDay: null,
    });
    expect(noDay.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(noDay)).toMatchObject({
      code: "ACCRUAL_DAY_REQUIRED",
      details: { field: "accrualDay" },
    });
    const noCap = await post(createType, "/leave-types", owner.cookie, {
      ...WFH,
      carryForward: true,
    });
    expect(await json(noCap)).toMatchObject({
      code: "CARRY_FORWARD_MAX_REQUIRED",
      details: { field: "maxCarryForward" },
    });
    const taken = await post(createType, "/leave-types", owner.cookie, {
      ...WFH,
      name: "casual leave",
      accrualMode: "upfront",
    });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "LEAVE_TYPE_NAME_IN_USE",
      details: { field: "name" },
    });
    const shape = await post(createType, "/leave-types", owner.cookie, {
      ...WFH,
      accrualMode: "weekly",
    });
    expect(await json(shape)).toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses to delete a type in use; it can be deactivated", async () => {
    const owner = await ownerWithCompany();
    const sick = (await list(owner.cookie)).find(
      (item) => item.name === "Sick",
    );
    if (sick == null) throw new Error("no Sick");
    expect(
      (
        await post(createStructure, "/leave-structures", owner.cookie, {
          name: "Office",
          lines: [{ leaveTypeId: sick.id }],
        })
      ).status,
    ).toBe(StatusCodes.CREATED);
    const refused = await postItem(
      deleteType,
      `/leave-types/${sick.id}/delete`,
      sick.id,
      owner.cookie,
      { expectedUpdatedAt: sick.updatedAt },
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json(refused)).toMatchObject({ code: "LEAVE_TYPE_IN_USE" });
    expect(
      (await list(owner.cookie)).find((item) => item.name === "Sick")?.inUse,
    ).toBe(true);
    expect(
      (
        await postItem(
          deactivate,
          `/leave-types/${sick.id}/deactivate`,
          sick.id,
          owner.cookie,
          { expectedUpdatedAt: sick.updatedAt },
        )
      ).status,
    ).toBe(StatusCodes.OK);
  });

  it("needs hrms.leave_structures and keeps each Company's types to itself", async () => {
    const owner = await ownerWithCompany();
    const nobody = await memberWith(owner, { "hrms.leaves": ["read"] });
    expect((await get(listTypes, "/leave-types", nobody.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const reader = await memberWith(owner, {
      "hrms.leave_structures": ["read"],
    });
    expect((await get(listTypes, "/leave-types", reader.cookie)).status).toBe(
      StatusCodes.OK,
    );
    expect(
      (await get(accrualOptions, "/leave-types/accrual-options", reader.cookie))
        .status,
    ).toBe(StatusCodes.OK);
    const denied = await post(createType, "/leave-types", reader.cookie, WFH);
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });

    const other = await ownerWithCompany("Other Builders");
    const theirs = (await list(other.cookie))[0];
    if (theirs == null) throw new Error("no types");
    expect(
      (
        await getItem(
          getType,
          `/leave-types/${theirs.id}`,
          theirs.id,
          owner.cookie,
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await postItem(
          updateType,
          `/leave-types/${theirs.id}/update`,
          theirs.id,
          owner.cookie,
          { ...WFH, expectedUpdatedAt: theirs.updatedAt },
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const [path, method] of [
      ["/api/construction/hrms/leave-types", "get"],
      ["/api/construction/hrms/leave-types/{id}/update", "post"],
      ["/api/construction/hrms/leave-structures/assignments", "post"],
      ["/api/construction/hrms/leave-balances/accrue", "post"],
      ["/api/construction/hrms/leave-balances/accrue/scheduled", "get"],
      ["/api/construction/hrms/leaves", "post"],
      ["/api/construction/hrms/leaves/{id}/approve", "post"],
      ["/api/construction/hrms/leaves/report/team", "get"],
    ] as const)
      expect(spec.paths[path]?.[method], `${method} ${path}`).toBeDefined();
    expect(
      spec.components.schemas["CreateConstructionHrmsLeaveTypeRequest"],
    ).toBeDefined();
    expect(
      spec.components.schemas["ConstructionHrmsLeaveRequestResponse"],
    ).toBeDefined();
  });
});
