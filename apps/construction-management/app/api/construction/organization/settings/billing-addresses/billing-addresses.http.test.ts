import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { gstinCheckCharacter } from "@/src/shared-kernel/tax-ids";
import { actAs, addMember, newCompany } from "@/test/companies";

import { POST as deleteAddress } from "./[id]/delete/route";
import { POST as makeDefault } from "./[id]/make-default/route";
import { GET as getAddress } from "./[id]/route";
import { POST as updateAddress } from "./[id]/update/route";
import { GET as listAddresses, POST as createAddress } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE =
  "http://localhost/api/construction/organization/settings/billing-addresses";

type AddressBody = {
  id: string;
  name: string;
  address: string;
  stateCode: string;
  stateName: string;
  gstin: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type ListBody = { items: AddressBody[]; total: number };

const post = (url: string, body?: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function gstinOf(state: string): string {
  const first14 = `${state}AAPFA0939F1Z`;
  return `${first14}${gstinCheckCharacter(first14)}`;
}

const HEAD_OFFICE = {
  name: "Head office",
  address: "12, Anna Salai\nChennai 600002",
  stateCode: "33",
  gstin: "33aapfa0939f1zm",
};

async function owner() {
  const company = await newCompany();
  actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
  return company;
}

async function create(body: Record<string, unknown>): Promise<Response> {
  return createAddress(post(BASE, { ...HEAD_OFFICE, ...body }));
}

async function list(): Promise<ListBody> {
  return json<ListBody>(await listAddresses(new Request(BASE)));
}

describe("Billing addresses HTTP (CM-501)", () => {
  it("is 401 without a Session, 403 without an Active Company or Settings", async () => {
    actAs({ userId: null, workspaceId: null });
    expect((await listAddresses(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    actAs({ userId: "user-1", workspaceId: null });
    const noCompany = await listAddresses(new Request(BASE));
    expect(noCompany.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(noCompany)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });

    const { workspaceId, ownerId } = await newCompany();
    const { userId } = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read"],
    });
    actAs({ userId, workspaceId, role: "member" });
    expect((await listAddresses(new Request(BASE))).status).toBe(
      StatusCodes.OK,
    );
    const denied = await create({});
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });

    const { userId: outsider } = await addMember(workspaceId, ownerId, {
      "organization.team_members": ["read"],
    });
    actAs({ userId: outsider, workspaceId, role: "member" });
    const unread = await listAddresses(new Request(BASE));
    expect(unread.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(unread)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("creates, lists default first and makes the first address the default", async () => {
    const company = await owner();
    expect(await list()).toEqual({ items: [], total: 0 });

    const created = await create({ name: "  Head   office " });
    expect(created.status).toBe(StatusCodes.CREATED);
    const head = await json<AddressBody>(created);
    expect(head).toMatchObject({
      name: "Head office",
      address: "12, Anna Salai\nChennai 600002",
      stateCode: "33",
      stateName: "Tamil Nadu",
      gstin: "33AAPFA0939F1ZM",
      isDefault: true,
    });

    const branch = await json<AddressBody>(
      await create({
        name: "Bengaluru branch",
        stateCode: "29",
        gstin: gstinOf("29"),
      }),
    );
    expect(branch.isDefault).toBe(false);
    const noGstin = await json<AddressBody>(
      await create({ name: "Andheri site", stateCode: "27", gstin: null }),
    );
    expect(noGstin).toMatchObject({ gstin: null, stateName: "Maharashtra" });

    const listed = await list();
    expect(listed.total).toBe(3);
    expect(listed.items.map((item) => item.name)).toEqual([
      "Head office",
      "Andheri site",
      "Bengaluru branch",
    ]);

    const one = await getAddress(
      new Request(`${BASE}/${branch.id}`),
      params(branch.id),
    );
    expect(one.status).toBe(StatusCodes.OK);
    expect(await json(one)).toMatchObject({ id: branch.id, stateCode: "29" });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: head.id },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "billing_address.created",
    ]);
    expect(audit[0]?.after).toMatchObject({
      name: "Head office",
      isDefault: true,
    });
  });

  it("refuses a live name in use, an unknown state and a GSTIN of another state", async () => {
    await owner();
    await create({});
    const taken = await create({ name: "HEAD OFFICE" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await json(taken)).toMatchObject({
      code: "BILLING_ADDRESS_NAME_IN_USE",
    });

    const state = await create({ name: "Daman", stateCode: "25", gstin: null });
    expect(state.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(state)).toMatchObject({ code: "GST_STATE_INVALID" });

    const mismatch = await create({ name: "Pune", stateCode: "27" });
    expect(mismatch.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(mismatch)).toMatchObject({
      code: "GSTIN_STATE_MISMATCH",
    });

    const invalid = await create({ name: "Typo", gstin: "33AAPFA0939F1ZA" });
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(invalid)).toMatchObject({ code: "GSTIN_INVALID" });

    const missing = await createAddress(post(BASE, { name: "No address" }));
    expect(missing.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("edits with optimistic concurrency and audits before and after", async () => {
    const company = await owner();
    const head = await json<AddressBody>(await create({}));
    await create({ name: "Warehouse", gstin: null });

    const updated = await updateAddress(
      post(`${BASE}/${head.id}/update`, {
        ...HEAD_OFFICE,
        name: "Registered office",
        expectedUpdatedAt: head.updatedAt,
      }),
      params(head.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    const after = await json<AddressBody>(updated);
    expect(after).toMatchObject({ name: "Registered office", isDefault: true });

    const stale = await updateAddress(
      post(`${BASE}/${head.id}/update`, {
        ...HEAD_OFFICE,
        expectedUpdatedAt: head.updatedAt,
      }),
      params(head.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "BILLING_ADDRESS_CHANGED",
    });

    const clash = await updateAddress(
      post(`${BASE}/${head.id}/update`, {
        ...HEAD_OFFICE,
        name: "warehouse",
        expectedUpdatedAt: after.updatedAt,
      }),
      params(head.id),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(await json(clash)).toMatchObject({
      code: "BILLING_ADDRESS_NAME_IN_USE",
    });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: head.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((event) => event.action)).toEqual([
      "billing_address.created",
      "billing_address.updated",
    ]);
    expect(audit[1]?.before).toMatchObject({ name: "Head office" });
    expect(audit[1]?.after).toMatchObject({ name: "Registered office" });
  });

  it("switches the default and keeps exactly one", async () => {
    const company = await owner();
    const head = await json<AddressBody>(await create({}));
    const branch = await json<AddressBody>(
      await create({ name: "Branch", gstin: null }),
    );

    const made = await makeDefault(
      post(`${BASE}/${branch.id}/make-default`),
      params(branch.id),
    );
    expect(made.status).toBe(StatusCodes.OK);
    expect(await json(made)).toMatchObject({ id: branch.id, isDefault: true });
    const listed = await list();
    expect(
      listed.items.map((item) => [item.name, item.isDefault] as const),
    ).toEqual([
      ["Branch", true],
      ["Head office", false],
    ]);

    // Already the default: nothing changes.
    const again = await makeDefault(
      post(`${BASE}/${branch.id}/make-default`),
      params(branch.id),
    );
    expect(again.status).toBe(StatusCodes.OK);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: "billing_address.made_default",
      },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(branch.id);
    expect(audit[0]?.before).toMatchObject({ previousDefaultId: head.id });
  });

  it("deletes as a tombstone and promotes the oldest remaining address", async () => {
    const company = await owner();
    const head = await json<AddressBody>(await create({}));
    const second = await json<AddressBody>(
      await create({ name: "Zonal office", gstin: null }),
    );
    const third = await json<AddressBody>(
      await create({ name: "Annex", gstin: null }),
    );

    // Deleting an address that is not the default keeps the default.
    expect(
      (
        await deleteAddress(
          post(`${BASE}/${third.id}/delete`),
          params(third.id),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await list()).items.map((item) => item.name)).toEqual([
      "Head office",
      "Zonal office",
    ]);

    expect(
      (await deleteAddress(post(`${BASE}/${head.id}/delete`), params(head.id)))
        .status,
    ).toBe(StatusCodes.NO_CONTENT);
    const listed = await list();
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).toMatchObject({
      id: second.id,
      isDefault: true,
    });

    const tombstone =
      await prisma.constructionOrganizationBillingAddress.findUniqueOrThrow({
        where: { id: head.id },
      });
    expect(tombstone.deletedAt).not.toBeNull();
    expect(tombstone.deletedBy).toBe(company.ownerId);

    // A deleted name is free again; a deleted id is gone.
    expect((await create({})).status).toBe(StatusCodes.CREATED);
    const gone = await getAddress(
      new Request(`${BASE}/${head.id}`),
      params(head.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({
      code: "BILLING_ADDRESS_NOT_FOUND",
    });
    expect(
      (await deleteAddress(post(`${BASE}/${head.id}/delete`), params(head.id)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: {
          in: ["billing_address.deleted", "billing_address.made_default"],
        },
      },
    });
    // The promotion shares the delete's timestamp, so compare as a set.
    expect(audit).toHaveLength(3);
    expect(audit.map((event) => [event.action, event.entityId])).toEqual(
      expect.arrayContaining([
        ["billing_address.deleted", third.id],
        ["billing_address.deleted", head.id],
        ["billing_address.made_default", second.id],
      ]),
    );
  });

  it("is 404 for another Company's address", async () => {
    await owner();
    const head = await json<AddressBody>(await create({}));
    await owner();
    const read = await getAddress(
      new Request(`${BASE}/${head.id}`),
      params(head.id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    const edit = await updateAddress(
      post(`${BASE}/${head.id}/update`, {
        ...HEAD_OFFICE,
        expectedUpdatedAt: head.updatedAt,
      }),
      params(head.id),
    );
    expect(edit.status).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await makeDefault(
          post(`${BASE}/${head.id}/make-default`),
          params(head.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (await deleteAddress(post(`${BASE}/${head.id}/delete`), params(head.id)))
        .status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect(
      (
        await getAddress(
          new Request(`${BASE}/${randomUUID()}`),
          params("not-a-uuid"),
        )
      ).status,
    ).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs with ConstructionOrganization components", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/organization/settings/billing-addresses";
    expect(spec.paths[base]?.["get"]).toBeDefined();
    expect(spec.paths[base]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}`]?.["get"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/update`]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/make-default`]?.["post"]).toBeDefined();
    expect(spec.paths[`${base}/{id}/delete`]?.["post"]).toBeDefined();
    for (const name of [
      "CreateConstructionOrganizationBillingAddressRequest",
      "UpdateConstructionOrganizationBillingAddressRequest",
      "ConstructionOrganizationBillingAddressResponse",
      "ListConstructionOrganizationBillingAddressesResponse",
    ])
      expect(spec.components.schemas[name]).toBeDefined();
  });
});
