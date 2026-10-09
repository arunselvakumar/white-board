import { seedCompanyMember } from "@repo/auth/construction/testing";
import { prisma } from "@repo/db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as switchCompany } from "@/app/api/construction/organization/companies/[id]/switch/route";
import { POST as createCompany } from "@/app/api/construction/organization/companies/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import { signInByEmail, TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteDesignation } from "./[id]/delete/route";
import { POST as duplicateDesignation } from "./[id]/duplicate/route";
import { GET as getDesignation } from "./[id]/route";
import { POST as updateDesignation } from "./[id]/update/route";
import { GET as listDesignations, POST as createDesignation } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/designations`;

type Designation = {
  id: string;
  name: string;
  isSeed: boolean;
  template: Record<string, Flag[]> | null;
  createdAt: string;
  updatedAt: string;
};

function post(url: string, cookie: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function get(url: string, cookie: string) {
  return new Request(url, { headers: { cookie } });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A signed-in Owner of a new Company, made active through the real route. */
async function owner(): Promise<{
  cookie: string;
  userId: string;
  workspaceId: string;
}> {
  const { cookie, userId } = await signInByEmail();
  const response = await createCompany(
    post(`${TEST_ORIGIN}/api/construction/organization/companies`, cookie, {
      name: "Anugraha Engineers",
      country: "IN",
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  const { id } = await json<{ id: string }>(response);
  return { cookie, userId, workspaceId: id };
}

async function list(cookie: string): Promise<Designation[]> {
  const response = await listDesignations(get(BASE, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  const body = await json<{ items: Designation[]; total: number }>(response);
  expect(body.total).toBe(body.items.length);
  return body.items;
}

/**
 * An active Team Member (role `member`) of the Owner's Company holding
 * `grants`, signed in with that Company active.
 */
async function member(
  company: { workspaceId: string; userId: string },
  grants: Record<string, Flag[]>,
): Promise<string> {
  const { cookie, userId, email } = await signInByEmail();
  await seedCompanyMember({
    workspaceId: company.workspaceId,
    userId,
    role: "member",
  });
  const designations =
    await prisma.constructionOrganizationDesignation.findMany({
      where: { workspaceId: company.workspaceId, name: "Site Engineer" },
    });
  const invited = await createTeamMemberHandlers().invite({
    workspaceId: company.workspaceId,
    by: company.userId,
    memberType: "normal",
    details: {
      name: "Prabhu Saravanan",
      designationId: designations[0]?.id ?? "",
      email,
    },
    permissions: grants,
  });
  await prisma.constructionOrganizationTeamMember.update({
    where: { id: invited.id },
    data: { status: "active", userId },
  });
  const switched = await switchCompany(
    post(
      `${TEST_ORIGIN}/api/construction/organization/companies/${company.workspaceId}/switch`,
      cookie,
    ),
    params(company.workspaceId),
  );
  expect(switched.status).toBe(StatusCodes.OK);
  return cookie;
}

describe("Designations HTTP (CM-112)", () => {
  it("is 401 without a Session", async () => {
    const response = await listDesignations(new Request(BASE));
    expect(response.status).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("lists the Company's seeds by name with their templates", async () => {
    const { cookie } = await owner();
    const items = await list(cookie);
    expect(items).toHaveLength(38);
    const names = items.map((item) => item.name);
    // Postgres orders by its collation (here byte order: "HVAC" before "Heavy").
    expect(names).toEqual([...names].sort());
    const engineer = items.find((item) => item.name === "Site Engineer");
    expect(engineer).toMatchObject({ isSeed: true });
    expect(engineer?.template?.["labour.attendance"]).toEqual([
      "create",
      "read",
      "update",
    ]);
  });

  it("creates, reads, updates, duplicates and deletes", async () => {
    const { cookie } = await owner();
    const created = await createDesignation(
      post(BASE, cookie, {
        name: "  Billing   Engineer ",
        template: {
          "projects.project": ["read", "approve"],
          "finance.petty_cash": [],
        },
      }),
    );
    expect(created.status).toBe(StatusCodes.CREATED);
    const designation = await json<Designation>(created);
    // Unsupported cells ("approve" on Project) and empty rows are dropped.
    expect(designation).toMatchObject({
      name: "Billing Engineer",
      isSeed: false,
      template: { "projects.project": ["read"] },
    });

    const read = await getDesignation(
      get(`${BASE}/${designation.id}`, cookie),
      params(designation.id),
    );
    expect(read.status).toBe(StatusCodes.OK);
    expect(await json(read)).toEqual(designation);

    const updated = await updateDesignation(
      post(`${BASE}/${designation.id}/update`, cookie, {
        name: "Billing Engineer II",
        template: { "projects.project": ["create", "read"] },
      }),
      params(designation.id),
    );
    expect(updated.status).toBe(StatusCodes.OK);
    expect(await json(updated)).toMatchObject({
      name: "Billing Engineer II",
      template: { "projects.project": ["create", "read"] },
    });

    const copied = await duplicateDesignation(
      post(`${BASE}/${designation.id}/duplicate`, cookie),
      params(designation.id),
    );
    expect(copied.status).toBe(StatusCodes.CREATED);
    const copy = await json<Designation>(copied);
    expect(copy).toMatchObject({
      name: "Billing Engineer II (copy)",
      template: { "projects.project": ["create", "read"] },
    });
    const named = await duplicateDesignation(
      post(`${BASE}/${designation.id}/duplicate`, cookie, {
        name: "Junior Billing Engineer",
      }),
      params(designation.id),
    );
    expect(await json(named)).toMatchObject({
      name: "Junior Billing Engineer",
    });

    const cleared = await updateDesignation(
      post(`${BASE}/${copy.id}/update`, cookie, {
        name: copy.name,
        template: {},
      }),
      params(copy.id),
    );
    expect(await json(cleared)).toMatchObject({ template: null });

    const deleted = await deleteDesignation(
      post(`${BASE}/${copy.id}/delete`, cookie),
      params(copy.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getDesignation(
      get(`${BASE}/${copy.id}`, cookie),
      params(copy.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "DESIGNATION_NOT_FOUND" });
    expect((await list(cookie)).map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "Billing Engineer II",
        "Junior Billing Engineer",
      ]),
    );
  });

  it("rejects unknown menus and flags, and blank names", async () => {
    const { cookie } = await owner();
    for (const template of [
      { "projects.nope": ["read"] },
      { "projects.project": ["fly"] },
    ]) {
      const response = await createDesignation(
        post(BASE, cookie, { name: "Surveyor", template }),
      );
      expect(response.status).toBe(StatusCodes.BAD_REQUEST);
      expect(await json(response)).toMatchObject({ code: "VALIDATION_ERROR" });
    }
    const blank = await createDesignation(post(BASE, cookie, { name: "  " }));
    expect(blank.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(blank)).toMatchObject({
      code: "DESIGNATION_NAME_REQUIRED",
    });
    const badId = await getDesignation(
      get(`${BASE}/not-a-uuid`, cookie),
      params("not-a-uuid"),
    );
    expect(badId.status).toBe(StatusCodes.BAD_REQUEST);
  });

  it("is 409 for a name in use, on create, update and duplicate", async () => {
    const { cookie } = await owner();
    const items = await list(cookie);
    const admin = items.find((item) => item.name === "Admin");
    const accountant = items.find((item) => item.name === "Accountant");
    const created = await createDesignation(
      post(BASE, cookie, { name: "ADMIN" }),
    );
    expect(created.status).toBe(StatusCodes.CONFLICT);
    expect(await json(created)).toMatchObject({
      code: "DESIGNATION_NAME_IN_USE",
    });
    const renamed = await updateDesignation(
      post(`${BASE}/${accountant?.id ?? ""}/update`, cookie, {
        name: "Admin",
        template: null,
      }),
      params(accountant?.id ?? ""),
    );
    expect(renamed.status).toBe(StatusCodes.CONFLICT);
    const copied = await duplicateDesignation(
      post(`${BASE}/${admin?.id ?? ""}/duplicate`, cookie, {
        name: "Accountant",
      }),
      params(admin?.id ?? ""),
    );
    expect(copied.status).toBe(StatusCodes.CONFLICT);
  });

  it("will not delete a Designation a Team Member holds", async () => {
    const { cookie } = await owner();
    // The Owner's own Team Member record holds "Owner".
    const ownerDesignation = (await list(cookie)).find(
      (item) => item.name === "Owner",
    );
    const response = await deleteDesignation(
      post(`${BASE}/${ownerDesignation?.id ?? ""}/delete`, cookie),
      params(ownerDesignation?.id ?? ""),
    );
    expect(response.status).toBe(StatusCodes.CONFLICT);
    expect(await json(response)).toMatchObject({ code: "DESIGNATION_IN_USE" });
  });

  it("does not show or change another Company's Designation", async () => {
    const mine = await owner();
    const theirs = await owner();
    const [their] = await list(theirs.cookie);
    const id = their?.id ?? "";
    const read = await getDesignation(
      get(`${BASE}/${id}`, mine.cookie),
      params(id),
    );
    expect(read.status).toBe(StatusCodes.NOT_FOUND);
    const updated = await updateDesignation(
      post(`${BASE}/${id}/update`, mine.cookie, { name: "X", template: null }),
      params(id),
    );
    expect(updated.status).toBe(StatusCodes.NOT_FOUND);
    const deleted = await deleteDesignation(
      post(`${BASE}/${id}/delete`, mine.cookie),
      params(id),
    );
    expect(deleted.status).toBe(StatusCodes.NOT_FOUND);
    expect((await list(mine.cookie)).some((item) => item.id === id)).toBe(
      false,
    );
  });

  it("checks the Permission Matrix for a Team Member", async () => {
    const company = await owner();
    const reader = await member(company, {
      "organization.designations": ["read"],
    });
    expect(await list(reader)).toHaveLength(38);
    const refused = await createDesignation(
      post(BASE, reader, { name: "Surveyor" }),
    );
    expect(refused.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(refused)).toMatchObject({ code: "PERMISSION_DENIED" });

    const outsider = await member(company, {
      "projects.project": ["read"],
    });
    const listed = await listDesignations(get(BASE, outsider));
    expect(listed.status).toBe(StatusCodes.FORBIDDEN);
    expect(await json(listed)).toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("is on /api/docs", async () => {
    const spec = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        "/api/construction/organization/designations",
        "/api/construction/organization/designations/{id}",
        "/api/construction/organization/designations/{id}/update",
        "/api/construction/organization/designations/{id}/duplicate",
        "/api/construction/organization/designations/{id}/delete",
      ]),
    );
    expect(Object.keys(spec.components.schemas)).toEqual(
      expect.arrayContaining([
        "ListConstructionOrganizationDesignationsResponse",
        "ConstructionOrganizationDesignationResponse",
        "CreateConstructionOrganizationDesignationRequest",
        "UpdateConstructionOrganizationDesignationRequest",
        "DuplicateConstructionOrganizationDesignationRequest",
      ]),
    );
  });
});
