import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { GRN_OPTIONAL_FIELDS } from "@/src/shared-kernel/grn-fields";
import { actAs, addMember, newCompany } from "@/test/companies";

import { GET as getSetting } from "./route";
import { POST as updateSetting } from "./update/route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const BASE =
  "http://localhost/api/construction/organization/settings/grn-fields";

type SettingBody = {
  hiddenFields: string[];
  fields: { key: string; label: string; group: string }[];
  updatedAt: string | null;
};

const post = (url: string, body?: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function owner() {
  const company = await newCompany();
  actAs({ userId: company.ownerId, workspaceId: company.workspaceId });
  return company;
}

const save = (body: unknown) => updateSetting(post(`${BASE}/update`, body));

describe("GRN fields HTTP (CM-501)", () => {
  it("is 401 without a Session, 403 without an Active Company or Settings", async () => {
    actAs({ userId: null, workspaceId: null });
    expect((await getSetting(new Request(BASE))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    actAs({ userId: "user-1", workspaceId: null });
    const noCompany = await getSetting(new Request(BASE));
    expect(noCompany.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(noCompany)).toMatchObject({ code: "NO_ACTIVE_COMPANY" });

    const { workspaceId, ownerId } = await newCompany();
    const { userId } = await addMember(workspaceId, ownerId, {
      "organization.settings": ["read"],
    });
    actAs({ userId, workspaceId, role: "member" });
    expect((await getSetting(new Request(BASE))).status).toBe(StatusCodes.OK);
    const denied = await save({ hiddenFields: [], expectedUpdatedAt: null });
    expect(denied.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(denied)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("shows every field until the Company saves, then keeps its choice", async () => {
    const company = await owner();
    const initial = await json<SettingBody>(
      await getSetting(new Request(BASE)),
    );
    expect(initial.hiddenFields).toEqual([]);
    expect(initial.updatedAt).toBeNull();
    expect(initial.fields.map((field) => field.key)).toEqual([
      ...GRN_OPTIONAL_FIELDS,
    ]);
    expect(initial.fields[0]).toEqual({
      key: "invoiceNo",
      label: "Invoice No",
      group: "supplier_details",
    });
    expect(initial.fields.find((field) => field.key === "ewayBillNo")).toEqual({
      key: "ewayBillNo",
      label: "E-way bill No",
      group: "delivery_details",
    });

    const saved = await save({
      hiddenFields: ["remark", "vehicleNo", "remark"],
      expectedUpdatedAt: null,
    });
    expect(saved.status).toBe(StatusCodes.OK);
    const first = await json<SettingBody>(saved);
    expect(first.hiddenFields).toEqual(["vehicleNo", "remark"]);
    expect(first.updatedAt).not.toBeNull();

    // A second "first save" lost the race.
    const stale = await save({ hiddenFields: [], expectedUpdatedAt: null });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json(stale)).toMatchObject({
      code: "GRN_FIELD_SETTING_CHANGED",
    });

    const next = await json<SettingBody>(
      await save({
        hiddenFields: ["driverMobile"],
        expectedUpdatedAt: first.updatedAt,
      }),
    );
    expect(next.hiddenFields).toEqual(["driverMobile"]);
    const reread = await json<SettingBody>(await getSetting(new Request(BASE)));
    expect(reread).toMatchObject({
      hiddenFields: ["driverMobile"],
      updatedAt: next.updatedAt,
    });

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, action: "grn_fields.updated" },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[0]?.before).toEqual({ hiddenFields: [] });
    expect(audit[0]?.after).toEqual({ hiddenFields: ["vehicleNo", "remark"] });
    expect(audit[1]?.before).toEqual({ hiddenFields: ["vehicleNo", "remark"] });
  });

  it("refuses unknown fields", async () => {
    await owner();
    const unknown = await save({
      hiddenFields: ["invoiceNo", "colour"],
      expectedUpdatedAt: null,
    });
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/organization/settings/grn-fields";
    expect(spec.paths[base]?.["get"]).toBeDefined();
    expect(spec.paths[`${base}/update`]?.["post"]).toBeDefined();
    expect(
      spec.components.schemas[
        "UpdateConstructionOrganizationGrnFieldSettingRequest"
      ],
    ).toBeDefined();
    expect(
      spec.components.schemas[
        "GetConstructionOrganizationGrnFieldSettingResponse"
      ],
    ).toBeDefined();
  });
});
