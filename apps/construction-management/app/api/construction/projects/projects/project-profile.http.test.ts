import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { newId } from "@/src/shared-kernel/ids";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { bytesOf, gifBytes, pngBytes } from "@/test/files";
import { TEST_ORIGIN } from "@/test/sessions";

import { POST as deleteProject } from "./[id]/delete/route";
import { POST as removeLogo } from "./[id]/logo/remove/route";
import { GET as getLogo, POST as uploadLogo } from "./[id]/logo/route";
import { GET as getProject } from "./[id]/route";
import { POST as updateProject } from "./[id]/update/route";
import { GET as listProjects, POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;

type Project = {
  id: string;
  name: string;
  status: string;
  projectType: string | null;
  structure: "wings" | "locations";
  budgetValue: number | null;
  orderValue: number | null;
  logoUrl: string | null;
  useLogoInReports: boolean;
  updatedAt: string;
};

type ErrorBody = { code: string; details?: unknown };

/** ₹3,20,00,000 in paise. */
const BUDGET = 3_20_00_000_00;

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function create(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Project> {
  const response = await createProject(jsonRequest(BASE, cookie, body));
  expect(response.status).toBe(StatusCodes.CREATED);
  return json<Project>(response);
}

async function read(cookie: string, id: string): Promise<Project> {
  const response = await getProject(
    jsonRequest(`${BASE}/${id}`, cookie),
    params(id),
  );
  expect(response.status).toBe(StatusCodes.OK);
  return json<Project>(response);
}

function update(
  cookie: string,
  project: Project,
  body: Record<string, unknown>,
): Promise<Response> {
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

function logoRequest(
  id: string,
  cookie: string,
  bytes: Uint8Array<ArrayBuffer>,
  contentType: string,
): Request {
  return new Request(`${BASE}/${id}/logo`, {
    method: "POST",
    headers: { "content-type": contentType, cookie },
    body: bytes,
  });
}

const upload = (
  id: string,
  cookie: string,
  bytes: Uint8Array<ArrayBuffer> = pngBytes(),
  contentType = "image/png",
) => uploadLogo(logoRequest(id, cookie, bytes, contentType), params(id));

const serve = (id: string, cookie: string) =>
  getLogo(jsonRequest(`${BASE}/${id}/logo`, cookie), params(id));

const remove = (id: string, cookie: string) =>
  removeLogo(jsonRequest(`${BASE}/${id}/logo/remove`, cookie, {}), params(id));

async function assign(memberId: string, projectIds: string[]): Promise<void> {
  await prisma.constructionOrganizationTeamMemberProject.createMany({
    data: projectIds.map((projectId) => ({ memberId, projectId })),
  });
}

describe("Project Type, Budget and seeds HTTP (CM-401)", () => {
  it("needs a Project Type on Add Project and keeps it when an edit leaves it out", async () => {
    const owner = await ownerWithCompany();
    const attempt = async (body: Record<string, unknown>) => {
      const response = await createProject(
        jsonRequest(BASE, owner.cookie, { name: "Kumari Heights", ...body }),
      );
      return { status: response.status, body: await json<ErrorBody>(response) };
    };
    expect(await attempt({})).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_TYPE_REQUIRED" },
    });
    expect(await attempt({ projectType: null })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "PROJECT_TYPE_REQUIRED" },
    });
    expect(await attempt({ projectType: "tower" })).toMatchObject({
      status: StatusCodes.BAD_REQUEST,
      body: { code: "VALIDATION_ERROR" },
    });
    expect(
      await prisma.constructionProjectsProject.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);

    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      projectType: "infrastructure",
    });
    expect(kumari).toMatchObject({
      projectType: "infrastructure",
      structure: "locations",
      budgetValue: null,
      logoUrl: null,
      useLogoInReports: false,
    });

    const edited = await update(owner.cookie, kumari, {
      status: "on_hold",
      useLogoInReports: true,
    });
    expect(edited.status).toBe(StatusCodes.OK);
    const afterEdit = await json<Project>(edited);
    expect(afterEdit).toMatchObject({
      projectType: "infrastructure",
      useLogoInReports: true,
    });

    const cleared = await update(owner.cookie, afterEdit, {
      projectType: null,
    });
    expect(cleared.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(cleared)).toMatchObject({
      code: "PROJECT_TYPE_REQUIRED",
    });

    const retyped = await json<Project>(
      await update(owner.cookie, afterEdit, { projectType: "residential" }),
    );
    expect(retyped).toMatchObject({
      projectType: "residential",
      structure: "wings",
      useLogoInReports: true,
    });
  });

  it("shows a Project from before M4 without a type, as Wings", async () => {
    const owner = await ownerWithCompany();
    const id = newId();
    await prisma.constructionProjectsProject.create({
      data: {
        id,
        workspaceId: owner.workspaceId,
        name: "Old Site",
        createdBy: owner.userId,
        updatedBy: owner.userId,
      },
    });
    const old = await read(owner.cookie, id);
    expect(old).toMatchObject({ projectType: null, structure: "wings" });
    // An edit without a type keeps none.
    const edited = await update(owner.cookie, old, { status: "completed" });
    expect(edited.status).toBe(StatusCodes.OK);
    expect(await json(edited)).toMatchObject({
      projectType: null,
      status: "completed",
    });
  });

  it("creates the seed drawing albums and testing items with the Project", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      projectType: "residential",
    });
    const albums = await prisma.constructionProjectsDrawingAlbum.findMany({
      where: { projectId: kumari.id },
      orderBy: { name: "asc" },
    });
    expect(
      albums.map(({ name, isSeed, workspaceId, createdBy, deletedAt }) => ({
        name,
        isSeed,
        workspaceId,
        createdBy,
        deletedAt,
      })),
    ).toEqual(
      ["Architect", "Electrical", "Plumbing", "Structural Drawing"].map(
        (name) => ({
          name,
          isSeed: true,
          workspaceId: owner.workspaceId,
          createdBy: owner.userId,
          deletedAt: null,
        }),
      ),
    );
    const items = await prisma.constructionProjectsTestingItem.findMany({
      where: { projectId: kumari.id },
      orderBy: { name: "asc" },
    });
    expect(items.map(({ name, isSeed }) => ({ name, isSeed }))).toEqual(
      ["Bricks", "Cement", "Rcc cube", "Steel"].map((name) => ({
        name,
        isSeed: true,
      })),
    );

    // A refused Project leaves no seeds behind.
    const clash = await createProject(
      jsonRequest(BASE, owner.cookie, {
        name: "kumari heights",
        projectType: "residential",
      }),
    );
    expect(clash.status).toBe(StatusCodes.CONFLICT);
    expect(
      await prisma.constructionProjectsDrawingAlbum.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(4);
  });

  it("hides and keeps the budget for a Member without Financial", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      projectType: "residential",
      budgetValue: BUDGET,
    });
    expect(kumari.budgetValue).toBe(BUDGET);
    const engineer = await memberWith(owner, {
      "projects.project": ["create", "read", "update"],
    });
    const accountant = await memberWith(owner, {
      "projects.project": ["read", "update", "financial"],
    });
    await assign(engineer.memberId, [kumari.id]);
    await assign(accountant.memberId, [kumari.id]);

    const seen = await read(engineer.cookie, kumari.id);
    expect(seen.budgetValue).toBeNull();
    const listed = await json<{ items: Project[]; financial: boolean }>(
      await listProjects(jsonRequest(BASE, engineer.cookie)),
    );
    expect(listed.financial).toBe(false);
    expect(listed.items[0]?.budgetValue).toBeNull();
    const ownerList = await json<{ financial: boolean }>(
      await listProjects(jsonRequest(BASE, owner.cookie)),
    );
    expect(ownerList.financial).toBe(true);
    expect((await read(accountant.cookie, kumari.id)).budgetValue).toBe(BUDGET);

    // The engineer's edit can neither change nor clear it.
    const changed = await update(engineer.cookie, seen, { budgetValue: 1 });
    expect(changed.status).toBe(StatusCodes.OK);
    const afterChange = await json<Project>(changed);
    expect(afterChange.budgetValue).toBeNull();
    await update(engineer.cookie, afterChange, { budgetValue: null });
    expect((await read(owner.cookie, kumari.id)).budgetValue).toBe(BUDGET);

    // Nor set it on a Project they add.
    const added = await create(engineer.cookie, {
      name: "Asaripallam Tower",
      projectType: "commercial",
      budgetValue: BUDGET,
    });
    const row = await prisma.constructionProjectsProject.findUnique({
      where: { id: added.id },
    });
    expect(row?.budgetValue).toBeNull();

    // The accountant can, and a bad amount is refused.
    const current = await read(accountant.cookie, kumari.id);
    const bad = await update(accountant.cookie, current, { budgetValue: -1 });
    expect(bad.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(bad)).toMatchObject({ code: "PROJECT_BUDGET_INVALID" });
    const revised = await update(accountant.cookie, current, {
      budgetValue: 4_00_00_000_00,
    });
    expect((await json<Project>(revised)).budgetValue).toBe(4_00_00_000_00);
    const audit = await prisma.constructionOrganizationAuditEvent.findFirst({
      where: { entityId: kumari.id, action: "project.updated" },
      orderBy: { occurredAt: "desc" },
    });
    expect(audit?.before).toMatchObject({ budgetValue: BUDGET });
    expect(audit?.after).toMatchObject({ budgetValue: 4_00_00_000_00 });
  });

  it("refuses to delete a Project with Wings, Locations, drawings or testing reports, not seeds alone", async () => {
    const owner = await ownerWithCompany();
    const attempt = async (id: string) =>
      deleteProject(
        jsonRequest(`${BASE}/${id}/delete`, owner.cookie, {}),
        params(id),
      );
    const stamps = {
      workspaceId: owner.workspaceId,
      createdBy: owner.userId,
      updatedBy: owner.userId,
    };
    const blockers: [string, (projectId: string) => Promise<unknown>][] = [
      [
        "a Wing",
        async (projectId) => {
          const phaseId = newId();
          await prisma.constructionProjectsPhase.create({
            data: {
              id: phaseId,
              projectId,
              name: "Phase 1",
              position: 0,
              ...stamps,
            },
          });
          await prisma.constructionProjectsWing.create({
            data: {
              id: newId(),
              projectId,
              phaseId,
              wingType: "residential",
              name: "A",
              config: {},
              position: 0,
              ...stamps,
            },
          });
        },
      ],
      [
        "a Location",
        (projectId) =>
          prisma.constructionProjectsLocation.create({
            data: {
              id: newId(),
              projectId,
              name: "Culvert C3",
              position: 0,
              ...stamps,
            },
          }),
      ],
      [
        "a drawing",
        async (projectId) => {
          const album =
            await prisma.constructionProjectsDrawingAlbum.findFirstOrThrow({
              where: { projectId },
            });
          await prisma.constructionProjectsDrawing.create({
            data: {
              id: newId(),
              projectId,
              albumId: album.id,
              name: "Ground floor plan",
              ...stamps,
            },
          });
        },
      ],
      [
        "a testing report",
        async (projectId) => {
          const item =
            await prisma.constructionProjectsTestingItem.findFirstOrThrow({
              where: { projectId },
            });
          await prisma.constructionProjectsTestingReport.create({
            data: {
              id: newId(),
              projectId,
              itemId: item.id,
              name: "Cube test 7 days",
              reportDate: new Date("2026-10-01"),
              fileKey: `companies/${owner.workspaceId}/testing/${newId()}.pdf`,
              fileName: "cube.pdf",
              contentType: "application/pdf",
              bytes: 100,
              ...stamps,
            },
          });
        },
      ],
    ];
    for (const [what, add] of blockers) {
      const project = await create(owner.cookie, {
        name: `With ${what}`,
        projectType: "residential",
      });
      await add(project.id);
      const refused = await attempt(project.id);
      expect(refused.status, what).toBe(StatusCodes.CONFLICT);
      const body = await json<ErrorBody & { message: string }>(refused);
      expect(body.code).toBe("PROJECT_IN_USE");
      expect(body.message).toContain(
        "Wings, Locations, drawings or testing reports",
      );
    }

    // The seed albums and testing items alone do not stop a delete.
    const empty = await create(owner.cookie, {
      name: "Seeds only",
      projectType: "residential",
    });
    expect((await attempt(empty.id)).status).toBe(StatusCodes.NO_CONTENT);
  });
});

