import type { Prisma } from "@repo/construction-db";

import type {
  ContractorFacts,
  FinanceDirectory,
  NamedFacts,
  SupplierFacts,
  TeamMemberFacts,
} from "@/src/finance/application/ports";

type Db = Prisma.TransactionClient;

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

const live = (workspaceId: string, ids: readonly string[]) => ({
  workspaceId,
  id: { in: [...new Set(ids)] },
  deletedAt: null,
});

const named = (rows: { id: string; name: string }[]): Map<string, NamedFacts> =>
  byId(rows.map((row) => ({ id: row.id, name: row.name })));

function toMember(row: {
  id: string;
  name: string;
  userId: string | null;
  status: string;
  deletedAt: Date | null;
}): TeamMemberFacts {
  return {
    id: row.id,
    name: row.name,
    userId: row.userId,
    active: row.status === "active" && row.deletedAt == null,
  };
}

/**
 * What finance reads from masters, organization, projects, procurement and
 * labour (ADR CM-0017 §1), by id. Lives in composition because it crosses
 * contexts; finance only sees the `FinanceDirectory` port.
 */
export const financeDirectory: FinanceDirectory = {
  async contractors(db: Db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: live(workspaceId, ids),
      include: {
        projects: { select: { projectId: true } },
        departments: { select: { departmentId: true } },
      },
    });
    return byId(
      rows.map((row): ContractorFacts => ({
        id: row.id,
        name: row.name,
        pan: row.pan,
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        tdsApplicable: row.tdsApplicable,
        tdsLowerRate: row.tdsLowerRate?.toFixed(2) ?? null,
        tdsNote: row.tdsNote,
        projectIds: row.projects.map((project) => project.projectId),
        departmentIds: row.departments.map((item) => item.departmentId),
      })),
    );
  },

  async suppliers(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersSupplier.findMany({
      where: live(workspaceId, ids),
      include: { projects: { select: { projectId: true } } },
    });
    return byId(
      rows.map((row): SupplierFacts => ({
        id: row.id,
        name: row.name,
        pan: row.pan,
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        projectIds: row.projects.map((project) => project.projectId),
      })),
    );
  },

  async projects(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionProjectsProject.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async stores(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionProcurementStore.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async teamMembers(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        deletedAt: true,
      },
    });
    return byId(rows.map(toMember));
  },

  async memberOfUser(db, workspaceId, userId) {
    const row = await db.constructionOrganizationTeamMember.findFirst({
      where: { workspaceId, userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        userId: true,
        status: true,
        deletedAt: true,
      },
    });
    return row == null ? null : toMember(row);
  },

  async labours(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionLabourLabour.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async vendors(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionLabourVendor.findMany({
        where: live(workspaceId, ids),
        select: { id: true, name: true },
      }),
    );
  },

  async departments(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    return named(
      await db.constructionMastersDepartment.findMany({
        where: { workspaceId, id: { in: [...new Set(ids)] } },
        select: { id: true, name: true },
      }),
    );
  },

  async listParties(db, workspaceId, kind, projectId) {
    const select = { id: true, name: true } as const;
    const orderBy = { name: "asc" } as const;
    const base = { workspaceId, deletedAt: null };
    switch (kind) {
      case "contractor":
        return db.constructionMastersContractor.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "supplier":
        return db.constructionMastersSupplier.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "labour":
        return db.constructionLabourLabour.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { currentProjectId: projectId }),
          },
          select,
          orderBy,
        });
      case "vendor":
        return db.constructionLabourVendor.findMany({
          where: {
            ...base,
            isActive: true,
            ...(projectId == null ? {} : { projects: { some: { projectId } } }),
          },
          select,
          orderBy,
        });
      case "team_member":
        return db.constructionOrganizationTeamMember.findMany({
          where: { ...base, status: "active" },
          select,
          orderBy,
        });
    }
  },
};
