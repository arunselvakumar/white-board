import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as activateContractor } from "./contractors/[id]/activate/route";
import { POST as deactivateContractor } from "./contractors/[id]/deactivate/route";
import { POST as deleteContractor } from "./contractors/[id]/delete/route";
import { GET as getContractor } from "./contractors/[id]/route";
import { POST as updateContractor } from "./contractors/[id]/update/route";
import {
  GET as listContractors,
  POST as createContractor,
} from "./contractors/route";
import { POST as deleteSupplier } from "./suppliers/[id]/delete/route";
import { GET as getSupplier } from "./suppliers/[id]/route";
import { POST as updateSupplier } from "./suppliers/[id]/update/route";
import {
  GET as listSuppliers,
  POST as createSupplier,
} from "./suppliers/route";

const CONTRACTORS = `${TEST_ORIGIN}/api/construction/masters/contractors`;
const SUPPLIERS = `${TEST_ORIGIN}/api/construction/masters/suppliers`;

type Ref = { id: string; name: string };

type Party = {
  id: string;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  isActive: boolean;
  departments: Ref[];
  projects: Ref[];
  updatedAt: string;
};

type Page = {
  items: Party[];
  nextCursor: string | null;
  prevCursor: string | null;
  total: number;
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function seedProject(workspaceId: string, name: string) {
  const id = newId();
  await prisma.constructionProjectsProject.create({
    data: { id, workspaceId, name, createdBy: "test", updatedBy: "test" },
  });
  return id;
}

async function seedDepartment(
  workspaceId: string,
  name: string,
  disabled = false,
) {
  const id = newId();
  await prisma.constructionMastersDepartment.create({
    data: {
      id,
      workspaceId,
      name: `${name} ${id.slice(-6)}`,
      disabledAt: disabled ? new Date() : null,
      createdBy: "test",
      updatedBy: "test",
    },
  });
  return id;
}

async function addContractor(company: Company, body: Record<string, unknown>) {
  return createContractor(jsonRequest(CONTRACTORS, company.cookie, body));
}

describe("Contractors and Suppliers (CM-406)", () => {
  it("adds, reads, edits, lists and deletes a Contractor with Departments and Projects", async () => {
    const company = await ownerWithCompany();
    const [tower, villa, rcc, plumbing, painting] = await Promise.all([
      seedProject(company.workspaceId, "Tower A"),
      seedProject(company.workspaceId, "Villa Phase 2"),
      seedDepartment(company.workspaceId, "RCC"),
      seedDepartment(company.workspaceId, "Plumbing"),
      seedDepartment(company.workspaceId, "Painting", true),
    ]);

    const created = await addContractor(company, {
      name: "  Sri Balaji  Constructions ",
      contactPerson: "Murugan",
      mobile: "77081 65767",
      email: "Office@Balaji.example",
      address: "12, Anna Nagar, Chennai",
      gstin: "33aapfa0939f1zm",
      pan: "AAPFA0939F",
      departmentIds: [rcc],
      projectIds: [tower],
    });
    expect(created.status).toBe(StatusCodes.CREATED);
    const contractor = await json<Party>(created);
    expect(contractor).toMatchObject({
      name: "Sri Balaji Constructions",
      contactPerson: "Murugan",
      mobile: "+917708165767",
      email: "office@balaji.example",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      isActive: true,
      projects: [{ id: tower, name: "Tower A" }],
    });
    expect(contractor.departments.map((item) => item.id)).toEqual([rcc]);

    const read = await getContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}`, company.cookie),
      params(contractor.id),
    );
    expect(read.status).toBe(StatusCodes.OK);

    // A disabled Department cannot be added; one already on it may stay.
    const disabled = await updateContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/update`, company.cookie, {
        name: "Sri Balaji Constructions",
        departmentIds: [rcc, painting],
        projectIds: [tower],
        expectedUpdatedAt: contractor.updatedAt,
      }),
      params(contractor.id),
    );
    expect(disabled.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<{ code: string }>(disabled)).toMatchObject({
      code: "DEPARTMENT_DISABLED",
    });

    const edited = await updateContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/update`, company.cookie, {
        name: "Sri Balaji Constructions",
        mobile: null,
        departmentIds: [rcc, plumbing],
        projectIds: [tower, villa],
        expectedUpdatedAt: contractor.updatedAt,
      }),
      params(contractor.id),
    );
    expect(edited.status).toBe(StatusCodes.OK);
    const after = await json<Party>(edited);
    expect(after.mobile).toBeNull();
    expect(after.gstin).toBeNull();
    expect(after.departments).toHaveLength(2);
    expect(after.projects.map((item) => item.name)).toEqual([
      "Tower A",
      "Villa Phase 2",
    ]);

    // The form's updatedAt is stale now.
    const stale = await updateContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/update`, company.cookie, {
        name: "Balaji",
        expectedUpdatedAt: contractor.updatedAt,
      }),
      params(contractor.id),
    );
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ code: string }>(stale)).toMatchObject({
      code: "CONTRACTOR_CHANGED",
    });

    // On live Projects it cannot be deleted; inactive it stays on them.
    const refused = await deleteContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/delete`, company.cookie, {}),
      params(contractor.id),
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ code: string }>(refused)).toMatchObject({
      code: "CONTRACTOR_ON_PROJECTS",
    });
    const inactive = await json<Party>(
      await deactivateContractor(
        jsonRequest(
          `${CONTRACTORS}/${contractor.id}/deactivate`,
          company.cookie,
          {},
        ),
        params(contractor.id),
      ),
    );
    expect(inactive.isActive).toBe(false);
    expect(inactive.projects).toHaveLength(2);
    const active = await json<Party>(
      await activateContractor(
        jsonRequest(
          `${CONTRACTORS}/${contractor.id}/activate`,
          company.cookie,
          {},
        ),
        params(contractor.id),
      ),
    );
    expect(active.isActive).toBe(true);

    const cleared = await updateContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/update`, company.cookie, {
        name: "Sri Balaji Constructions",
        projectIds: [],
        expectedUpdatedAt: active.updatedAt,
      }),
      params(contractor.id),
    );
    expect(cleared.status).toBe(StatusCodes.OK);
    const deleted = await deleteContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}/delete`, company.cookie, {}),
      params(contractor.id),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await getContractor(
      jsonRequest(`${CONTRACTORS}/${contractor.id}`, company.cookie),
      params(contractor.id),
    );
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);

    // The name is free again once the old row is a tombstone.
    const again = await addContractor(company, {
      name: "SRI BALAJI CONSTRUCTIONS",
    });
    expect(again.status).toBe(StatusCodes.CREATED);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: company.workspaceId, entityId: contractor.id },
      select: { action: true },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "contractor.created",
      "contractor.updated",
      "contractor.deactivated",
      "contractor.activated",
      "contractor.updated",
      "contractor.deleted",
    ]);
  });

  it("checks names, contacts, tax ids, Projects and Departments", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const [foreignProject, foreignDepartment] = await Promise.all([
      seedProject(other.workspaceId, "Theirs"),
      seedDepartment(other.workspaceId, "RCC"),
    ]);
    const cases: [Record<string, unknown>, number, string][] = [
      [{ name: " " }, StatusCodes.BAD_REQUEST, "CONTRACTOR_NAME_REQUIRED"],
      [
        { name: "x".repeat(121) },
        StatusCodes.BAD_REQUEST,
        "CONTRACTOR_NAME_TOO_LONG",
      ],
      [
        { name: "A", mobile: "12345" },
        StatusCodes.BAD_REQUEST,
        "MOBILE_INVALID",
      ],
      [{ name: "A", email: "nope" }, StatusCodes.BAD_REQUEST, "EMAIL_INVALID"],
      [
        { name: "A", gstin: "33AAPFA0939F1ZW" },
        StatusCodes.BAD_REQUEST,
        "GSTIN_INVALID",
      ],
      [{ name: "A", pan: "AAPFA0939" }, StatusCodes.BAD_REQUEST, "PAN_INVALID"],
      [
        { name: "A", gstin: "33AAPFA0939F1ZM", pan: "AAACB1234C" },
        StatusCodes.BAD_REQUEST,
        "GSTIN_PAN_MISMATCH",
      ],
      [
        { name: "A", address: "x".repeat(501) },
        StatusCodes.BAD_REQUEST,
        "ADDRESS_TOO_LONG",
      ],
      [
        { name: "A", projectIds: [foreignProject] },
        StatusCodes.BAD_REQUEST,
        "PROJECT_NOT_FOUND",
      ],
      [
        { name: "A", departmentIds: [foreignDepartment] },
        StatusCodes.BAD_REQUEST,
        "DEPARTMENT_NOT_FOUND",
      ],
    ];
    for (const [body, status, code] of cases) {
      const response = await addContractor(company, body);
      expect(response.status, code).toBe(status);
      expect(await json<{ code: string }>(response)).toMatchObject({ code });
    }

    expect((await addContractor(company, { name: "Kaveri" })).status).toBe(
      StatusCodes.CREATED,
    );
    const duplicate = await addContractor(company, { name: " kaveri " });
    expect(duplicate.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ code: string }>(duplicate)).toMatchObject({
      code: "CONTRACTOR_NAME_IN_USE",
    });
    // Each list has its own names.
    const supplier = await createSupplier(
      jsonRequest(SUPPLIERS, company.cookie, { name: "Kaveri" }),
    );
    expect(supplier.status).toBe(StatusCodes.CREATED);
  });

  it("lists newest first with search, active and Project filters and cursor pages", async () => {
    const company = await ownerWithCompany();
    const tower = await seedProject(company.workspaceId, "Tower A");
    for (const [name, extra] of [
      ["Kaveri Cements", { contactPerson: "Selvam", projectIds: [tower] }],
      ["Ramco Steel", { mobile: "98400 12345" }],
      ["Chettinad Bricks", { gstin: "33AAPFA0939F1ZM" }],
    ] as const) {
      const response = await createSupplier(
        jsonRequest(SUPPLIERS, company.cookie, { name, ...extra }),
      );
      expect(response.status).toBe(StatusCodes.CREATED);
    }
    const list = async (query: string) =>
      json<Page>(
        await listSuppliers(
          jsonRequest(`${SUPPLIERS}?${query}`, company.cookie),
        ),
      );

    const all = await list("");
    expect(all.total).toBe(3);
    expect(all.items.map((item) => item.name)).toEqual([
      "Chettinad Bricks",
      "Ramco Steel",
      "Kaveri Cements",
    ]);
    expect(all.items[0]?.departments).toEqual([]);
    expect((await list("q=selvam")).items.map((item) => item.name)).toEqual([
      "Kaveri Cements",
    ]);
    expect((await list("q=40012")).items.map((item) => item.name)).toEqual([
      "Ramco Steel",
    ]);
    expect((await list("q=aapfa")).items.map((item) => item.name)).toEqual([
      "Chettinad Bricks",
    ]);
    expect((await list(`projectId=${tower}`)).total).toBe(1);

    const first = await list("limit=2");
    expect(first.items).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.prevCursor).toBeNull();
    const second = await list(`limit=2&after=${first.nextCursor ?? ""}`);
    expect(second.items.map((item) => item.name)).toEqual(["Kaveri Cements"]);
    expect(second.nextCursor).toBeNull();
    const back = await list(`limit=2&before=${second.prevCursor ?? ""}`);
    expect(back.items.map((item) => item.name)).toEqual([
      "Chettinad Bricks",
      "Ramco Steel",
    ]);

    const [ramco] = (await list("q=ramco")).items;
    await prisma.constructionMastersSupplier.update({
      where: { id: ramco?.id ?? "" },
      data: { isActive: false },
    });
    expect((await list("active=false")).items.map((item) => item.name)).toEqual(
      ["Ramco Steel"],
    );
    expect((await list("active=true")).total).toBe(2);
  });

  it("is under masters.contractors and masters.suppliers, and per Company", async () => {
    const company = await ownerWithCompany();
    const created = await json<Party>(
      await createSupplier(
        jsonRequest(SUPPLIERS, company.cookie, { name: "Kaveri Cements" }),
      ),
    );
    const reader = await memberWith(company, {
      "masters.suppliers": ["read"],
    });
    expect(
      (await listSuppliers(jsonRequest(SUPPLIERS, reader.cookie))).status,
    ).toBe(StatusCodes.OK);
    expect(
      (
        await updateSupplier(
          jsonRequest(`${SUPPLIERS}/${created.id}/update`, reader.cookie, {
            name: "Kaveri",
            expectedUpdatedAt: created.updatedAt,
          }),
          params(created.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (
        await deleteSupplier(
          jsonRequest(`${SUPPLIERS}/${created.id}/delete`, reader.cookie, {}),
          params(created.id),
        )
      ).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect(
      (await listContractors(jsonRequest(CONTRACTORS, reader.cookie))).status,
    ).toBe(StatusCodes.FORBIDDEN);

    const outsider = await ownerWithCompany("Other Builders");
    expect(
      (
        await getSupplier(
          jsonRequest(`${SUPPLIERS}/${created.id}`, outsider.cookie),
          params(created.id),
        )
      ).status,
    ).toBe(StatusCodes.NOT_FOUND);
    const theirs = await json<Page>(
      await listSuppliers(jsonRequest(SUPPLIERS, outsider.cookie)),
    );
    expect(theirs.total).toBe(0);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    for (const base of [
      "/api/construction/masters/contractors",
      "/api/construction/masters/suppliers",
    ])
      for (const path of [
        base,
        `${base}/{id}`,
        `${base}/{id}/update`,
        `${base}/{id}/activate`,
        `${base}/{id}/deactivate`,
        `${base}/{id}/delete`,
      ])
        expect(document.paths[path], path).toBeDefined();
    expect(
      document.components.schemas["CreateConstructionMastersContractorRequest"],
    ).toBeDefined();
    expect(
      document.components.schemas["ConstructionMastersSupplierResponse"],
    ).toBeDefined();
  });
});
