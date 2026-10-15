import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it, vi } from "vitest";

import { POST as deleteContractor } from "@/app/api/construction/masters/contractors/[id]/delete/route";
import { POST as deleteDepartment } from "@/app/api/construction/masters/departments/[id]/delete/route";
import { POST as deleteUnit } from "@/app/api/construction/masters/measurement-units/[id]/delete/route";
import { POST as deleteDrawing } from "@/app/api/construction/projects/projects/[id]/drawings/[drawingId]/delete/route";
import { POST as deleteLocation } from "@/app/api/construction/projects/projects/[id]/locations/[locationId]/delete/route";
import { PrismaStructureUsage } from "@/src/composition/structure-usage";
import { actAs, addProject, newCompany } from "@/test/companies";
import { addContractor } from "@/test/procurement";
import { worksheetDepartment, worksheetLocation } from "@/test/site-work";
import {
  trackingDrawing,
  trackingInspectionRow,
  trackingIssueRow,
  trackingTaskRow,
} from "@/test/tracking";

vi.mock(import("@repo/auth/construction/server"), async (importOriginal) => ({
  ...(await importOriginal()),
  getCompanyAuthFromHeaders: vi.fn(),
}));

const ORIGIN = "http://localhost";

const post = (url: string) =>
  new Request(`${ORIGIN}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

const byId = (id: string) => ({ params: Promise.resolve({ id }) });

async function codeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

async function setUp() {
  const company = await newCompany();
  const by = company.ownerId;
  const projectId = await addProject(company.workspaceId, by);
  actAs({ userId: by, workspaceId: company.workspaceId });
  return { workspaceId: company.workspaceId, by, projectId };
}

describe("Delete guards that grow with tracking (CM-801)", () => {
  it("keeps Wings, floors, units and Locations a live task, issue or inspection names", async () => {
    const { workspaceId, by, projectId } = await setUp();
    const usage = new PrismaStructureUsage(prisma);
    const wingA = randomUUID();
    const wingB = randomUUID();
    const wingC = randomUUID();
    const floor = randomUUID();
    const unit = randomUUID();
    const deletedFloor = randomUUID();
    const wing = (wingId: string, floorIds: string[] = []) => ({
      type: "wing" as const,
      wingId,
      floorIds,
      unitIds: [] as string[],
    });
    // A task's own location, a task's extra location, an issue, an inspection.
    await trackingTaskRow(workspaceId, projectId, by, {
      siteLocation: wing(wingA),
      extraLocations: [
        { type: "wing", wingId: wingA, floorIds: [floor], unitIds: [unit] },
      ],
    });
    await trackingIssueRow(workspaceId, projectId, by, {
      siteLocation: wing(wingB),
    });
    await trackingInspectionRow(workspaceId, projectId, by, {
      siteLocation: wing(wingC),
    });
    // Deleted rows do not count.
    await trackingTaskRow(workspaceId, projectId, by, {
      extraLocations: [wing(randomUUID(), [deletedFloor])],
      deleted: true,
    });

    for (const id of [wingA, wingB, wingC])
      expect(await usage.isWingUsed(workspaceId, id)).toBe(true);
    expect(await usage.isWingUsed(workspaceId, randomUUID())).toBe(false);
    expect(
      await usage.usedFloorsAndUnits(workspaceId, {
        floorIds: [floor, deletedFloor],
        unitIds: [unit],
      }),
    ).toEqual({ floorIds: [floor], unitIds: [unit] });

    const locationId = await worksheetLocation(workspaceId, by, projectId);
    await trackingIssueRow(workspaceId, projectId, by, {
      siteLocation: { type: "location", locationId },
    });
    const refused = await deleteLocation(
      post(
        `/api/construction/projects/projects/${projectId}/locations/${locationId}/delete`,
      ),
      { params: Promise.resolve({ id: projectId, locationId }) },
    );
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(refused)).toBe("LOCATION_IN_USE");
  });

  it("keeps Departments, Contractors and Measurement Units live tracking rows use", async () => {
    const { workspaceId, by, projectId } = await setUp();
    const onTask = await worksheetDepartment(workspaceId, by);
    const onInspection = await worksheetDepartment(workspaceId, by);
    const free = await worksheetDepartment(workspaceId, by);
    const contractor = await addContractor(workspaceId, by);
    const freeContractor = await addContractor(workspaceId, by);
    const unit = await prisma.constructionMastersMeasurementUnit.create({
      data: {
        id: randomUUID(),
        workspaceId,
        name: `Rmt ${randomUUID().slice(0, 6)}`,
        createdBy: by,
        updatedBy: by,
      },
    });
    await trackingTaskRow(workspaceId, projectId, by, {
      departmentId: onTask,
      unitId: unit.id,
    });
    await trackingInspectionRow(workspaceId, projectId, by, {
      departmentId: onInspection,
    });
    await trackingIssueRow(workspaceId, projectId, by, {
      contractorId: contractor,
    });

    for (const id of [onTask, onInspection]) {
      const refused = await deleteDepartment(
        post(`/api/construction/masters/departments/${id}/delete`),
        byId(id),
      );
      expect(refused.status).toBe(StatusCodes.CONFLICT);
      expect(await codeOf(refused)).toBe("DEPARTMENT_IN_USE");
    }
    expect(
      (
        await deleteDepartment(
          post(`/api/construction/masters/departments/${free}/delete`),
          byId(free),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);

    const contractorRefused = await deleteContractor(
      post(`/api/construction/masters/contractors/${contractor}/delete`),
      byId(contractor),
    );
    expect(contractorRefused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(contractorRefused)).toBe("CONTRACTOR_IN_USE");
    expect(
      (
        await deleteContractor(
          post(
            `/api/construction/masters/contractors/${freeContractor}/delete`,
          ),
          byId(freeContractor),
        )
      ).status,
    ).toBe(StatusCodes.NO_CONTENT);

    const unitRefused = await deleteUnit(
      post(`/api/construction/masters/measurement-units/${unit.id}/delete`),
      byId(unit.id),
    );
    expect(unitRefused.status).toBe(StatusCodes.CONFLICT);
    expect(await codeOf(unitRefused)).toBe("MEASUREMENT_UNIT_IN_USE");
  });

  it("refuses deleting a drawing a live inspection links (409 DRAWING_IN_USE)", async () => {
    const { workspaceId, by, projectId } = await setUp();
    const linked = await trackingDrawing(workspaceId, projectId, by);
    const onceLinked = await trackingDrawing(workspaceId, projectId, by);
    await trackingInspectionRow(workspaceId, projectId, by, {
      drawingIds: [linked],
    });
    await trackingInspectionRow(workspaceId, projectId, by, {
      drawingIds: [linked],
    });
    await trackingInspectionRow(workspaceId, projectId, by, {
      drawingIds: [onceLinked],
      deleted: true,
    });
    const url = (drawingId: string) =>
      `/api/construction/projects/projects/${projectId}/drawings/${drawingId}/delete`;
    const params = (drawingId: string) => ({
      params: Promise.resolve({ id: projectId, drawingId }),
    });

    const refused = await deleteDrawing(post(url(linked)), params(linked));
    expect(refused.status).toBe(StatusCodes.CONFLICT);
    expect(await refused.json()).toMatchObject({
      code: "DRAWING_IN_USE",
      details: { inspectionCount: 2 },
    });
    // Linked only by a deleted inspection: it goes.
    expect(
      (await deleteDrawing(post(url(onceLinked)), params(onceLinked))).status,
    ).toBe(StatusCodes.NO_CONTENT);
  });
});
