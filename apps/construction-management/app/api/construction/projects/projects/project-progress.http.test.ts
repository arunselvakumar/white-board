import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as recordProgress } from "@/app/api/construction/tracking/tasks/[id]/progress/route";
import { POST as createTask } from "@/app/api/construction/tracking/tasks/route";
import { addDays, todayIn } from "@/src/shared-kernel/calendar-date";
import { actAs, addMember, addProject, newCompany } from "@/test/companies";
import { TEST_ORIGIN } from "@/test/sessions";

import { GET as one } from "./[id]/progress/route";
import type {
  ConstructionProjectsProjectProgressResponseModel,
  ListConstructionProjectsProjectsResponseModel,
} from "./list-projects-models";
import { GET as list } from "./route";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const TODAY = todayIn("Asia/Kolkata");
const TASKS = `${TEST_ORIGIN}/api/construction/tracking/tasks`;

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function task(projectId: string, body: Record<string, unknown>) {
  const response = await createTask(post(TASKS, { projectId, ...body }));
  expect(response.status).toBe(StatusCodes.CREATED);
  return ((await response.json()) as { id: string }).id;
}

async function progressOf(projectId: string) {
  const response = await list(
    new Request(`${TEST_ORIGIN}/api/construction/projects/projects`),
  );
  expect(response.status).toBe(StatusCodes.OK);
  const body =
    (await response.json()) as ListConstructionProjectsProjectsResponseModel;
  return body.items.find((item) => item.id === projectId)?.progress;
}

describe("Project card progress (CM-805)", () => {
  it("is Project Progress % over live leaf tasks, by price or by duration, and null without tasks", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    actAs({ userId: by, workspaceId: ws, role: "owner" });
    const tower = await addProject(ws, by, "Tower A");
    const bare = await addProject(ws, by, "Bare plot");

    expect(await progressOf(tower)).toBeNull();

    const summary = await task(tower, { name: "Structure" });
    const slab = await task(tower, {
      name: "Slab",
      parentId: summary,
      totalPrice: 300_000_00,
    });
    await task(tower, {
      name: "Columns",
      parentId: summary,
      totalPrice: 100_000_00,
    });
    const recorded = await recordProgress(
      post(`${TASKS}/${slab}/progress`, {
        progressDate: TODAY,
        progressPct: 40,
      }),
      { params: Promise.resolve({ id: slab }) },
    );
    expect(recorded.status).toBe(StatusCodes.CREATED);
    // 3,00,000 × 40 % ÷ 4,00,000: the summary itself does not weigh.
    expect(await progressOf(tower)).toEqual({ pct: 30, weighting: "price" });

    // An unpriced leaf switches the Project to duration weighting.
    const late = await task(tower, {
      name: "Waterproofing",
      startDate: addDays(TODAY, -3),
      dueDate: TODAY,
    });
    // Slab and Columns weigh 1 day each (no dates), Waterproofing 4.
    expect(await progressOf(tower)).toEqual({
      pct: 6.67,
      weighting: "duration",
    });

    // A deleted task no longer counts.
    await prisma.constructionTrackingTask.update({
      where: { id: late },
      data: { deletedAt: new Date(), deletedBy: by },
    });
    expect(await progressOf(tower)).toEqual({ pct: 30, weighting: "price" });
    expect(await progressOf(bare)).toBeNull();

    // The Project home reads the same figure for one Project.
    const home = async (projectId: string) => {
      const response = await one(
        new Request(
          `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/progress`,
        ),
        { params: Promise.resolve({ id: projectId }) },
      );
      return {
        status: response.status,
        body: (await response.json()) as ConstructionProjectsProjectProgressResponseModel,
      };
    };
    expect(await home(tower)).toEqual({
      status: StatusCodes.OK,
      body: { progress: { pct: 30, weighting: "price" } },
    });
    expect(await home(bare)).toEqual({
      status: StatusCodes.OK,
      body: { progress: null },
    });
    const elsewhere = await newCompany();
    const foreign = await addProject(
      elsewhere.workspaceId,
      elsewhere.ownerId,
      "Other Company",
    );
    expect((await home(foreign)).status).toBe(StatusCodes.NOT_FOUND);
  });

  it("guards one Project's progress like the Project: Read, assignment, a valid id", async () => {
    const company = await newCompany();
    const ws = company.workspaceId;
    const by = company.ownerId;
    const tower = await addProject(ws, by, "Tower A");
    const home = (projectId: string) =>
      one(
        new Request(
          `${TEST_ORIGIN}/api/construction/projects/projects/${projectId}/progress`,
        ),
        { params: Promise.resolve({ id: projectId }) },
      );

    actAs({ userId: by, workspaceId: ws, role: "owner" });
    expect((await home("not-a-uuid")).status).toBe(StatusCodes.BAD_REQUEST);

    // A Member with Project read sees only the Projects they are on.
    const viewer = await addMember(ws, by, { "projects.project": ["read"] });
    actAs({ userId: viewer.userId, workspaceId: ws, role: "member" });
    expect((await home(tower)).status).toBe(StatusCodes.NOT_FOUND);
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: viewer.memberId, projectId: tower },
    });
    expect((await home(tower)).status).toBe(StatusCodes.OK);

    // On the Project but without Project read: refused.
    const outsider = await addMember(ws, by, { "labour.attendance": ["read"] });
    await prisma.constructionOrganizationTeamMemberProject.create({
      data: { memberId: outsider.memberId, projectId: tower },
    });
    actAs({ userId: outsider.userId, workspaceId: ws, role: "member" });
    expect((await home(tower)).status).toBe(StatusCodes.FORBIDDEN);
  });
});
