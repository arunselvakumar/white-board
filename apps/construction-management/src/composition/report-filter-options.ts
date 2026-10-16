import { prisma, type PrismaClient } from "@repo/construction-db";

import { userNames } from "@/src/procurement/infrastructure/inventory-locations";
import type { ReportFilterKey } from "@/src/reporting/domain/report-catalogue";

/** One choice of a report card's picker. */
export type ReportFilterChoice = { id: string; name: string };

/** The choices of each picker the viewer's report cards show (CM-903). */
export type ReportFilterChoices = {
  projects: ReportFilterChoice[];
  stores: ReportFilterChoice[];
  vendors: ReportFilterChoice[];
  labourCategories: ReportFilterChoice[];
  suppliers: ReportFilterChoice[];
  materialCategories: ReportFilterChoice[];
  materials: ReportFilterChoice[];
  creators: ReportFilterChoice[];
};

const byName = (a: ReportFilterChoice, b: ReportFilterChoice) =>
  a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

const NAMED = { id: true, name: true } as const;

/**
 * The choices for the report cards' pickers (CM-903): plain reads of
 * projects, procurement, masters, labour and organization, so a member
 * who may request a report can narrow it without Read on each master.
 * Only the pickers in `keys` (the filters of the reports the viewer may
 * request) are read; the rest come back empty.
 *
 * - **Projects** (central): the `projectIds` the viewer may see (null:
 *   every live Project, the Owner).
 * - **Stores** (central): every live Central Store, when `stores`.
 * - **Vendors**: those on the Project, or every one centrally.
 * - **Created By**: who raised the Purchase Requests of the Projects in
 *   scope.
 * - Labour Categories, Suppliers, Material Categories and Materials:
 *   every live one of the Company.
 */
export async function reportFilterChoices(
  input: {
    workspaceId: string;
    keys: ReadonlySet<ReportFilterKey>;
    /** A Project's cards; null for the central ones. */
    projectId: string | null;
    /** The Projects the viewer may see; null for every one. */
    projectIds: readonly string[] | null;
    /** The viewer may pick a Central Store. */
    stores: boolean;
  },
  db: PrismaClient = prisma,
): Promise<ReportFilterChoices> {
  const { workspaceId, keys } = input;
  const wants = (key: ReportFilterKey) => keys.has(key);
  const live = { workspaceId, deletedAt: null };
  const inScope =
    input.projectId != null
      ? [input.projectId]
      : input.projectIds == null
        ? null
        : [...input.projectIds];
  const none = Promise.resolve([] as ReportFilterChoice[]);

  const [
    projects,
    stores,
    vendors,
    labourCategories,
    suppliers,
    materialCategories,
    materials,
    creators,
  ] = await Promise.all([
    wants("projects") && input.projectId == null
      ? db.constructionProjectsProject.findMany({
          where: {
            ...live,
            ...(inScope == null ? {} : { id: { in: inScope } }),
          },
          select: NAMED,
        })
      : none,
    wants("store") && input.stores
      ? db.constructionProcurementStore.findMany({ where: live, select: NAMED })
      : none,
    wants("vendor")
      ? db.constructionLabourVendor.findMany({
          where: {
            ...live,
            ...(input.projectId == null
              ? {}
              : { projects: { some: { projectId: input.projectId } } }),
          },
          select: NAMED,
        })
      : none,
    wants("labour_category")
      ? db.constructionMastersLabourCategory.findMany({
          where: live,
          select: NAMED,
        })
      : none,
    wants("supplier")
      ? db.constructionMastersSupplier.findMany({ where: live, select: NAMED })
      : none,
    wants("material_category")
      ? db.constructionMastersMaterialCategory.findMany({
          where: live,
          select: NAMED,
        })
      : none,
    wants("material")
      ? db.constructionMastersMaterial.findMany({ where: live, select: NAMED })
      : none,
    wants("created_by")
      ? purchaseRequestCreators(db, workspaceId, inScope)
      : none,
  ]);
  return {
    projects: projects.sort(byName),
    stores: stores.sort(byName),
    vendors: vendors.sort(byName),
    labourCategories: labourCategories.sort(byName),
    suppliers: suppliers.sort(byName),
    materialCategories: materialCategories.sort(byName),
    materials: materials.sort(byName),
    creators: creators.sort(byName),
  };
}

/** Who raised the live Purchase Requests of the Projects (null: every one). */
async function purchaseRequestCreators(
  db: PrismaClient,
  workspaceId: string,
  projectIds: string[] | null,
): Promise<ReportFilterChoice[]> {
  if (projectIds?.length === 0) return [];
  const rows = await db.constructionProcurementPurchaseRequest.findMany({
    where: {
      workspaceId,
      deletedAt: null,
      ...(projectIds == null ? {} : { projectId: { in: projectIds } }),
    },
    select: { createdBy: true },
    distinct: ["createdBy"],
  });
  const ids = rows.map((row) => row.createdBy);
  const names = await userNames(db, workspaceId, ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? "A removed user" }));
}
