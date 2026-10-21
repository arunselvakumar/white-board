import { randomUUID } from "node:crypto";

import { prisma } from "@repo/construction-db";
import { describe, expect, it } from "vitest";

import { addProject, newCompany } from "@/test/companies";
import { addMaterial, unitNamed } from "@/test/procurement";
import { salesWing } from "@/test/sales";
import {
  worksheetContractor,
  worksheetDepartment,
  worksheetLabourCategory,
  worksheetLocation,
} from "@/test/site-work";

import { contractsDirectory as directory } from "./contracts-directory";

function audit(by: string) {
  return { createdBy: by, updatedBy: by };
}

async function addClient(
  workspaceId: string,
  by: string,
  data: { name: string; isActive?: boolean; gstin?: string },
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionMastersClient.create({
    data: {
      id,
      workspaceId,
      stateCode: "33",
      address: "12 Anna Salai, Chennai",
      pinCode: "600002",
      ...data,
      ...audit(by),
    },
  });
  return id;
}

async function addEquipment(
  workspaceId: string,
  by: string,
  name: string,
): Promise<string> {
  const id = randomUUID();
  await prisma.constructionSiteWorkEquipment.create({
    data: {
      id,
      workspaceId,
      name,
      equipmentNumber: `TN-${randomUUID().slice(0, 4)}`,
      ownership: "owned",
      utilisationBasis: "hourly",
      workingTimeMethod: "meter_reading",
      ...audit(by),
    },
  });
  return id;
}

