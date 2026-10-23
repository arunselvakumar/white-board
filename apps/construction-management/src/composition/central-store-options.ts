import { prisma, type PrismaClient } from "@repo/construction-db";

import type { MaterialRequestFormPartyOptions } from "@/src/procurement/application/material-request-handlers";
import type {
  StoreFormOptions,
  StoreFormOptionsReader,
} from "@/src/procurement/application/store-handlers";

const byName = [{ name: "asc" as const }, { id: "asc" as const }];

/**
 * What the Central Store forms offer from other contexts (CM-508): the
 * store form's Projects, Team Members (store keepers) and Suppliers, and
 * the Material Request form's Contractors on the Project and Departments.
 * Procurement checks the chosen ids again through `ProcurementDirectory`.
 */
export function createStoreFormOptions(
  db: PrismaClient = prisma,
): StoreFormOptionsReader {
  return {
    async read(workspaceId): Promise<StoreFormOptions> {
      const [projects, teamMembers, suppliers] = await Promise.all([
        db.constructionProjectsProject.findMany({
          where: { workspaceId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: byName,
        }),
        db.constructionOrganizationTeamMember.findMany({
          where: { workspaceId, deletedAt: null, status: "active" },
          select: { id: true, name: true },
          orderBy: byName,
        }),
        db.constructionMastersSupplier.findMany({
          where: { workspaceId, deletedAt: null, isActive: true },
          select: { id: true, name: true },
          orderBy: byName,
        }),
      ]);
      return { projects, teamMembers, suppliers };
    },
  };
}

/** Active Contractors on the Project and enabled Departments. */
export async function materialRequestPartyOptions(
  workspaceId: string,
  projectId: string,
  db: PrismaClient = prisma,
): Promise<MaterialRequestFormPartyOptions> {
  const [contractors, departments, workOrders] = await Promise.all([
    db.constructionMastersContractor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        projects: { some: { projectId } },
      },
      select: { id: true, name: true },
      orderBy: byName,
    }),
    db.constructionMastersDepartment.findMany({
      where: { workspaceId, deletedAt: null, disabledAt: null },
      select: { id: true, name: true },
      orderBy: byName,
    }),
    // CM-1110: the Project's issued Work Orders; the form offers those of
    // the picked Contractor.
    db.constructionContractsWorkOrder.findMany({
      where: { workspaceId, projectId, deletedAt: null, status: "issued" },
      select: { id: true, number: true, contractorId: true },
      orderBy: [{ orderDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return {
    contractors,
    departments,
    workOrders: workOrders.map((row) => ({
      id: row.id,
      number: row.number ?? "Draft",
      contractorId: row.contractorId,
    })),
  };
}
