import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { PROJECT_MODULE_KEYS } from "@/src/projects/domain/project-modules";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as updateTileOrder } from "../tile-order/update/route";
import { POST as updateHiddenModules } from "./[id]/hidden-modules/update/route";
import { GET as getHome } from "./[id]/home/route";
import { POST as pinProject } from "./[id]/pin/route";
import { POST as unpinProject } from "./[id]/unpin/route";
import { GET as listProjects, POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;
const TILE_ORDER = `${TEST_ORIGIN}/api/construction/projects/tile-order/update`;

type Home = {
  modules: { key: string; label: string; segment: string; hidden: boolean }[];
  pinned: boolean;
  canHideModules: boolean;
};

type ProjectList = {
  items: { id: string; name: string; status: string; pinned: boolean }[];
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function create(
  cookie: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await createProject(
    jsonRequest(BASE, cookie, { projectType: "residential", ...body }),
  );
  expect(response.status).toBe(StatusCodes.CREATED);
  return (await json<{ id: string }>(response)).id;
}

async function home(cookie: string, id: string): Promise<Home> {
  const response = await getHome(
    jsonRequest(`${BASE}/${id}/home`, cookie),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Home>(response);
}

const keys = (value: Home) => value.modules.map((module) => module.key);

function hide(cookie: string, id: string, hiddenModules: string[]) {
  return updateHiddenModules(
    jsonRequest(`${BASE}/${id}/hidden-modules/update`, cookie, {
      hiddenModules,
    }),
    params(id),
  );
}

function tileOrder(cookie: string, order: string[]) {
  return updateTileOrder(jsonRequest(TILE_ORDER, cookie, { tileOrder: order }));
}

function pin(cookie: string, id: string, on = true) {
  return (on ? pinProject : unpinProject)(
    jsonRequest(`${BASE}/${id}/${on ? "pin" : "unpin"}`, cookie, {}),
    params(id),
  );
}

async function list(cookie: string): Promise<ProjectList> {
  const response = await listProjects(jsonRequest(BASE, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<ProjectList>(response);
}

/** Puts the Team Member on Projects, as Masters → Team Members does. */
async function putOn(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

/** A live Wing (with its Phase) or Location, as CM-402 / CM-405 write them. */
async function addStructure(
  workspaceId: string,
  projectId: string,
  kind: "wing" | "location",
): Promise<string> {
  const base = {
    workspaceId,
    projectId,
    position: 0,
    createdBy: "test",
    updatedBy: "test",
  };
  if (kind === "location") {
    const id = randomUUID();
    await prisma.constructionProjectsLocation.create({
      data: { ...base, id, name: "Chainage 0+000 – 2+500" },
    });
    return id;
  }
  const phaseId = randomUUID();
  await prisma.constructionProjectsPhase.create({
    data: { ...base, id: phaseId, name: "Phase 1" },
  });
  const id = randomUUID();
  await prisma.constructionProjectsWing.create({
    data: {
      ...base,
      id,
      phaseId,
      wingType: "residential",
      name: "A Wing",
      config: {},
    },
  });
  return id;
}

describe("Project home HTTP (CM-411)", () => {
  it("is 401 without a Session", async () => {
    const id = randomUUID();
    expect(
      (await getHome(new Request(`${BASE}/${id}/home`), params(id))).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
    expect(
      (
        await updateTileOrder(
          new Request(TILE_ORDER, { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("shows the Owner every module of the Project's structure, in the default order", async () => {
    const owner = await ownerWithCompany();
    const tower = await create(owner.cookie, { name: "Kumari Heights" });
    const road = await create(owner.cookie, {
      name: "Vadasery Road",
      projectType: "infrastructure",
    });

    const towerHome = await home(owner.cookie, tower);
    expect(keys(towerHome)).toEqual(
      PROJECT_MODULE_KEYS.filter((key) => key !== "locations"),
    );
    expect(towerHome).toMatchObject({ pinned: false, canHideModules: true });
    expect(towerHome.modules[0]).toEqual({
      key: "dashboard",
      label: "Dashboard",
      description: expect.any(String) as string,
      segment: "dashboard",
      hidden: false,
    });
    const roadKeys = keys(await home(owner.cookie, road));
    expect(roadKeys).toContain("locations");
    expect(roadKeys).not.toContain("wings");

    // Rows of the other structure bring its module back.
    await addStructure(owner.workspaceId, road, "wing");
    expect(keys(await home(owner.cookie, road))).toContain("wings");
    await addStructure(owner.workspaceId, tower, "location");
    expect(keys(await home(owner.cookie, tower))).toContain("locations");
  });

  it("shows a Member the modules they may read on Projects they are on", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const zen = await create(owner.cookie, { name: "Zen Villas" });
    const member = await memberWith(owner, {
      "projects.project": ["read"],
      "labour.attendance": ["read"],
      "projects.drawings": ["read"],
    });
    await putOn(member.memberId, [kumari]);

    const seen = await home(member.cookie, kumari);
    expect(keys(seen)).toEqual([
      "amenities",
      "drawings",
      "documents",
      "resources",
      "attendance",
      "payments",
    ]);
    expect(seen.canHideModules).toBe(false);
    const notOn = await getHome(
      jsonRequest(`${BASE}/${zen}/home`, member.cookie),
      params(zen),
    );
    expect(notOn.status).toBe(StatusCodes.NOT_FOUND);

    const other = await ownerWithCompany("Sri Balaji Developers");
    const foreign = await getHome(
      jsonRequest(`${BASE}/${kumari}/home`, other.cookie),
      params(kumari),
    );
    expect(foreign.status).toBe(StatusCodes.NOT_FOUND);

    const outsider = await memberWith(owner, {});
    await putOn(outsider.memberId, [kumari]);
    const forbidden = await getHome(
      jsonRequest(`${BASE}/${kumari}/home`, outsider.cookie),
      params(kumari),
    );
    expect(forbidden.status).toBe(StatusCodes.FORBIDDEN);
  });

  it("hides modules on the Project for everyone, with the Project's Update flag", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const zen = await create(owner.cookie, { name: "Zen Villas" });
    const reader = await memberWith(owner, {
      "projects.project": ["read"],
      "projects.gallery": ["read"],
    });
    const editor = await memberWith(owner, {
      "projects.project": ["read", "update"],
      "projects.gallery": ["read"],
    });
    await putOn(reader.memberId, [kumari, zen]);
    await putOn(editor.memberId, [kumari]);

    const saved = await hide(editor.cookie, kumari, [
      "gallery",
      "reports",
      "gallery",
    ]);
    expect(saved.status).toBe(StatusCodes.OK);
    const editorHome = await json<Home>(saved);
    expect(editorHome.canHideModules).toBe(true);
    expect(
      editorHome.modules
        .filter((module) => module.hidden)
        .map((module) => module.key),
    ).toEqual(["gallery"]);

    // Everyone else on the Project loses the tile; other Projects keep it.
    expect(keys(await home(reader.cookie, kumari))).not.toContain("gallery");
    expect(keys(await home(reader.cookie, zen))).toContain("gallery");
    const ownerHome = await home(owner.cookie, kumari);
    expect(
      ownerHome.modules
        .filter((module) => module.hidden)
        .map((module) => module.key),
    ).toEqual(["gallery", "reports"]);

    const unknown = await hide(owner.cookie, kumari, ["gallery", "chat"]);
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(unknown)).toMatchObject({
      code: "PROJECT_MODULE_UNKNOWN",
      details: { keys: ["chat"] },
    });
    expect((await hide(reader.cookie, kumari, [])).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await hide(editor.cookie, zen, [])).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    // Show again.
    await hide(owner.cookie, kumari, []);
    expect(keys(await home(reader.cookie, kumari))).toContain("gallery");

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: {
        workspaceId: owner.workspaceId,
        entityId: kumari,
        action: "project.modules_hidden",
      },
    });
    expect(audit).toHaveLength(2);
  });

  it("keeps each member's tile order for every Project", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const zen = await create(owner.cookie, { name: "Zen Villas" });
    const member = await memberWith(owner, {
      "projects.project": ["read"],
      "projects.drawings": ["read"],
    });
    await putOn(member.memberId, [kumari, zen]);

    const saved = await tileOrder(member.cookie, [
      "documents",
      "gallery",
      "drawings",
    ]);
    expect(saved.status).toBe(StatusCodes.OK);
    expect(await json(saved)).toEqual({
      tileOrder: ["documents", "gallery", "drawings"],
    });
    for (const id of [kumari, zen])
      expect(keys(await home(member.cookie, id))).toEqual([
        "documents",
        "drawings",
        "amenities",
        "resources",
      ]);
    // Not the Owner's.
    expect(keys(await home(owner.cookie, kumari))[0]).toBe("dashboard");

    const unknown = await tileOrder(member.cookie, ["documents", "chat"]);
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(unknown)).toMatchObject({
      code: "PROJECT_MODULE_UNKNOWN",
    });
    expect(
      (await updateTileOrder(jsonRequest(TILE_ORDER, member.cookie, {})))
        .status,
    ).toBe(StatusCodes.BAD_REQUEST);

    // Any Team Member may arrange their own tiles; an empty list resets.
    const nobody = await memberWith(owner, {});
    expect((await tileOrder(nobody.cookie, ["reports"])).status).toBe(
      StatusCodes.OK,
    );
    await tileOrder(member.cookie, []);
    expect(keys(await home(member.cookie, kumari))[0]).toBe("amenities");
  });

  it("pins per member, pinned Projects first", async () => {
    const owner = await ownerWithCompany();
    const asaripallam = await create(owner.cookie, { name: "Asaripallam" });
    const kumari = await create(owner.cookie, { name: "Kumari Heights" });
    const zen = await create(owner.cookie, {
      name: "Zen Villas",
      status: "completed",
    });
    const member = await memberWith(owner, { "projects.project": ["read"] });
    await putOn(member.memberId, [kumari, zen]);

    const pinned = await pin(member.cookie, zen);
    expect(pinned.status).toBe(StatusCodes.OK);
    expect(await json(pinned)).toEqual({ pinned: true });
    expect((await pin(member.cookie, zen)).status).toBe(StatusCodes.OK);

    const theirs = await list(member.cookie);
    expect(theirs.items.map((item) => [item.name, item.pinned])).toEqual([
      ["Zen Villas", true],
      ["Kumari Heights", false],
    ]);
    expect((await home(member.cookie, zen)).pinned).toBe(true);
    // The Owner's list is untouched.
    expect((await list(owner.cookie)).items.map((item) => item.name)).toEqual([
      "Asaripallam",
      "Kumari Heights",
      "Zen Villas",
    ]);

    // Pinned first, then status and name as before.
    await pin(owner.cookie, zen);
    await pin(owner.cookie, kumari);
    expect((await list(owner.cookie)).items.map((item) => item.name)).toEqual([
      "Kumari Heights",
      "Zen Villas",
      "Asaripallam",
    ]);

    expect((await pin(member.cookie, asaripallam)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    const other = await ownerWithCompany("Sri Balaji Developers");
    expect((await pin(other.cookie, kumari)).status).toBe(
      StatusCodes.NOT_FOUND,
    );

    const unpinned = await pin(member.cookie, zen, false);
    expect(await json(unpinned)).toEqual({ pinned: false });
    expect((await pin(member.cookie, zen, false)).status).toBe(StatusCodes.OK);
    expect(
      (await list(member.cookie)).items.every((item) => !item.pinned),
    ).toBe(true);

    const audit = await prisma.constructionOrganizationAuditEvent.findMany({
      where: { workspaceId: owner.workspaceId, entityId: zen },
      select: { action: true },
    });
    expect(
      audit.filter((event) => event.action.endsWith("pinned")),
    ).toHaveLength(3);
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    for (const path of [
      "/api/construction/projects/projects/{id}/home",
      "/api/construction/projects/projects/{id}/hidden-modules/update",
      "/api/construction/projects/projects/{id}/pin",
      "/api/construction/projects/projects/{id}/unpin",
      "/api/construction/projects/tile-order/update",
    ])
      expect(spec.paths[path]).toBeDefined();
  });
});
