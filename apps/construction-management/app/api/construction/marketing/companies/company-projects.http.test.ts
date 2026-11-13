import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as deleteProject } from "@/app/api/construction/projects/projects/[id]/delete/route";
import { POST as createProject } from "@/app/api/construction/projects/projects/route";
import type { PermissionGrants } from "@/src/shared-kernel/access";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getOne } from "./[id]/route";
import { POST as moveStage } from "./[id]/stage/route";
import { POST as create } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/marketing/companies`;
const PROJECTS = `${TEST_ORIGIN}/api/construction/projects/projects`;

type Company = {
  id: string;
  name: string;
  stage: string;
  updatedAt: string;
  projects: { id: string; name: string; status: string }[] | null;
  canCreateProject: boolean;
};

type Session = { cookie: string };

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function addCompany(who: Session, name: string): Promise<Company> {
  const response = await create(jsonRequest(BASE, who.cookie, { name }));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Company>(response);
}

async function read(who: Session, id: string): Promise<Company> {
  const response = await getOne(
    jsonRequest(`${BASE}/${id}`, who.cookie),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Company>(response);
}

/** Add Project through its route, with a client name. */
async function addProject(
  who: Session,
  name: string,
  clientName: string | null,
  status = "ongoing",
): Promise<string> {
  const response = await createProject(
    jsonRequest(PROJECTS, who.cookie, {
      name,
      projectType: "residential",
      status,
      clientName,
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

/** Puts the Team Member on Projects, as the Team Members master does. */
async function assign(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

/** The Marketing Role's Companies cells, with View all to see every company. */
const COMPANIES: PermissionGrants = {
  "marketing.companies": ["create", "read", "update", "view_all"],
};

describe("A Prospect Company's Projects (ADR CM-0040 §12)", () => {
  it("lists for the Owner the Projects whose client name matches, ignoring case, spacing and accents, at any Stage", async () => {
    const owner = await ownerWithCompany();
    const company = await addCompany(owner, "Café Balaji Builders");

    const before = await read(owner, company.id);
    expect(before.projects).toEqual([]);
    expect(before.canCreateProject).toBe(true);

    const tower = await addProject(
      owner,
      "Balaji Tower",
      "  cafe balaji   BUILDERS ",
    );
    const villas = await addProject(
      owner,
      "Anugraha Villas",
      "Café Balaji Builders",
      "completed",
    );
    await addProject(owner, "Kaveri Mills", "Café Balaji Build");
    await addProject(owner, "Zen Plots", null);
    const gone = await addProject(owner, "Old Shed", "Cafe Balaji Builders");
    const deleted = await deleteProject(
      jsonRequest(`${PROJECTS}/${gone}/delete`, owner.cookie, {}),
      params(gone),
    );
    expect(deleted.status).toBe(StatusCodes.NO_CONTENT);

    // Still at New: the Projects show at any Stage, in the Projects list's order.
    const read1 = await read(owner, company.id);
    expect(read1.stage).toBe("new");
    expect(read1.projects).toEqual([
      { id: tower, name: "Balaji Tower", status: "ongoing" },
      { id: villas, name: "Anugraha Villas", status: "completed" },
    ]);

    // A write answers with them too.
    const won = await moveStage(
      jsonRequest(`${BASE}/${company.id}/stage`, owner.cookie, {
        stage: "won",
        expectedUpdatedAt: read1.updatedAt,
      }),
      params(company.id),
    );
    expect(won.status).toBe(StatusCodes.OK);
    expect((await json<Company>(won)).projects).toEqual(read1.projects);
  });

  it("shows a member only the matching Projects assigned to them", async () => {
    const owner = await ownerWithCompany();
    const member = await memberWith(owner, {
      ...COMPANIES,
      "projects.project": ["read"],
    });
    const company = await addCompany(owner, "Sri Balaji Developers");
    const theirs = await addProject(
      owner,
      "Kumari Heights",
      "sri balaji developers",
    );
    const others = await addProject(
      owner,
      "Anugraha Residency",
      "Sri Balaji Developers",
    );
    const unrelated = await addProject(owner, "NH-44 Culvert", "NHAI");
    await assign(member.memberId, [theirs, unrelated]);

    const seen = await read(member, company.id);
    expect(seen.projects).toEqual([
      { id: theirs, name: "Kumari Heights", status: "ongoing" },
    ]);
    expect(seen.canCreateProject).toBe(false);

    const all = await read(owner, company.id);
    expect(all.projects?.map((project) => project.id)).toEqual([
      others,
      theirs,
    ]);
  });

  it("is null without Projects read, and Create Project follows Projects create", async () => {
    const owner = await ownerWithCompany();
    const company = await addCompany(owner, "Kaveri Steel");
    await addProject(owner, "Kaveri Plant", "Kaveri Steel");

    const noProjects = await memberWith(owner, COMPANIES);
    const blind = await read(noProjects, company.id);
    expect(blind.projects).toBeNull();
    expect(blind.canCreateProject).toBe(false);

    const creator = await memberWith(owner, {
      ...COMPANIES,
      "projects.project": ["create", "read"],
    });
    const seen = await read(creator, company.id);
    // Not assigned to the Project, so it is not theirs to open.
    expect(seen.projects).toEqual([]);
    expect(seen.canCreateProject).toBe(true);
  });
});
