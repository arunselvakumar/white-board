import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { calendarDateToDb } from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
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
  ConstructionFinanceOtherPartyResponseModel,
  ListConstructionFinanceOtherPartiesResponseModel,
} from "./other-party-models";
import { GET as listRoute, POST as createRoute } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/finance/other-parties`;

type Party = ConstructionFinanceOtherPartyResponseModel;
type Page = ListConstructionFinanceOtherPartiesResponseModel;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (cookie: string, body: Record<string, unknown>) =>
  createRoute(jsonRequest(BASE, cookie, body));
const list = (cookie: string, query = "") =>
  listRoute(jsonRequest(`${BASE}${query}`, cookie));
const update = (cookie: string, id: string, body: Record<string, unknown>) =>
  updateRoute(jsonRequest(`${BASE}/${id}/update`, cookie, body), params(id));
const remove = (cookie: string, id: string, body: unknown = {}) =>
  deleteRoute(jsonRequest(`${BASE}/${id}/delete`, cookie, body), params(id));

describe("Other Parties HTTP (CM-704)", () => {
  it("adds an Other Party with tidy fields, the GST state from the GSTIN and its Projects", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(
      company.workspaceId,
      company.userId,
      "Tower A",
    );
    const created = await create(company.cookie, {
      name: "  Sri Lakshmi   Traders ",
      mobile: "77081 65767",
      email: "Accounts@Lakshmi.in",
      gstin: "33aapfa0939f1zm",
      pan: "AAPFA0939F",
      address: "12, Anna Salai, Chennai",
      projectIds: [tower],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const party = await json<Party>(created);
    expect(party).toMatchObject({
      name: "Sri Lakshmi Traders",
      mobile: "+917708165767",
      email: "accounts@lakshmi.in",
      gstin: "33AAPFA0939F1ZM",
      stateCode: "33",
      stateName: "Tamil Nadu",
      projects: [{ id: tower, name: "Tower A" }],
    });
    const fetched = await getRoute(
      jsonRequest(`${BASE}/${party.id}`, company.cookie),
      params(party.id),
    );
    expect(await json<Party>(fetched)).toEqual(party);

    for (const [body, code] of [
      [{ name: " " }, "OTHER_PARTY_NAME_REQUIRED"],
      [{ name: "A", gstin: "33AAPFA0939F1ZW" }, "GSTIN_INVALID"],
      [{ name: "A", pan: "ABC" }, "PAN_INVALID"],
      [{ name: "A", stateCode: "99" }, "GST_STATE_INVALID"],
      [
        { name: "A", gstin: "33AAPFA0939F1ZM", stateCode: "29" },
        "GSTIN_STATE_MISMATCH",
      ],
      [{ name: "A", mobile: "123" }, "MOBILE_INVALID"],
      [{ name: "A", projectIds: [newId()] }, "PROJECT_NOT_FOUND"],
    ] as const) {
      const refused = await create(company.cookie, body);
      expect(refused.status, code).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe(code);
    }
  });

  it("keeps names unique among live Other Parties ignoring case, and edits with expectedUpdatedAt", async () => {
    const company = await ownerWithCompany();
    const [tower, villa] = await Promise.all([
      addProject(company.workspaceId, company.userId, "Tower A"),
      addProject(company.workspaceId, company.userId, "Villa"),
    ]);
    const first = await json<Party>(
      await create(company.cookie, { name: "Ravi Consultants" }),
    );
    const second = await json<Party>(
      await create(company.cookie, { name: "Scrap Buyer" }),
    );
    const taken = await create(company.cookie, { name: "RAVI consultants" });
    expect(taken.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(taken)).toBe("OTHER_PARTY_NAME_TAKEN");

    const renameTaken = await update(company.cookie, second.id, {
      name: "ravi consultants",
      expectedUpdatedAt: second.updatedAt,
    });
    expect(renameTaken.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(renameTaken)).toBe("OTHER_PARTY_NAME_TAKEN");

    const saved = await update(company.cookie, first.id, {
      name: "Ravi Consultants LLP",
      stateCode: "33",
      projectIds: [tower, villa],
      expectedUpdatedAt: first.updatedAt,
    });
    expect(saved.status).toBe(StatusCodes.OK);
    const edited = await json<Party>(saved);
    expect(edited).toMatchObject({
      name: "Ravi Consultants LLP",
      stateCode: "33",
      projects: [
        { id: tower, name: "Tower A" },
        { id: villa, name: "Villa" },
      ],
    });
    const stale = await update(company.cookie, first.id, {
      name: "Ravi",
      expectedUpdatedAt: first.updatedAt,
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("OTHER_PARTY_CHANGED");
    const dropped = await json<Party>(
      await update(company.cookie, first.id, {
        name: "Ravi Consultants LLP",
        projectIds: [villa],
        expectedUpdatedAt: edited.updatedAt,
      }),
    );
    expect(dropped.projects).toEqual([{ id: villa, name: "Villa" }]);

    // A deleted one frees its name.
    expect((await remove(company.cookie, second.id)).status).toBe(
      StatusCodes.NO_CONTENT,
    );
    expect((await create(company.cookie, { name: "scrap buyer" })).status).toBe(
      StatusCodes.CREATED,
    );
  });

  it("lists newest first with search, a Project filter, cursors and a total", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    await create(company.cookie, {
      name: "Landlord Murugan",
      mobile: "9840012345",
      projectIds: [tower],
    });
    await create(company.cookie, {
      name: "Sri Lakshmi Traders",
      gstin: "33AAPFA0939F1ZM",
    });
    await create(company.cookie, { name: "Scrap Buyer" });

    const all = await json<Page>(await list(company.cookie));
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.name)).toEqual([
      "Scrap Buyer",
      "Sri Lakshmi Traders",
      "Landlord Murugan",
    ]);
    const byGstin = await json<Page>(await list(company.cookie, "?q=aapfa"));
    expect(byGstin.items.map((item) => item.name)).toEqual([
      "Sri Lakshmi Traders",
    ]);
    const byMobile = await json<Page>(await list(company.cookie, "?q=98400"));
    expect(byMobile.items.map((item) => item.name)).toEqual([
      "Landlord Murugan",
    ]);
    const onTower = await json<Page>(
      await list(company.cookie, `?projectId=${tower}`),
    );
    expect(onTower.total).toBe(1);

    const page1 = await json<Page>(await list(company.cookie, "?limit=2"));
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await json<Page>(
      await list(company.cookie, `?limit=2&after=${page1.nextCursor ?? ""}`),
    );
    expect(page2.items.map((item) => item.name)).toEqual(["Landlord Murugan"]);
    expect(page2.prevCursor).not.toBeNull();
  });

  it("refuses to delete an Other Party that an invoice, payment, opening or party entry names", async () => {
    const company = await ownerWithCompany();
    const tower = await addProject(company.workspaceId, company.userId);
    const party = await json<Party>(
      await create(company.cookie, { name: "Landlord Murugan" }),
    );
    const openingId = newId();
    await prisma.constructionFinancePartyOpening.create({
      data: {
        id: openingId,
        workspaceId: company.workspaceId,
        partyType: "other_party",
        partyId: party.id,
        projectId: tower,
        asOfDate: calendarDateToDb("2026-04-01"),
        amount: 50_000n,
        createdBy: company.userId,
        updatedBy: company.userId,
      },
    });
    const refused = await remove(company.cookie, party.id);
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("OTHER_PARTY_IN_USE");

    // A deleted opening no longer blocks.
    await prisma.constructionFinancePartyOpening.update({
      where: { id: openingId },
      data: { deletedAt: new Date(), deletedBy: company.userId },
    });
    const stale = await remove(company.cookie, party.id, {
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("OTHER_PARTY_CHANGED");
    expect(
      (
        await remove(company.cookie, party.id, {
          expectedUpdatedAt: party.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);
    const gone = await getRoute(
      jsonRequest(`${BASE}/${party.id}`, company.cookie),
      params(party.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect((await remove(company.cookie, party.id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("needs the Other Party menu's flags and hides another Company's", async () => {
    const company = await ownerWithCompany();
    const party = await json<Party>(
      await create(company.cookie, { name: "Landlord Murugan" }),
    );
    const reader = await memberWith(company, {
      "masters.other_parties": ["read"],
    });
    expect((await list(reader.cookie)).status).toBe(StatusCodes.OK);
    expect((await create(reader.cookie, { name: "X" })).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect(
      (
        await update(reader.cookie, party.id, {
          name: "Y",
          expectedUpdatedAt: party.updatedAt,
        })
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await remove(reader.cookie, party.id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    const stranger = await memberWith(company, {});
    expect((await list(stranger.cookie)).status).toBe(StatusCodes.FORBIDDEN);

    const other = await ownerWithCompany("Other Builders");
    const peek = await getRoute(
      jsonRequest(`${BASE}/${party.id}`, other.cookie),
      params(party.id),
    );
    expect(peek.status).toBe(StatusCodes.NOT_FOUND);
    expect((await json<Page>(await list(other.cookie))).total).toBe(0);
    // The same name is free in another Company.
    expect(
      (await create(other.cookie, { name: "Landlord Murugan" })).status,
    ).toBe(StatusCodes.CREATED);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const path of [
      "/api/construction/finance/other-parties",
      "/api/construction/finance/other-parties/{id}",
      "/api/construction/finance/other-parties/{id}/update",
      "/api/construction/finance/other-parties/{id}/delete",
    ])
      expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["ConstructionFinanceOtherPartyResponse"],
    ).toBeDefined();
  });
});
