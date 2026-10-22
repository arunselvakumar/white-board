import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import { recordAudit } from "@/src/shared-kernel/audit";

import {
  ClientHandlers,
  type ClientListParams,
  type ClientStore,
  type ClientUsage,
  type StoredClient,
} from "../application/client-handlers";
import {
  clientChanged,
  clientNameTaken,
  clientNotFound,
} from "../domain/client";

type Tx = Prisma.TransactionClient;
type Row = Prisma.ConstructionMastersClientGetPayload<object>;

function toStored(row: Row): StoredClient {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    contactPerson: row.contactPerson,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    pinCode: row.pinCode,
    gstin: row.gstin,
    pan: row.pan,
    tan: row.tan,
    stateCode: row.stateCode,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function snapshot(client: StoredClient) {
  return {
    name: client.name,
    contactPerson: client.contactPerson,
    mobile: client.mobile,
    email: client.email,
    address: client.address,
    pinCode: client.pinCode,
    gstin: client.gstin,
    pan: client.pan,
    tan: client.tan,
    stateCode: client.stateCode,
    isActive: client.isActive,
  };
}

function details(client: StoredClient) {
  return {
    name: client.name,
    contactPerson: client.contactPerson,
    mobile: client.mobile,
    email: client.email,
    address: client.address,
    pinCode: client.pinCode,
    gstin: client.gstin,
    pan: client.pan,
    tan: client.tan,
    stateCode: client.stateCode,
    isActive: client.isActive,
  };
}

/** The live Client with this name (any case), other than `exceptId`. */
async function nameTaken(
  tx: Tx,
  workspaceId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id::text AS id FROM construction_masters.clients
      WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL
        AND lower(name) = lower(${name})
        AND (${exceptId}::uuid IS NULL OR id <> ${exceptId}::uuid)
      LIMIT 1`,
  );
  return rows.length > 0;
}

/** Clients in `construction_masters.clients` (CM-1101). */
export class PrismaClientStore implements ClientStore {
  constructor(private readonly db: PrismaClient) {}

  async find(workspaceId: string, id: string) {
    const row = await this.db.constructionMastersClient.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async list(params: ClientListParams) {
    const filters: Prisma.ConstructionMastersClientWhereInput[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
    ];
    const search = params.search?.trim() ?? "";
    if (search !== "") {
      const contains = { contains: search, mode: "insensitive" as const };
      const digits = search.replace(/\D/g, "");
      filters.push({
        OR: [
          { name: contains },
          { contactPerson: contains },
          { email: contains },
          { gstin: contains },
          ...(digits.length >= 3 ? [{ mobile: { contains: digits } }] : []),
        ],
      });
    }
    if (params.isActive != null) filters.push({ isActive: params.isActive });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where: Prisma.ConstructionMastersClientWhereInput = {
      AND:
        cursor == null
          ? filters
          : [
              ...filters,
              {
                OR: backwards
                  ? [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ]
                  : [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
              },
            ],
    };
    const [page, total] = await Promise.all([
      this.db.constructionMastersClient.findMany({
        where,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      this.db.constructionMastersClient.count({ where: { AND: filters } }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return { items: rows.map(toStored), total, hasMore };
  }

  async options(input: Parameters<ClientStore["options"]>[0]) {
    const search = input.search?.trim() ?? "";
    const rows = await this.db.constructionMastersClient.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: null,
        ...(input.ids != null && input.ids.length > 0
          ? { id: { in: [...input.ids] } }
          : {
              isActive: true,
              ...(search === ""
                ? {}
                : {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { gstin: { contains: search, mode: "insensitive" } },
                    ],
                  }),
            }),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: input.limit,
      select: {
        id: true,
        name: true,
        gstin: true,
        stateCode: true,
        isActive: true,
      },
    });
    return rows;
  }

  async insert(client: StoredClient): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        if (await nameTaken(tx, client.workspaceId, client.name, null))
          throw clientNameTaken(client.name);
        await tx.constructionMastersClient.create({
          data: {
            id: client.id,
            workspaceId: client.workspaceId,
            ...details(client),
            createdAt: client.createdAt,
            updatedAt: client.updatedAt,
            createdBy: client.createdBy,
            updatedBy: client.updatedBy,
          },
        });
        await recordAudit(tx, {
          workspaceId: client.workspaceId,
          actorUserId: client.createdBy,
          action: "client.created",
          entityType: "client",
          entityId: client.id,
          after: snapshot(client),
          occurredAt: client.createdAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw clientNameTaken(client.name);
      throw error;
    }
  }

  async update(input: Parameters<ClientStore["update"]>[0]) {
    const { before, after } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.constructionMastersClient.updateMany({
          where: {
            id: before.id,
            workspaceId: before.workspaceId,
            deletedAt: null,
            updatedAt: input.expectedUpdatedAt,
          },
          data: {
            ...details(after),
            updatedAt: after.updatedAt,
            updatedBy: after.updatedBy,
          },
        });
        if (updated.count === 0) {
          const live = await tx.constructionMastersClient.count({
            where: { id: before.id, deletedAt: null },
          });
          throw live === 0 ? clientNotFound() : clientChanged();
        }
        if (await nameTaken(tx, before.workspaceId, after.name, before.id))
          throw clientNameTaken(after.name);
        await recordAudit(tx, {
          workspaceId: before.workspaceId,
          actorUserId: after.updatedBy,
          action: "client.updated",
          entityType: "client",
          entityId: before.id,
          before: snapshot(before),
          after: snapshot(after),
          occurredAt: after.updatedAt,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw clientNameTaken(after.name);
      throw error;
    }
  }

  async delete(input: Parameters<ClientStore["delete"]>[0]) {
    const { client, by, now } = input;
    await this.db.$transaction(async (tx) => {
      const deleted = await tx.constructionMastersClient.updateMany({
        where: {
          id: client.id,
          workspaceId: client.workspaceId,
          deletedAt: null,
          ...(input.expectedUpdatedAt == null
            ? {}
            : { updatedAt: input.expectedUpdatedAt }),
        },
        data: { deletedAt: now, deletedBy: by, updatedAt: now, updatedBy: by },
      });
      if (deleted.count === 0) {
        const live = await tx.constructionMastersClient.count({
          where: { id: client.id, deletedAt: null },
        });
        throw live === 0 ? clientNotFound() : clientChanged();
      }
      await recordAudit(tx, {
        workspaceId: client.workspaceId,
        actorUserId: by,
        action: "client.deleted",
        entityType: "client",
        entityId: client.id,
        before: snapshot(client),
        occurredAt: now,
      });
    });
  }
}

/** Clients (CM-1101) over Prisma; `usage` comes from the composition root. */
export function createClientHandlers(deps: {
  usage: ClientUsage;
  prisma?: PrismaClient;
  clock?: () => Date;
}): ClientHandlers {
  return new ClientHandlers(
    new PrismaClientStore(deps.prisma ?? prisma),
    deps.usage,
    deps.clock,
  );
}
