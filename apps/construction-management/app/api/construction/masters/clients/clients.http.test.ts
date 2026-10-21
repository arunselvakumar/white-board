import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteRoute } from "./[id]/delete/route";
import { GET as getRoute } from "./[id]/route";
import { POST as updateRoute } from "./[id]/update/route";
import type {
  ConstructionMastersClientResponseModel,
  ListConstructionMastersClientOptionsResponseModel,
  ListConstructionMastersClientsResponseModel,
} from "./client-models";
import { GET as optionsRoute } from "./options/route";
import { GET as listRoute, POST as createRoute } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/masters/clients`;

type Client = ConstructionMastersClientResponseModel;
type Page = ListConstructionMastersClientsResponseModel;
type Options = ListConstructionMastersClientOptionsResponseModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(
  response: Response,
): Promise<{ code: string; details?: unknown }> {
  return json<{ code: string; details?: unknown }>(response);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (cookie: string, body: Record<string, unknown>) =>
  createRoute(jsonRequest(BASE, cookie, body));
const list = (cookie: string, query = "") =>
  listRoute(jsonRequest(`${BASE}${query}`, cookie));
const get = (cookie: string, id: string) =>
  getRoute(jsonRequest(`${BASE}/${id}`, cookie), params(id));
const update = (cookie: string, id: string, body: Record<string, unknown>) =>
  updateRoute(jsonRequest(`${BASE}/${id}/update`, cookie, body), params(id));
const remove = (cookie: string, id: string, body: unknown = {}) =>
  deleteRoute(jsonRequest(`${BASE}/${id}/delete`, cookie, body), params(id));
const options = (cookie: string, query = "") =>
  optionsRoute(jsonRequest(`${BASE}/options${query}`, cookie));

describe("Clients HTTP (CM-1101)", () => {
  it("adds a Client with tidy fields and the GST state from the GSTIN", async () => {
    const company = await ownerWithCompany();
    const created = await create(company.cookie, {
      name: "  Sri Balaji   Developers ",
      contactPerson: "Ravi Kumar",
      mobile: "77081 65767",
      email: "Accounts@Balaji.in",
      address: "12, Anna Salai, Chennai",
      pinCode: "600002",
      gstin: "33aapfa0939f1zm",
      pan: "AAPFA0939F",
      tan: "chea12345b",
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const client = await json<Client>(created);
    expect(client).toMatchObject({
      name: "Sri Balaji Developers",
      contactPerson: "Ravi Kumar",
      mobile: "+917708165767",
      email: "accounts@balaji.in",
      pinCode: "600002",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      tan: "CHEA12345B",
      stateCode: "33",
      stateName: "Tamil Nadu",
      isActive: true,
    });
    expect(await json<Client>(await get(company.cookie, client.id))).toEqual(
      client,
    );
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: client.id, action: "client.created" },
    });
    expect(audit).not.toBeNull();

    // Without a GSTIN the picked state stays.
    const picked = await json<Client>(
      await create(company.cookie, {
        name: "Karnataka Infra",
        stateCode: "29",
      }),
    );
    expect(picked).toMatchObject({ stateCode: "29", stateName: "Karnataka" });

    for (const [body, code] of [
      [{ name: " " }, "CLIENT_NAME_REQUIRED"],
      [{ name: "A", gstin: "33AAPFA0939F1ZW" }, "GSTIN_INVALID"],
      [{ name: "A", pan: "ABC" }, "PAN_INVALID"],
      [
        { name: "A", gstin: "33AAPFA0939F1ZM", pan: "AAACB1234C" },
        "GSTIN_PAN_MISMATCH",
      ],
      [{ name: "A", tan: "CHEA1234BB" }, "TAN_INVALID"],
      [{ name: "A", pinCode: "6000" }, "PIN_CODE_INVALID"],
      [{ name: "A", stateCode: "99" }, "GST_STATE_INVALID"],
      [
        { name: "A", gstin: "33AAPFA0939F1ZM", stateCode: "29" },
        "GSTIN_STATE_MISMATCH",
      ],
      [{ name: "A", mobile: "123" }, "MOBILE_INVALID"],
    ] as const) {
      const refused = await create(company.cookie, body);
      expect(refused.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect((await errorOf(refused)).code).toBe(code);
    }
  });

  it("keeps names unique among live Clients ignoring case, and edits with expectedUpdatedAt", async () => {
    const company = await ownerWithCompany();
    const first = await json<Client>(
      await create(company.cookie, { name: "Sri Balaji Developers" }),
    );
    const second = await json<Client>(
      await create(company.cookie, { name: "Highways Department" }),
    );
    const taken = await create(company.cookie, {
      name: "SRI BALAJI developers",
    });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(taken)).toMatchObject({
      code: "CLIENT_NAME_TAKEN",
      details: { field: "name" },
    });
    const renameTaken = await update(company.cookie, second.id, {
      name: "sri balaji developers",
      expectedUpdatedAt: second.updatedAt,
    });
    expect(renameTaken.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(renameTaken)).code).toBe("CLIENT_NAME_TAKEN");

    const saved = await update(company.cookie, first.id, {
      name: "Sri Balaji Developers LLP",
      gstin: "33AAPFA0939F1ZM",
      isActive: false,
      expectedUpdatedAt: first.updatedAt,
    });
    expect(saved.status).toBe(StatusCodes.OK);
    const edited = await json<Client>(saved);
    expect(edited).toMatchObject({
      name: "Sri Balaji Developers LLP",
      stateCode: "33",
      isActive: false,
    });
    const stale = await update(company.cookie, first.id, {
      name: "Balaji",
      expectedUpdatedAt: first.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("CLIENT_CHANGED");
    // `isActive` left out keeps it.
    const kept = await json<Client>(
      await update(company.cookie, first.id, {
        name: "Sri Balaji Developers LLP",
        expectedUpdatedAt: edited.updatedAt,
      }),
    );
    expect(kept.isActive).toBe(false);
    expect(kept.gstin).toBeNull();

    // A deleted one frees its name.
    expect((await remove(company.cookie, second.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect(
      (await create(company.cookie, { name: "highways department" })).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("lists newest first with search, an active filter, cursors and a total", async () => {
    const company = await ownerWithCompany();
    await create(company.cookie, {
      name: "Highways Department",
      mobile: "9840012345",
    });
    await create(company.cookie, {
      name: "Sri Balaji Developers",
      gstin: "33AAPFA0939F1ZM",
    });
    await create(company.cookie, { name: "Old Client", isActive: false });

    const all = await json<Page>(await list(company.cookie));
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.name)).toEqual([
      "Old Client",
      "Sri Balaji Developers",
      "Highways Department",
    ]);
    const byGstin = await json<Page>(await list(company.cookie, "?q=aapfa"));
    expect(byGstin.items.map((item) => item.name)).toEqual([
      "Sri Balaji Developers",
    ]);
    const byMobile = await json<Page>(await list(company.cookie, "?q=98400"));
    expect(byMobile.items.map((item) => item.name)).toEqual([
      "Highways Department",
    ]);
    const active = await json<Page>(await list(company.cookie, "?active=true"));
    expect(active.total).toBe(2);

    const page1 = await json<Page>(await list(company.cookie, "?limit=2"));
    expect(page1.items).toHaveLength(2);
    const page2 = await json<Page>(
      await list(company.cookie, `?limit=2&after=${page1.nextCursor ?? ""}`),
    );
    expect(page2.items.map((item) => item.name)).toEqual([
      "Highways Department",
    ]);
    expect(page2.prevCursor).not.toBeNull();

    // The picker offers active Clients by name, and an inactive one by id.
    const picker = await json<Options>(await options(company.cookie));
    expect(picker.items.map((item) => item.name)).toEqual([
      "Highways Department",
      "Sri Balaji Developers",
    ]);
    const old = all.items[0];
    if (old == null) throw new Error("missing");
    const byId = await json<Options>(
      await options(company.cookie, `?ids=${old.id}`),
    );
    expect(byId.items).toEqual([
      {
        id: old.id,
        name: "Old Client",
        gstin: null,
        stateCode: null,
        isActive: false,
      },
    ]);
    const searched = await json<Options>(
      await options(company.cookie, "?search=bala"),
    );
    expect(searched.items.map((item) => item.name)).toEqual([
      "Sri Balaji Developers",
    ]);
  });

  it("refuses to delete a Client a live Project links, with the Project count", async () => {
    const company = await ownerWithCompany();
    const client = await json<Client>(
      await create(company.cookie, { name: "Sri Balaji Developers" }),
    );
    const [tower, villa] = await Promise.all([
      addProject(company.workspaceId, company.userId, "Tower A"),
      addProject(company.workspaceId, company.userId, "Villa"),
    ]);
    await prisma.constructionProjectsProject.updateMany({
      where: { id: { in: [tower, villa] } },
      data: { clientId: client.id, role: "contract" },
    });
    const refused = await remove(company.cookie, client.id);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await errorOf(refused)).toMatchObject({
      code: "CLIENT_IN_USE",
      details: { projectCount: 2 },
    });

    // A deleted Project no longer holds it; a live one still does.
    await prisma.constructionProjectsProject.update({
      where: { id: villa },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    expect(
      await errorOf(await remove(company.cookie, client.id)),
    ).toMatchObject({ code: "CLIENT_IN_USE", details: { projectCount: 1 } });
    await prisma.constructionProjectsProject.update({
      where: { id: tower },
      data: { clientId: null },
    });
    const stale = await remove(company.cookie, client.id, {
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect((await errorOf(stale)).code).toBe("CLIENT_CHANGED");
    expect(
      (
        await remove(company.cookie, client.id, {
          expectedUpdatedAt: client.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    expect((await get(company.cookie, client.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await remove(company.cookie, client.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("needs the Clients menu's flags and hides another Company's", async () => {
    const company = await ownerWithCompany();
    const client = await json<Client>(
      await create(company.cookie, { name: "Sri Balaji Developers" }),
    );
    const reader = await memberWith(company, { "masters.clients": ["read"] });
    expect((await list(reader.cookie)).status).toBe(StatusCodes.OK);
    expect((await get(reader.cookie, client.id)).status).toBe(StatusCodes.OK);
    expect((await create(reader.cookie, { name: "X" })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await update(reader.cookie, client.id, {
          name: "Y",
          expectedUpdatedAt: client.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await remove(reader.cookie, client.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const stranger = await memberWith(company, {});
    expect((await list(stranger.cookie)).status).toBe(StatusCodes.FORBIDDEN);
    expect((await options(stranger.cookie)).status).toBe(StatusCodes.FORBIDDEN);
    // Whoever adds or edits Projects may pick a Client.
    const projectEditor = await memberWith(company, {
      "projects.project": ["read", "update"],
    });
    expect((await list(projectEditor.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (await json<Options>(await options(projectEditor.cookie))).items,
    ).toHaveLength(1);

    const other = await ownerWithCompany("Other Builders");
    expect((await get(other.cookie, client.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (
        await update(other.cookie, client.id, {
          name: "Mine",
          expectedUpdatedAt: client.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    expect((await remove(other.cookie, client.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await json<Page>(await list(other.cookie))).total).toBe(0);
    expect(
      (await json<Options>(await options(other.cookie, `?ids=${client.id}`)))
        .items,
    ).toEqual([]);
    // The same name is free in another Company.
    expect(
      (await create(other.cookie, { name: "Sri Balaji Developers" })).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/masters/clients",
      "/api/construction/masters/clients/options",
      "/api/construction/masters/clients/{id}",
      "/api/construction/masters/clients/{id}/update",
      "/api/construction/masters/clients/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionMastersClientResponse"],
    ).toBeDefined();
  });
});
