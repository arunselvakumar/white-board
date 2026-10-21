import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as deleteClient } from "@/app/api/construction/masters/clients/[id]/delete/route";
import { POST as updateClient } from "@/app/api/construction/masters/clients/[id]/update/route";
import type { ConstructionMastersClientResponseModel } from "@/app/api/construction/masters/clients/client-models";
import { POST as createClient } from "@/app/api/construction/masters/clients/route";
import { jsonRequest, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getHome } from "./[id]/home/route";
import { POST as updateProject } from "./[id]/update/route";
import type { ConstructionProjectsProjectResponseModel } from "./project-models";
import { POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;
const CLIENTS = `${TEST_ORIGIN}/api/construction/masters/clients`;

type Project = ConstructionProjectsProjectResponseModel;
type Client = ConstructionMastersClientResponseModel;

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function add(cookie: string, body: Record<string, unknown>) {
  return createProject(
    jsonRequest(BASE, cookie, { projectType: "residential", ...body }),
  );
}

async function created(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Project> {
  const response = await add(cookie, body);
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Project>(response);
}

function edit(cookie: string, project: Project, body: Record<string, unknown>) {
  return updateProject(
    jsonRequest(`${BASE}/${project.id}/update`, cookie, {
      name: project.name,
      status: project.status,
      expectedUpdatedAt: project.updatedAt,
      ...body,
    }),
    params(project.id),
  );
}

async function client(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Client> {
  const response = await createClient(jsonRequest(CLIENTS, cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Client>(response);
}

async function hiddenModules(projectId: string): Promise<string[]> {
  const rows = await prisma.constructionProjectsHiddenModule.findMany({
    where: { projectId },
    orderBy: { moduleKey: "asc" },
  });
  return rows.map((row) => row.moduleKey);
}

describe("A Project's Client and Role (CM-1101, ADR CM-0023 §2)", () => {
  it("links a Client, fills the client name from it and starts as Contract work", async () => {
    const company = await ownerWithCompany();
    const balaji = await client(company.cookie, {
      name: "Sri Balaji Developers",
    });
    const project = await created(company.cookie, {
      name: "Balaji Towers",
      clientId: balaji.id,
      clientName: "Typed over",
    });
    expect(project).toMatchObject({
      clientId: balaji.id,
      clientName: "Sri Balaji Developers",
      role: "contract",
    });
    expect(await hiddenModules(project.id)).toEqual([]);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: project.id, action: "project.created" },
    });
    expect(audit?.after).toMatchObject({
      clientId: balaji.id,
      role: "contract",
    });

    // A typed client name alone is Contract work too.
    expect(
      await created(company.cookie, {
        name: "Road Work",
        clientName: "Highways Department",
      }),
    ).toMatchObject({ clientId: null, role: "contract" });
  });

  it("starts an Own development Project with Client Bills hidden, and a Role change leaves the modules alone", async () => {
    const company = await ownerWithCompany();
    const own = await created(company.cookie, { name: "Own Villas" });
    expect(own).toMatchObject({ clientId: null, role: "own" });
    expect(await hiddenModules(own.id)).toEqual(["client_bills"]);
    const home = await json<{
      modules: { key: string; hidden?: boolean }[];
    }>(
      await getHome(
        jsonRequest(`${BASE}/${own.id}/home`, company.cookie),
        params(own.id),
      ),
    );
    expect(
      home.modules.find((item) => item.key === "client_bills"),
    ).toMatchObject({ hidden: true });
    expect(home.modules.find((item) => item.key === "boq")?.hidden).not.toBe(
      true,
    );

    // Chosen explicitly, Own development wins over a client name.
    expect(
      await created(company.cookie, {
        name: "Sale Flats",
        clientName: "Ourselves",
        role: "own",
      }),
    ).toMatchObject({ role: "own" });

    const switched = await edit(company.cookie, own, { role: "contract" });
    expect(switched.status).toBe(StatusCodes.OK);
    expect((await json<Project>(switched)).role).toBe("contract");
    expect(await hiddenModules(own.id)).toEqual(["client_bills"]);

    const contract = await created(company.cookie, {
      name: "Contract Tower",
      role: "contract",
    });
    const back = await edit(company.cookie, contract, { role: "own" });
    expect((await json<Project>(back)).role).toBe("own");
    expect(await hiddenModules(contract.id)).toEqual([]);
  });

  it("keeps the link when an edit leaves it out, takes a renamed Client's name, and unlinks with null", async () => {
    const company = await ownerWithCompany();
    const balaji = await client(company.cookie, {
      name: "Sri Balaji Developers",
    });
    const project = await created(company.cookie, {
      name: "Balaji Towers",
      clientId: balaji.id,
    });
    const renamed = await updateClient(
      jsonRequest(`${CLIENTS}/${balaji.id}/update`, company.cookie, {
        name: "Sri Balaji Developers LLP",
        isActive: false,
        expectedUpdatedAt: balaji.updatedAt,
      }),
      params(balaji.id),
    );
    expect(renamed.status).toBe(StatusCodes.OK);

    // Left out: kept, and the client name follows the Client, even inactive.
    const kept = await edit(company.cookie, project, {
      status: "on_hold",
      clientName: "Ignored while linked",
    });
    expect(kept.status).toBe(StatusCodes.OK);
    const keptBody = await json<Project>(kept);
    expect(keptBody).toMatchObject({
      clientId: balaji.id,
      clientName: "Sri Balaji Developers LLP",
      role: "contract",
    });

    const unlinked = await json<Project>(
      await edit(company.cookie, keptBody, {
        clientId: null,
        clientName: "Balaji (old papers)",
      }),
    );
    expect(unlinked).toMatchObject({
      clientId: null,
      clientName: "Balaji (old papers)",
      role: "contract",
    });

    // Linking the inactive Client anew is refused.
    const relink = await edit(company.cookie, unlinked, {
      clientId: balaji.id,
    });
    expect(relink.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<{ code: string }>(relink)).toMatchObject({
      code: "CLIENT_INACTIVE",
      details: { field: "clientId" },
    });
  });

  it("refuses a Client that is deleted or another Company's, and guards the Client's delete", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const theirs = await client(other.cookie, { name: "Their Client" });
    const refused = await add(company.cookie, {
      name: "Tower",
      clientId: theirs.id,
    });
    expect(refused.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json<{ code: string }>(refused)).toMatchObject({
      code: "CLIENT_NOT_FOUND",
      details: { field: "clientId" },
    });

    const balaji = await client(company.cookie, {
      name: "Sri Balaji Developers",
    });
    const project = await created(company.cookie, {
      name: "Balaji Towers",
      clientId: balaji.id,
    });
    const inUse = await deleteClient(
      jsonRequest(`${CLIENTS}/${balaji.id}/delete`, company.cookie, {}),
      params(balaji.id),
    );
    expect(inUse.status).toBe(StatusCodes.CONFLICT);
    expect(await json<{ code: string }>(inUse)).toMatchObject({
      code: "CLIENT_IN_USE",
      details: { projectCount: 1 },
    });

    await json<Project>(
      await edit(company.cookie, project, { clientId: null }),
    );
    const freed = await deleteClient(
      jsonRequest(`${CLIENTS}/${balaji.id}/delete`, company.cookie, {}),
      params(balaji.id),
    );
    expect(freed.status).toBe(StatusCodes.NO_CONTENT);
    const gone = await add(company.cookie, {
      name: "Second Tower",
      clientId: balaji.id,
    });
    expect(gone.status).toBe(StatusCodes.BAD_REQUEST);
    expect((await json<{ code: string }>(gone)).code).toBe("CLIENT_NOT_FOUND");

    const badRole = await add(company.cookie, {
      name: "Third Tower",
      role: "builder",
    });
    expect(badRole.status).toBe(StatusCodes.BAD_REQUEST);
  });
});
