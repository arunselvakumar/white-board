import { Prisma } from "@repo/construction-db";

import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import type { ProcurementDirectory } from "../application/ports";
import { stockLocationKey, type StockLocation } from "../domain/stock-location";

type Db = Prisma.TransactionClient;

export type NamedStockLocation = StockLocation & { name: string };

/**
 * Names of Projects (through the directory) and Stores (this context's
 * table), live rows only. Missing ids are absent.
 */
export async function stockLocationNames(
  db: Db,
  directory: ProcurementDirectory,
  workspaceId: string,
  locations: readonly StockLocation[],
): Promise<Map<string, string>> {
  const projectIds = [
    ...new Set(
      locations
        .filter((item) => item.kind === "project")
        .map((item) => item.id),
    ),
  ];
  const storeIds = [
    ...new Set(
      locations.filter((item) => item.kind === "store").map((item) => item.id),
    ),
  ];
  const [projects, stores] = await Promise.all([
    directory.projects(db, workspaceId, projectIds),
    storeIds.length === 0
      ? Promise.resolve([])
      : db.constructionProcurementStore.findMany({
          where: { workspaceId, id: { in: storeIds }, deletedAt: null },
          select: { id: true, name: true },
        }),
  ]);
  const names = new Map<string, string>();
  for (const project of projects.values())
    names.set(
      stockLocationKey({ kind: "project", id: project.id }),
      project.name,
    );
  for (const store of stores)
    names.set(stockLocationKey({ kind: "store", id: store.id }), store.name);
  return names;
}

function missing(location: StockLocation, status: 400 | 404): DomainError {
  const label = location.kind === "project" ? "Project" : "Store";
  const code = `${location.kind === "project" ? "PROJECT" : "STORE"}_NOT_FOUND`;
  return status === 404
    ? notFound(code, `This ${label} was not found.`)
    : new DomainError(code, `This ${label} was not found.`);
}

/**
 * A live Project or Store of the Company with its name. `status` 404 when
 * the location is what the request is about, 400 when it is a field.
 */
export async function requireStockLocation(
  db: Db,
  directory: ProcurementDirectory,
  workspaceId: string,
  location: StockLocation,
  status: 400 | 404 = 404,
): Promise<NamedStockLocation> {
  const names = await stockLocationNames(db, directory, workspaceId, [
    location,
  ]);
  const name = names.get(stockLocationKey(location));
  if (name == null) throw missing(location, status);
  return { ...location, name };
}

/**
 * Team Member names by User id, a plain read of
 * `construction_organization.team_members` (the organization context is
 * referred to by id only). A removed member's name still says who.
 */
export async function userNames(
  db: Db,
  workspaceId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db.$queryRaw<{ userId: string; name: string }[]>(
    Prisma.sql`
      SELECT DISTINCT ON (user_id) user_id AS "userId", name
      FROM construction_organization.team_members
      WHERE workspace_id = ${workspaceId}
        AND user_id = ANY(${ids}::text[])
      ORDER BY user_id, (deleted_at IS NULL) DESC, created_at DESC
    `,
  );
  return new Map(rows.map((row) => [row.userId, row.name]));
}