describe("contractsDirectory (CM-1101, ADR CM-0023 §1)", () => {
  it("reads a Project's facts: Role, Client, Order Value, state and structure", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const stranger = await newCompany();
    const clientId = await addClient(workspaceId, ownerId, {
      name: "Chennai Metro Rail",
    });
    const projectId = await addProject(workspaceId, ownerId, "Metro Depot");
    await prisma.constructionProjectsProject.update({
      where: { id: projectId },
      data: {
        role: "contract",
        clientId,
        clientName: "Chennai Metro Rail",
        stateCode: "33",
        orderValue: 21_47_00_000_00n,
        projectType: "infrastructure",
      },
    });
    expect(await directory.project(prisma, workspaceId, projectId)).toEqual({
      id: projectId,
      name: "Metro Depot",
      role: "contract",
      stateCode: "33",
      clientId,
      clientName: "Chennai Metro Rail",
      orderValue: 21_47_00_000_00n,
      structure: "locations",
    });
    expect(
      await directory.project(prisma, stranger.workspaceId, projectId),
    ).toBeNull();
  });

  it("lists the Project's active Contractors with their live Departments", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const projectId = await addProject(workspaceId, ownerId);
    const other = await addProject(workspaceId, ownerId);
    const rcc = await worksheetDepartment(workspaceId, ownerId, {
      name: "RCC (Contracts test)",
    });
    const old = await worksheetDepartment(workspaceId, ownerId, {
      name: "Old trade",
      disabled: true,
    });
    const velan = await worksheetContractor(workspaceId, ownerId, {
      name: "Velan Constructions",
      projectIds: [projectId],
      departmentIds: [rcc, old],
    });
    const away = await worksheetContractor(workspaceId, ownerId, {
      name: "Away Builders",
      projectIds: [other],
    });
    const inactive = await worksheetContractor(workspaceId, ownerId, {
      name: "Inactive Works",
      projectIds: [projectId],
    });
    await prisma.constructionMastersContractor.update({
      where: { id: inactive },
      data: { isActive: false },
    });

    const listed = await directory.contractorsOnProject(
      prisma,
      workspaceId,
      projectId,
    );
    expect(listed.map((item) => item.name)).toEqual(["Velan Constructions"]);
    expect(listed[0]).toMatchObject({
      id: velan,
      tdsApplicable: true,
      active: true,
      onProject: true,
      departments: [{ id: rcc, name: "RCC (Contracts test)", active: true }],
    });

    const byId = await directory.contractors(prisma, workspaceId, projectId, [
      velan,
      away,
      inactive,
    ]);
    expect(byId.get(away)).toMatchObject({ onProject: false, active: true });
    expect(byId.get(inactive)).toMatchObject({ active: false });
    // Lookups by id keep disabled Departments, for names on old records.
    expect(byId.get(velan)?.departments.map((item) => item.name)).toEqual([
      "Old trade",
      "RCC (Contracts test)",
    ]);
    const departments = await directory.departments(prisma, workspaceId, [
      rcc,
      old,
    ]);
    expect(departments.get(old)).toEqual({
      id: old,
      name: "Old trade",
      active: false,
    });
  });

  it("offers active Clients and finds removed ones by id", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const stranger = await newCompany();
    const live = await addClient(workspaceId, ownerId, {
      name: "Larsen Infra",
      gstin: "33AAACL0140P1ZM",
    });
    const inactive = await addClient(workspaceId, ownerId, {
      name: "Dormant Client",
      isActive: false,
    });
    await addClient(stranger.workspaceId, stranger.ownerId, {
      name: "Their Client",
    });
    const options = await directory.clientOptions(prisma, workspaceId);
    expect(options.map((item) => item.name)).toEqual(["Larsen Infra"]);
    expect(options[0]).toMatchObject({
      id: live,
      gstin: "33AAACL0140P1ZM",
      stateCode: "33",
      pinCode: "600002",
      active: true,
    });
    const found = await directory.clients(prisma, workspaceId, [inactive]);
    expect(found.get(inactive)?.active).toBe(false);
  });

  it("offers enabled Materials, Labour Categories, Equipment and UoMs", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const bag = await unitNamed(workspaceId, ownerId, "Bag");
    const cement = await addMaterial(workspaceId, ownerId, {
      name: "Cement OPC 53 (Contracts test)",
      uomId: bag,
      gstRate: "18",
    });
    const disabled = await addMaterial(workspaceId, ownerId, {
      name: "Cement PPC (Contracts test, old)",
    });
    await prisma.constructionMastersMaterial.update({
      where: { id: disabled.id },
      data: { disabledAt: new Date() },
    });
    const materials = await directory.materialOptions(prisma, workspaceId, {
      search: "contracts test",
      limit: 10,
    });
    expect(materials).toEqual([
      {
        id: cement.id,
        name: "Cement OPC 53 (Contracts test)",
        specification: null,
        uomId: bag,
        uomName: "Bag",
        hsnCode: "2523",
        gstRate: "18.00",
        unitRate: 38_500n,
        active: true,
      },
    ]);
    const byId = await directory.materials(prisma, workspaceId, [disabled.id]);
    expect(byId.get(disabled.id)?.active).toBe(false);

    const mason = await worksheetLabourCategory(
      workspaceId,
      ownerId,
      "skilled",
    );
    const categories = await directory.labourCategoryOptions(
      prisma,
      workspaceId,
    );
    expect(categories.find((item) => item.id === mason)).toMatchObject({
      skill: "skilled",
      active: true,
    });

    const mixer = await addEquipment(workspaceId, ownerId, "Concrete mixer");
    expect(await directory.equipmentOptions(prisma, workspaceId)).toEqual([
      expect.objectContaining({
        id: mixer,
        name: "Concrete mixer",
        active: true,
      }),
    ]);

    const uoms = await directory.uomOptions(prisma, workspaceId);
    expect(uoms.find((item) => item.id === bag)).toEqual({
      id: bag,
      name: "Bag",
      active: true,
    });
    expect((await directory.uoms(prisma, workspaceId, [bag])).get(bag)).toEqual(
      { id: bag, name: "Bag", active: true },
    );
  });

  it("lists the Project's live Wings and Locations and finds removed ones by id", async () => {
    const { workspaceId, ownerId } = await newCompany();
    const projectId = await addProject(workspaceId, ownerId);
    const towerA = await salesWing(workspaceId, projectId, ownerId, {
      name: "Tower A",
    });
    const goneId = randomUUID();
    const tower = await prisma.constructionProjectsWing.findUniqueOrThrow({
      where: { id: towerA.wingId },
    });
    await prisma.constructionProjectsWing.create({
      data: {
        id: goneId,
        workspaceId,
        projectId,
        phaseId: tower.phaseId,
        wingType: "residential",
        name: "Tower B",
        config: {},
        position: 1,
        deletedAt: new Date(),
        deletedBy: ownerId,
        ...audit(ownerId),
      },
    });
    expect(await directory.wings(prisma, workspaceId, projectId)).toEqual([
      {
        id: towerA.wingId,
        name: "Tower A",
        phaseName: "Phase 1",
        active: true,
      },
    ]);
    const wings = await directory.wingsById(prisma, workspaceId, projectId, [
      goneId,
    ]);
    expect(wings.get(goneId)?.active).toBe(false);

    const pump = await worksheetLocation(
      workspaceId,
      ownerId,
      projectId,
      "Pump house",
    );
    expect(await directory.locations(prisma, workspaceId, projectId)).toEqual([
      { id: pump, name: "Pump house", active: true },
    ]);
    const elsewhere = await addProject(workspaceId, ownerId);
    expect(
      (await directory.locationsById(prisma, workspaceId, elsewhere, [pump]))
        .size,
    ).toBe(0);
  });

  it("answers empty maps without a query for no ids", async () => {
    const { workspaceId } = await newCompany();
    expect(
      (await directory.contractors(prisma, workspaceId, randomUUID(), [])).size,
    ).toBe(0);
    expect((await directory.materials(prisma, workspaceId, [])).size).toBe(0);
  });
});
