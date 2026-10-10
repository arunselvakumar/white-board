import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getContractor } from "@/app/api/construction/masters/contractors/[id]/route";
import { POST as deactivateContractor } from "@/app/api/construction/masters/contractors/[id]/deactivate/route";
import { POST as createContractor } from "@/app/api/construction/masters/contractors/route";
import { POST as deactivateSupplier } from "@/app/api/construction/masters/suppliers/[id]/deactivate/route";
import { GET as getSupplier } from "@/app/api/construction/masters/suppliers/[id]/route";
import { POST as createSupplier } from "@/app/api/construction/masters/suppliers/route";
import { GET as getVendor } from "@/app/api/construction/labour/vendors/[id]/route";
import { GET as getTeamMember } from "@/app/api/construction/organization/team-members/[id]/route";
import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { createVendorHandlers } from "@/src/labour/infrastructure/create-vendor-handlers";
import { createTeamMemberHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";
import type { Flag } from "@/src/shared-kernel/access";
import {
  addProject,
  jsonRequest,
  memberWith,
  ownerWithCompany,
} from "@/test/companies";
import { newEmail, TEST_ORIGIN } from "@/test/sessions";

import { GET as contractorOptions } from "./contractors/options/route";
import { POST as setContractors } from "./contractors/route";
import { GET as getResources } from "./route";
import { GET as supplierOptions } from "./suppliers/options/route";
import { POST as setSuppliers } from "./suppliers/route";
import { GET as teamMemberOptions } from "./team-members/options/route";
import { POST as setTeamMembers } from "./team-members/route";
import { GET as vendorOptions } from "./vendors/options/route";
import { POST as setVendors } from "./vendors/route";

const API = `${TEST_ORIGIN}/api/construction`;

type Line = {
  id: string;
  name: string;
  detail: string | null;
  isActive: boolean;
};

type Resources = {
  teamMembers: (Line & { isOwner: boolean })[];
  contractors: Line[];
  suppliers: Line[];
  vendors: Line[];
};

type Company = Awaited<ReturnType<typeof ownerWithCompany>>;
type Route = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => Promise<Response>;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function resourcesUrl(projectId: string, rest = ""): string {
  return `${API}/projects/projects/${projectId}/resources${rest}`;
}

const SET: Record<keyof Resources, { route: Route; segment: string }> = {
  teamMembers: { route: setTeamMembers, segment: "team-members" },
  contractors: { route: setContractors, segment: "contractors" },
  suppliers: { route: setSuppliers, segment: "suppliers" },
  vendors: { route: setVendors, segment: "vendors" },
};

const OPTIONS: Record<keyof Resources, Route> = {
  teamMembers: teamMemberOptions,
  contractors: contractorOptions,
  suppliers: supplierOptions,
  vendors: vendorOptions,
};

function set(
  cookie: string,
  projectId: string,
  kind: keyof Resources,
  ids: string[],
  expectedIds: string[],
): Promise<Response> {
  const { route, segment } = SET[kind];
  return route(
    jsonRequest(resourcesUrl(projectId, `/${segment}`), cookie, {
      ids,
      expectedIds,
    }),
    params(projectId),
  );
}

function read(cookie: string, projectId: string): Promise<Response> {
  return getResources(
    jsonRequest(resourcesUrl(projectId), cookie),
    params(projectId),
  );
}

async function options(
  cookie: string,
  projectId: string,
  kind: keyof Resources,
): Promise<Response> {
  return OPTIONS[kind](
    jsonRequest(
      resourcesUrl(projectId, `/${SET[kind].segment}/options`),
      cookie,
    ),
    params(projectId),
  );
}

async function codeOf(response: Response): Promise<string> {
  return (await json<{ code: string }>(response)).code;
}

async function contractor(company: Company, name: string): Promise<string> {
  const response = await createContractor(
    jsonRequest(`${API}/masters/contractors`, company.cookie, {
      name,
      mobile: "77081 65767",
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

async function supplier(company: Company, name: string): Promise<string> {
  const response = await createSupplier(
    jsonRequest(`${API}/masters/suppliers`, company.cookie, {
      name,
      contactPerson: "Selvam",
    }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

async function vendor(company: Company, name: string): Promise<string> {
  const created = await createVendorHandlers().create({
    workspaceId: company.workspaceId,
    details: { name, joiningDate: "2026-04-01", contactNumber: "98400 12345" },
    projectIds: [],
    shifts: [],
    openingBalance: null,
    by: company.userId,
  });
  return created.id;
}

async function hrmsMember(company: Company): Promise<string> {
  const member = await createTeamMemberHandlers().invite({
    workspaceId: company.workspaceId,
    by: company.userId,
    memberType: "hrms",
    details: {
      name: "Kavitha HRMS",
      designationId: company.designationId("Site Engineer"),
      email: newEmail(),
    },
  });
  return member.id;
}

async function memberOn(
  company: Company,
  projectIds: string[],
  flags: Flag[],
) {
  const member = await memberWith(company, { "projects.project": flags });
  await createTeamMemberHandlers().assignProjects({
    workspaceId: company.workspaceId,
    id: member.memberId,
    by: company.userId,
    projectIds,
  });
  return member;
}

describe("Project Resources (CM-406)", () => {
  it("shows the Owner and changes each kind through the context that owns it", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const engineer = await memberWith(company, {});
    const [balaji, kaveri, muthu] = await Promise.all([
      contractor(company, "Sri Balaji Constructions"),
      supplier(company, "Kaveri Cements"),
      vendor(company, "Muthu Gang"),
    ]);

    const empty = await json<Resources>(await read(company.cookie, project));
    expect(empty.teamMembers).toHaveLength(1);
    expect(empty.teamMembers[0]).toMatchObject({
      isOwner: true,
      isActive: true,
    });
    expect(empty.contractors).toEqual([]);
    expect(empty.suppliers).toEqual([]);
    expect(empty.vendors).toEqual([]);

    const team = await set(
      company.cookie,
      project,
      "teamMembers",
      [engineer.memberId],
      [],
    );
    expect(team.status).toBe(StatusCodes.OK);
    const afterTeam = await json<Resources>(team);
    expect(afterTeam.teamMembers.map((item) => item.isOwner)).toEqual([
      true,
      false,
    ]);
    expect(afterTeam.teamMembers[1]).toMatchObject({
      id: engineer.memberId,
      detail: "Site Engineer",
    });

    for (const [kind, id] of [
      ["contractors", balaji],
      ["suppliers", kaveri],
      ["vendors", muthu],
    ] as const) {
      const response = await set(company.cookie, project, kind, [id], []);
      expect(response.status, kind).toBe(StatusCodes.OK);
      expect(
        (await json<Resources>(response))[kind].map((item) => item.id),
      ).toEqual([id]);
    }
    const all = await json<Resources>(await read(company.cookie, project));
    expect(all.contractors[0]).toMatchObject({
      name: "Sri Balaji Constructions",
      detail: "+91 77081 65767",
      isActive: true,
    });
    expect(all.suppliers[0]?.detail).toBe("Selvam");
    expect(all.vendors[0]?.detail).toBe("+91 98400 12345");

    // The masters screens show the same assignment.
    const member = await json<{ projectIds: string[] }>(
      await getTeamMember(
        jsonRequest(
          `${API}/organization/team-members/${engineer.memberId}`,
          company.cookie,
        ),
        params(engineer.memberId),
      ),
    );
    expect(member.projectIds).toEqual([project]);
    for (const [route, path, id] of [
      [getContractor, "masters/contractors", balaji],
      [getSupplier, "masters/suppliers", kaveri],
      [getVendor, "labour/vendors", muthu],
    ] as const) {
      const party = await json<{ projects: { id: string }[] }>(
        await route(
          jsonRequest(`${API}/${path}/${id}`, company.cookie),
          params(id),
        ),
      );
      expect(
        party.projects.map((item) => item.id),
        path,
      ).toEqual([project]);
    }

    // A screen that loaded an older set gets 409, and nothing changes.
    const stale = await set(company.cookie, project, "contractors", [], []);
    expect(stale.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(stale)).toBe("PROJECT_RESOURCES_CHANGED");
    const staleTeam = await set(company.cookie, project, "teamMembers", [], []);
    expect(staleTeam.status).toBe(StatusCodes.CONFLICT);

    for (const [kind, id] of [
      ["teamMembers", engineer.memberId],
      ["contractors", balaji],
      ["suppliers", kaveri],
      ["vendors", muthu],
    ] as const) {
      const removed = await set(company.cookie, project, kind, [], [id]);
      expect(removed.status, kind).toBe(StatusCodes.OK);
    }
    const cleared = await json<Resources>(await read(company.cookie, project));
    expect(cleared.teamMembers).toHaveLength(1);
    expect(cleared.contractors).toEqual([]);
    expect(cleared.suppliers).toEqual([]);
    expect(cleared.vendors).toEqual([]);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: company.workspaceId,
        action: { endsWith: ".projects_changed" },
      },
      select: { action: true, entityId: true },
    });
    for (const [action, id] of [
      ["team_member.projects_changed", engineer.memberId],
      ["contractor.projects_changed", balaji],
      ["supplier.projects_changed", kaveri],
      ["vendor.projects_changed", muthu],
    ])
      expect(
        audit.filter((row) => row.action === action && row.entityId === id),
        action,
      ).toHaveLength(2);
  });

  it("keeps the owning contexts' rules: Owner, HRMS, inactive and unknown parties", async () => {
    const company = await ownerWithCompany();
    const other = await ownerWithCompany("Other Builders");
    const project = await addProject(company.workspaceId, company.userId);
    const [hrms, balaji, ramco, kaveri, chettinad, muthu, raja] =
      await Promise.all([
        hrmsMember(company),
        contractor(company, "Sri Balaji Constructions"),
        contractor(company, "Ramco Builders"),
        supplier(company, "Kaveri Cements"),
        supplier(company, "Chettinad Bricks"),
        vendor(company, "Muthu Gang"),
        vendor(company, "Raja Gang"),
      ]);
    const owner = (await json<Resources>(await read(company.cookie, project)))
      .teamMembers[0];

    // HRMS Team Members are on no Project; the Owner is on every one.
    const withHrms = await set(
      company.cookie,
      project,
      "teamMembers",
      [hrms],
      [],
    );
    expect(withHrms.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(withHrms)).toBe("HRMS_MEMBER_HAS_NO_PROJECTS");
    const withOwner = await set(
      company.cookie,
      project,
      "teamMembers",
      [owner?.id ?? ""],
      [],
    );
    expect(withOwner.status).toBe(StatusCodes.OK);
    expect((await json<Resources>(withOwner)).teamMembers).toHaveLength(1);
    const ownerRow =
      await prisma.constructionOrganizationTeamMemberProject.count({
        where: { memberId: owner?.id ?? "" },
      });
    expect(ownerRow).toBe(0);
    const teamChoices = await json<{ items: Line[] }>(
      await options(company.cookie, project, "teamMembers"),
    );
    expect(teamChoices.items.map((item) => item.id)).not.toContain(hrms);
    expect(teamChoices.items.map((item) => item.id)).not.toContain(owner?.id);

    // An inactive party stays on the Project but is not added to one.
    expect(
      (await set(company.cookie, project, "contractors", [balaji], [])).status,
    ).toBe(StatusCodes.OK);
    expect(
      (await set(company.cookie, project, "suppliers", [kaveri], [])).status,
    ).toBe(StatusCodes.OK);
    expect(
      (await set(company.cookie, project, "vendors", [muthu], [])).status,
    ).toBe(StatusCodes.OK);
    await deactivateContractor(
      jsonRequest(
        `${API}/masters/contractors/${balaji}/deactivate`,
        company.cookie,
        {},
      ),
      params(balaji),
    );
    await deactivateContractor(
      jsonRequest(
        `${API}/masters/contractors/${ramco}/deactivate`,
        company.cookie,
        {},
      ),
      params(ramco),
    );
    await deactivateSupplier(
      jsonRequest(
        `${API}/masters/suppliers/${chettinad}/deactivate`,
        company.cookie,
        {},
      ),
      params(chettinad),
    );
    await createVendorHandlers().setActive({
      workspaceId: company.workspaceId,
      id: raja,
      isActive: false,
      by: company.userId,
    });
    for (const [kind, kept, added, code] of [
      ["contractors", balaji, ramco, "CONTRACTOR_INACTIVE"],
      ["suppliers", kaveri, chettinad, "SUPPLIER_INACTIVE"],
      ["vendors", muthu, raja, "VENDOR_INACTIVE"],
    ] as const) {
      const refused = await set(
        company.cookie,
        project,
        kind,
        [kept, added],
        [kept],
      );
      expect(refused.status, kind).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused)).toBe(code);
      const choices = await json<{ items: Line[] }>(
        await options(company.cookie, project, kind),
      );
      expect(
        choices.items.map((item) => item.id),
        kind,
      ).not.toContain(added);
    }
    const kept = await json<Resources>(
      await set(company.cookie, project, "contractors", [balaji], [balaji]),
    );
    expect(kept.contractors).toEqual([
      expect.objectContaining({ id: balaji, isActive: false }),
    ]);

    // Unknown ids and another Company's parties are refused.
    const [theirMember, theirContractor, theirSupplier, theirVendor] =
      await Promise.all([
        memberWith(other, {}).then((member) => member.memberId),
        contractor(other, "Their Contractor"),
        supplier(other, "Their Supplier"),
        vendor(other, "Their Gang"),
      ]);
    for (const [kind, foreign, expected, code] of [
      ["teamMembers", theirMember, [], "TEAM_MEMBER_NOT_FOUND"],
      ["contractors", theirContractor, [balaji], "CONTRACTOR_NOT_FOUND"],
      ["suppliers", theirSupplier, [kaveri], "SUPPLIER_NOT_FOUND"],
      ["vendors", theirVendor, [muthu], "VENDOR_NOT_FOUND"],
    ] as const) {
      const refused = await set(
        company.cookie,
        project,
        kind,
        [...expected, foreign],
        [...expected],
      );
      expect(refused.status, kind).toBe(StatusCodes.BAD_REQUEST);
      expect(await codeOf(refused), kind).toBe(code);
    }
    const unknown = await set(
      company.cookie,
      project,
      "suppliers",
      [crypto.randomUUID()],
      [kaveri],
    );
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(unknown)).toBe("SUPPLIER_NOT_FOUND");
    const invalid = await set(company.cookie, project, "suppliers", ["x"], []);
    expect(invalid.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await codeOf(invalid)).toBe("VALIDATION_ERROR");
  });

  it("needs the Project menu and the Project, and is per Company", async () => {
    const company = await ownerWithCompany();
    const project = await addProject(company.workspaceId, company.userId);
    const elsewhere = await addProject(company.workspaceId, company.userId);
    const balaji = await contractor(company, "Sri Balaji Constructions");

    const viewer = await memberOn(company, [project], ["read"]);
    expect((await read(viewer.cookie, project)).status).toBe(StatusCodes.OK);
    expect(
      (await set(viewer.cookie, project, "contractors", [balaji], [])).status,
    ).toBe(StatusCodes.FORBIDDEN);
    expect((await options(viewer.cookie, project, "contractors")).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const editor = await memberOn(company, [project], ["read", "update"]);
    expect(
      (await set(editor.cookie, project, "contractors", [balaji], [])).status,
    ).toBe(StatusCodes.OK);
    expect((await options(editor.cookie, project, "vendors")).status).toBe(
      StatusCodes.OK,
    );
    // Not on the other Project: it does not exist for them.
    expect((await read(editor.cookie, elsewhere)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const notOn = await set(
      editor.cookie,
      elsewhere,
      "contractors",
      [balaji],
      [],
    );
    expect(notOn.status).toBe(StatusCodes.NOT_FOUND);
    expect(await codeOf(notOn)).toBe("PROJECT_NOT_FOUND");
    expect((await options(editor.cookie, elsewhere, "suppliers")).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    const stranger = await memberWith(company, {});
    expect((await read(stranger.cookie, project)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const outsider = await ownerWithCompany("Other Builders");
    expect((await read(outsider.cookie, project)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect(
      (await set(outsider.cookie, project, "contractors", [], [balaji])).status,
    ).toBe(StatusCodes.NOT_FOUND);
  });

  it("is listed in the OpenAPI document", async () => {
    const document = await json<{
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    }>(getOpenApi());
    const base = "/api/construction/projects/projects/{id}/resources";
    expect(document.paths[base]?.["get"]).toBeDefined();
    for (const segment of [
      "team-members",
      "contractors",
      "suppliers",
      "vendors",
    ]) {
      expect(
        document.paths[`${base}/${segment}`]?.["post"],
        segment,
      ).toBeDefined();
      expect(
        document.paths[`${base}/${segment}/options`]?.["get"],
        segment,
      ).toBeDefined();
    }
    expect(
      document.components.schemas[
        "SetConstructionProjectsProjectResourcesRequest"
      ],
    ).toBeDefined();
  });
});