describe("Project logo HTTP (CM-401)", () => {
  it("uploads, streams, replaces and removes the logo, recording storage", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      projectType: "residential",
    });
    const first = pngBytes(200);
    const uploaded = await upload(kumari.id, owner.cookie, first);
    expect(uploaded.status).toBe(StatusCodes.OK);
    const withLogo = await json<Project>(uploaded);
    expect(withLogo.logoUrl).toMatch(
      new RegExp(
        `^/api/construction/projects/projects/${kumari.id}/logo\\?v=[0-9a-f-]{36}$`,
      ),
    );
    expect((await read(owner.cookie, kumari.id)).logoUrl).toBe(
      withLogo.logoUrl,
    );
    const listed = await json<{ items: Project[] }>(
      await listProjects(jsonRequest(BASE, owner.cookie)),
    );
    expect(listed.items[0]?.logoUrl).toBe(withLogo.logoUrl);

    // A Member on the Project with Read sees it.
    const viewer = await memberWith(owner, { "projects.project": ["read"] });
    await assign(viewer.memberId, [kumari.id]);
    const streamed = await serve(kumari.id, viewer.cookie);
    expect(streamed.status).toBe(StatusCodes.OK);
    expect(streamed.headers.get("content-type")).toBe("image/png");
    expect(streamed.headers.get("cache-control")).toContain("private");
    expect(await bytesOf(streamed)).toEqual(first);
    // ... but cannot change it.
    expect((await upload(kumari.id, viewer.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await remove(kumari.id, viewer.cookie)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const replaced = await json<Project>(
      await upload(kumari.id, owner.cookie, pngBytes(300)),
    );
    expect(replaced.logoUrl).not.toBe(withLogo.logoUrl);
    const files = await prisma.constructionOrganizationStoredFile.findMany({
      where: { workspaceId: owner.workspaceId },
      orderBy: { createdAt: "asc" },
    });
    expect(files).toEqual([
      expect.objectContaining({
        kind: "project_logo",
        bytes: 200,
        deletedAt: expect.any(Date) as unknown,
      }),
      expect.objectContaining({
        kind: "project_logo",
        bytes: 300,
        contentType: "image/png",
        createdBy: owner.userId,
        deletedAt: null,
      }),
    ]);
    expect(files[1]?.key).toMatch(
      new RegExp(
        `^companies/${owner.workspaceId}/project-logos/${kumari.id}/[0-9a-f-]{36}\\.png$`,
      ),
    );

    const removed = await remove(kumari.id, owner.cookie);
    expect(removed.status).toBe(StatusCodes.OK);
    expect(await json(removed)).toMatchObject({ logoUrl: null });
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: { workspaceId: owner.workspaceId, deletedAt: null },
      }),
    ).toBe(0);
    const gone = await serve(kumari.id, owner.cookie);
    expect(gone.status).toBe(StatusCodes.NOT_FOUND);
    expect(await json(gone)).toMatchObject({ code: "PROJECT_LOGO_NOT_FOUND" });
    // Removing again is fine.
    expect((await remove(kumari.id, owner.cookie)).status).toBe(StatusCodes.OK);
    expect(
      await prisma.constructionOrganizationAuditEvent.count({
        where: {
          entityId: kumari.id,
          action: { in: ["project.logo_changed", "project.logo_removed"] },
        },
      }),
    ).toBe(3);
  });

  it("refuses a logo over 2 MB and a file that is not PNG, JPEG or WebP", async () => {
    const owner = await ownerWithCompany();
    const kumari = await create(owner.cookie, {
      name: "Kumari Heights",
      projectType: "residential",
    });
    const tooLarge = await upload(
      kumari.id,
      owner.cookie,
      pngBytes(2 * 1024 * 1024 + 1),
    );
    expect(tooLarge.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(tooLarge)).toMatchObject({
      code: "FILE_TOO_LARGE",
      details: { maxBytes: 2 * 1024 * 1024 },
    });
    const gif = await upload(kumari.id, owner.cookie, gifBytes(), "image/gif");
    expect(gif.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(gif)).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    // A PNG that says it is a JPEG is refused too.
    const lying = await upload(
      kumari.id,
      owner.cookie,
      pngBytes(),
      "image/jpeg",
    );
    expect(lying.status).toBe(StatusCodes.BAD_REQUEST);
    expect(
      await prisma.constructionOrganizationStoredFile.count({
        where: { workspaceId: owner.workspaceId },
      }),
    ).toBe(0);
  });

  it("is 404 for another Company's Project and a Project the Member is not on", async () => {
    const mine = await ownerWithCompany();
    const kumari = await create(mine.cookie, {
      name: "Kumari Heights",
      projectType: "residential",
    });
    await upload(kumari.id, mine.cookie);
    const theirs = await ownerWithCompany("Sakthi Constructions");
    for (const response of [
      await serve(kumari.id, theirs.cookie),
      await upload(kumari.id, theirs.cookie),
      await remove(kumari.id, theirs.cookie),
      await getProject(
        jsonRequest(`${BASE}/${kumari.id}`, theirs.cookie),
        params(kumari.id),
      ),
    ])
      expect(response.status).toBe(StatusCodes.NOT_FOUND);

    const stranger = await memberWith(mine, {
      "projects.project": ["read", "update"],
    });
    expect((await serve(kumari.id, stranger.cookie)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    expect((await upload(kumari.id, stranger.cookie)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    // The logo is still there.
    expect((await read(mine.cookie, kumari.id)).logoUrl).not.toBeNull();
  });

  it("is 401 without a Session", async () => {
    const id = newId();
    expect(
      (await getLogo(new Request(`${BASE}/${id}/logo`), params(id))).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });
});
