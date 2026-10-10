import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { GET as getOpenApi } from "@/app/api/openapi.json/route";
import { DASHBOARD_SECTION_KEYS } from "@/src/projects/domain/dashboard-sections";
import { jsonRequest, memberWith, ownerWithCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as getLayout } from "../dashboard-layout/route";
import { POST as updateLayout } from "../dashboard-layout/update/route";
import { GET as getSummary } from "./[id]/dashboard/summary/route";
import { POST as createProject } from "./route";

const BASE = `${TEST_ORIGIN}/api/construction/projects/projects`;
const LAYOUT = `${TEST_ORIGIN}/api/construction/projects/dashboard-layout`;

type Layout = {
  sections: {
    key: string;
    label: string;
    milestone: string | null;
    visible: boolean;
  }[];
};

type Summary = {
  project: {
    id: string;
    name: string;
    status: string;
    projectType: string | null;
    structure: string;
    startDate: string | null;
    endDate: string | null;
    budgetValue: number | null;
  };
  counts: {
    wings: number;
    floors: number;
    units: number;
    locations: number;
    drawings: number;
    testingReports: number;
    documents: number;
  };
  financial: boolean;
};

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function layout(cookie: string): Promise<Layout> {
  const response = await getLayout(jsonRequest(LAYOUT, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return json<Layout>(response);
}

function save(cookie: string, sections: { key: string; visible: boolean }[]) {
  return updateLayout(jsonRequest(`${LAYOUT}/update`, cookie, { sections }));
}

function summary(cookie: string, id: string) {
  return getSummary(
    jsonRequest(`${BASE}/${id}/dashboard/summary`, cookie),
    params(id),
  );
}

/** Wings, Floors, Units, a Location, a drawing, a report and documents. */
async function addRows(workspaceId: string, projectId: string): Promise<void> {
  const by = { createdBy: "test", updatedBy: "test" };
  const phaseId = randomUUID();
  await prisma.constructionProjectsPhase.create({
    data: {
      id: phaseId,
      workspaceId,
      projectId,
      name: "Phase 1",
      position: 0,
      ...by,
    },
  });
  const wing = async (name: string, deleted = false) => {
    const id = randomUUID();
    await prisma.constructionProjectsWing.create({
      data: {
        id,
        workspaceId,
        projectId,
        phaseId,
        wingType: "residential",
        name,
        config: {},
        position: 0,
        deletedAt: deleted ? new Date() : null,
        ...by,
      },
    });
    return id;
  };
  const floor = async (wingId: string, level: number, deleted = false) => {
    const id = randomUUID();
    await prisma.constructionProjectsFloor.create({
      data: {
        id,
        workspaceId,
        wingId,
        kind: level === 0 ? "ground" : "typed",
        name: `Floor ${String(level)}`,
        level,
        deletedAt: deleted ? new Date() : null,
      },
    });
    return id;
  };
  const unit = (
    wingId: string,
    floorId: string,
    name: string,
    deleted = false,
  ) =>
    prisma.constructionProjectsUnit.create({
      data: {
        id: randomUUID(),
        workspaceId,
        wingId,
        floorId,
        name,
        position: 0,
        deletedAt: deleted ? new Date() : null,
      },
    });

  const a = await wing("A Wing");
  const ground = await floor(a, 0);
  const first = await floor(a, 1);
  const gone = await floor(a, 2, true);
  await unit(a, ground, "G01");
  await unit(a, first, "101");
  await unit(a, first, "102");
  await unit(a, first, "103", true);
  await unit(a, gone, "201");
  const removed = await wing("Old Wing", true);
  await unit(removed, await floor(removed, 0), "G01");

  await prisma.constructionProjectsLocation.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      name: "Main gate",
      position: 0,
      ...by,
    },
  });
  const album = await prisma.constructionProjectsDrawingAlbum.findFirstOrThrow({
    where: { projectId },
  });
  await prisma.constructionProjectsDrawing.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      albumId: album.id,
      name: "Ground floor plan",
      ...by,
    },
  });
  const item = await prisma.constructionProjectsTestingItem.findFirstOrThrow({
    where: { projectId },
  });
  await prisma.constructionProjectsTestingReport.create({
    data: {
      id: randomUUID(),
      workspaceId,
      projectId,
      itemId: item.id,
      name: "Cube test 7 days",
      reportDate: new Date("2026-10-01"),
      fileKey: `test/${randomUUID()}.pdf`,
      fileName: "cube.pdf",
      contentType: "application/pdf",
      bytes: 1000,
      ...by,
    },
  });
  for (const deleted of [false, false, true])
    await prisma.constructionProjectsDocument.create({
      data: {
        id: randomUUID(),
        workspaceId,
        projectId,
        kind: "other",
        fileKey: `test/${randomUUID()}.pdf`,
        fileName: "boq.pdf",
        contentType: "application/pdf",
        bytes: 1000,
        createdBy: "test",
        deletedAt: deleted ? new Date() : null,
      },
    });
}

