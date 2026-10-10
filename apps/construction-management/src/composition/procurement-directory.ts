import type { Prisma } from "@repo/construction-db";

import type {
  BillingAddressFacts,
  ContractorFacts,
  DepartmentFacts,
  MaterialFacts,
  ProcurementDirectory,
  ProjectFacts,
  SupplierFacts,
  TeamMemberFacts,
  TermsFacts,
} from "@/src/procurement/application/ports";

type Db = Prisma.TransactionClient;

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

const live = (workspaceId: string, ids: readonly string[]) => ({
  workspaceId,
  id: { in: [...ids] },
  deletedAt: null,
});

/**
 * What procurement reads from masters, organization and projects (ADR
 * CM-0015 §1), by id. Lives in composition because it crosses contexts;
 * procurement only sees the `ProcurementDirectory` port.
 */
export const procurementDirectory: ProcurementDirectory = {
  async materials(db: Db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersMaterial.findMany({
      where: live(workspaceId, ids),
      include: {
        uom: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    return byId(
      rows.map((row): MaterialFacts => ({
        id: row.id,
        name: row.name,
        uomId: row.uomId,
        uomName: row.uom.name,
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? null,
        unitRate: row.unitRate,
        discount:
          row.discountType === "amount" && row.discountAmount != null
            ? { type: "amount", paise: row.discountAmount }
            : row.discountType === "percent" && row.discountPercent != null
              ? { type: "percent", percent: row.discountPercent.toFixed(2) }
              : null,
        gstRate: row.gstRate?.toFixed(2) ?? null,
        hsnCode: row.hsnCode,
        minStockQty: row.minStockQty?.toFixed(3) ?? null,
        disabled: row.disabledAt != null,
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
        gstin: row.gstin,
        stateCode: row.stateCode ?? row.gstin?.slice(0, 2) ?? null,
        isActive: row.isActive,
        projectIds: row.projects.map((project) => project.projectId),
      })),
    );
  },

  async contractors(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: live(workspaceId, ids),
      include: { projects: { select: { projectId: true } } },
    });
    return byId(
      rows.map((row): ContractorFacts => ({
        id: row.id,
        name: row.name,
        isActive: row.isActive,
        projectIds: row.projects.map((project) => project.projectId),
      })),
    );
  },

  async departments(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersDepartment.findMany({
      where: live(workspaceId, ids),
      select: { id: true, name: true, disabledAt: true },
    });
    return byId(
      rows.map((row): DepartmentFacts => ({
        id: row.id,
        name: row.name,
        disabled: row.disabledAt != null,
      })),
    );
  },

  async billingAddresses(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionOrganizationBillingAddress.findMany({
      where: live(workspaceId, ids),
    });
    return byId(rows.map(billingFacts));
  },

  async defaultBillingAddress(db, workspaceId) {
    const row = await db.constructionOrganizationBillingAddress.findFirst({
      where: { workspaceId, isDefault: true, deletedAt: null },
    });
    return row == null ? null : billingFacts(row);
  },

  async terms(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersTermsCondition.findMany({
      where: live(workspaceId, ids),
    });
    return byId(
      rows.map((row): TermsFacts => ({
        id: row.id,
        title: row.title,
        body: row.body,
        disabled: row.disabledAt != null,
      })),
    );
  },

  async projects(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionProjectsProject.findMany({
      where: live(workspaceId, ids),
      select: { id: true, name: true, address: true, stateCode: true },
    });
    return byId(rows.map((row): ProjectFacts => ({ ...row })));
  },

  async teamMembers(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionOrganizationTeamMember.findMany({
      where: live(workspaceId, ids),
      select: { id: true, userId: true, name: true },
    });
    return byId(rows.map((row): TeamMemberFacts => ({ ...row })));
  },

  async hiddenGrnFields(db, workspaceId) {
    const row = await db.constructionOrganizationGrnFieldSetting.findUnique({
      where: { workspaceId },
      select: { hiddenFields: true },
    });
    return new Set(row?.hiddenFields ?? []);
  },
};

function billingFacts(
  row: Prisma.ConstructionOrganizationBillingAddressGetPayload<object>,
): BillingAddressFacts {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    stateCode: row.stateCode,
    gstin: row.gstin,
    isDefault: row.isDefault,
  };
}