describe("Project Dashboard HTTP (CM-412)", () => {
  it("is 401 without a Session", async () => {
    expect((await getLayout(new Request(LAYOUT))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
    const id = randomUUID();
    expect(
      (
        await getSummary(
          new Request(`${BASE}/${id}/dashboard/summary`),
          params(id),
        )
      ).status,
    ).toBe(StatusCodes.UNAUTHORIZED);
  });

  it("keeps each member's layout: order, shown sections, defaults and validation", async () => {
    const owner = await ownerWithCompany();
    const initial = await layout(owner.cookie);
    expect(initial.sections.map((section) => section.key)).toEqual(
      DASHBOARD_SECTION_KEYS,
    );
    expect(initial.sections.every((section) => section.visible)).toBe(true);
    expect(initial.sections[0]).toEqual({
      key: "summary",
      label: "Project summary",
      milestone: null,
      visible: true,
    });
    // Materials has data since M5 (CM-510); Task still waits for M8.
    expect(
      initial.sections.find((section) => section.key === "materials"),
    ).toMatchObject({ milestone: null });
    expect(
      initial.sections.find((section) => section.key === "task"),
    ).toMatchObject({ milestone: "M8" });

    const saved = await save(owner.cookie, [
      { key: "attendance", visible: true },
      { key: "summary", visible: true },
      { key: "booking", visible: false },
    ]);
    expect(saved.status).toBe(StatusCodes.OK);
    const after = await layout(owner.cookie);
    expect(after.sections.slice(0, 4)).toMatchObject([
      { key: "attendance", visible: true },
      { key: "summary", visible: true },
      { key: "booking", visible: false },
      { key: "task", visible: true },
    ]);
    expect(after.sections).toHaveLength(DASHBOARD_SECTION_KEYS.length);
    expect(await json(saved)).toEqual(after);

    const unknown = await save(owner.cookie, [{ key: "chat", visible: true }]);
    expect(unknown.status).toBe(StatusCodes.BAD_REQUEST);
    expect(await json(unknown)).toMatchObject({
      code: "DASHBOARD_SECTION_UNKNOWN",
      details: { keys: ["chat"] },
    });
    const twice = await save(owner.cookie, [
      { key: "task", visible: true },
      { key: "task", visible: false },
    ]);
    expect(await json(twice)).toMatchObject({
      code: "DASHBOARD_SECTION_DUPLICATE",
    });
    const malformed = await updateLayout(
      jsonRequest(`${LAYOUT}/update`, owner.cookie, {
        sections: [{ key: "task" }],
      }),
    );
    expect(malformed.status).toBe(StatusCodes.BAD_REQUEST);

    // Another member has their own; the dashboard's Read flag is enough.
    const viewer = await memberWith(owner, {
      "reporting.project_dashboard": ["read"],
    });
    expect((await layout(viewer.cookie)).sections[0]?.key).toBe("summary");
    expect(
      (await save(viewer.cookie, [{ key: "inquiry", visible: false }])).status,
    ).toBe(StatusCodes.OK);
    expect((await layout(owner.cookie)).sections[0]?.key).toBe("attendance");

    const outsider = await memberWith(owner, { "projects.project": ["read"] });
    expect((await getLayout(jsonRequest(LAYOUT, outsider.cookie))).status).toBe(
      StatusCodes.FORBIDDEN,
    );
    expect((await save(outsider.cookie, [])).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    // An empty layout resets.
    await save(owner.cookie, []);
    expect(
      (await layout(owner.cookie)).sections.map((section) => section.key),
    ).toEqual(DASHBOARD_SECTION_KEYS);

    const audit = await prisma.constructionOrganizationAuditEvent.count({
      where: {
        workspaceId: owner.workspaceId,
        action: "member.dashboard_layout_changed",
      },
    });
    expect(audit).toBe(3);
  });

  it("summarises the Project: details, budget with Financial, live rows only", async () => {
    const owner = await ownerWithCompany();
    const created = await createProject(
      jsonRequest(BASE, owner.cookie, {
        name: "Kumari Heights",
        projectType: "residential",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        budgetValue: 4_20_00_000_00,
      }),
    );
    const { id } = await json<{ id: string }>(created);

    const empty = await json<Summary>(await summary(owner.cookie, id));
    expect(empty).toEqual({
      project: {
        id,
        name: "Kumari Heights",
        status: "ongoing",
        projectType: "residential",
        structure: "wings",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        budgetValue: 4_20_00_000_00,
      },
      counts: {
        wings: 0,
        floors: 0,
        units: 0,
        locations: 0,
        drawings: 0,
        testingReports: 0,
        documents: 0,
      },
      financial: true,
    });

    await addRows(owner.workspaceId, id);
    expect(
      (await json<Summary>(await summary(owner.cookie, id))).counts,
    ).toEqual({
      wings: 1,
      floors: 2,
      units: 3,
      locations: 1,
      drawings: 1,
      testingReports: 1,
      documents: 2,
    });

    // Without Financial the budget is null; a Member sees only their Projects.
    const viewer = await memberWith(owner, {
      "reporting.project_dashboard": ["read"],
    });
    expect((await summary(viewer.cookie, id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: viewer.memberId, projectId: id },
    });
    const seen = await json<Summary>(await summary(viewer.cookie, id));
    expect(seen.project.budgetValue).toBeNull();
    expect(seen.financial).toBe(false);
    expect(seen.counts.units).toBe(3);

    const outsider = await memberWith(owner, { "projects.project": ["read"] });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: outsider.memberId, projectId: id },
    });
    expect((await summary(outsider.cookie, id)).status).toBe(
      StatusCodes.FORBIDDEN,
    );

    const other = await ownerWithCompany("Sri Balaji Developers");
    expect((await summary(other.cookie, id)).status).toBe(
      StatusCodes.NOT_FOUND,
    );
  });

  it("is on /api/docs", async () => {
    const spec = await json<{ paths: Record<string, unknown> }>(getOpenApi());
    for (const path of [
      "/api/construction/projects/dashboard-layout",
      "/api/construction/projects/dashboard-layout/update",
      "/api/construction/projects/projects/{id}/dashboard/summary",
    ])
      expect(spec.paths[path]).toBeDefined();
  });
});
