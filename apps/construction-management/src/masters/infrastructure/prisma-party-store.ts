import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";

import type {
  PartyDirectory,
  PartyListPage,
  PartyListParams,
  PartyProjectChange,
  PartyStore,
} from "../application/party-handlers";
import type { MasterChange } from "../application/ports";
import {
  Party,
  partyChanged,
  partyNameInUse,
  type PartyKind,
} from "../domain/party";
import { isUniqueViolation } from "./prisma-lookup-store";

type Tx = Prisma.TransactionClient;

type Row = {
  id: string;
  workspaceId: string;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
  projects: { projectId: string }[];
  departments?: { departmentId: string }[];
};

/** Where clause shared by both tables (their columns are the same). */
type Where = {
  workspaceId?: string;
  id?: string | { in: string[] } | { gt: string } | { lt: string };
  deletedAt?: null;
  isActive?: boolean;
  projects?: { some: { projectId: string } };
  updatedAt?: Date;
  AND?: Where[];
  OR?: Where[];
  name?: { contains: string; mode: "insensitive" };
  contactPerson?: { contains: string; mode: "insensitive" };
  gstin?: { contains: string };
  mobile?: { contains: string };
  createdAt?: Date | { lt: Date } | { gt: Date };
};

type Data = {
  name?: string;
  contactPerson?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  isActive?: boolean;
  updatedAt?: Date;
  updatedBy?: string;
  deletedAt?: Date | null;
  deletedBy?: string | null;
};

type FindArgs = {
  where: Where;
  orderBy?: Record<string, "asc" | "desc">[];
  take?: number;
};

/**
 * The few calls the store makes on `contractors` or `suppliers`. Both
 * tables have the same columns, so one store serves both kinds.
 */
type PartyTable = {
  findFirst(args: FindArgs): Promise<Row | null>;
  findMany(args: FindArgs): Promise<Row[]>;
  count(args: { where: Where }): Promise<number>;
  updateMany(args: { where: Where; data: Data }): Promise<{ count: number }>;
};

function table(db: PrismaClient | Tx, kind: PartyKind): PartyTable {
  const include =
    kind === "contractor"
      ? {
          projects: { select: { projectId: true } },
          departments: { select: { departmentId: true } },
        }
      : { projects: { select: { projectId: true } } };
  const delegate = (kind === "contractor"
    ? db.constructionMastersContractor
    : db.constructionMastersSupplier) as unknown as {
    findFirst(args: unknown): Promise<Row | null>;
    findMany(args: unknown): Promise<Row[]>;
    count(args: unknown): Promise<number>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  return {
    findFirst: (args) => delegate.findFirst({ ...args, include }),
    findMany: (args) => delegate.findMany({ ...args, include }),
    count: (args) => delegate.count(args),
    updateMany: (args) => delegate.updateMany(args),
  };
}

function toParty(kind: PartyKind, row: Row): Party {
  return Party.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    kind,
    name: row.name,
    contactPerson: row.contactPerson,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    gstin: row.gstin,
    pan: row.pan,
    isActive: row.isActive,
    departmentIds: (row.departments ?? [])
      .map((item) => item.departmentId)
      .sort(),
    projectIds: row.projects.map((item) => item.projectId).sort(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  });
}

function audit(party: Party, change: MasterChange) {
  return {
    workspaceId: party.workspaceId,
    actorUserId: change.by,
    action: change.action,
    entityType: party.kind,
    entityId: party.id,
    before: change.before,
    after: party.deletedAt == null ? party.snapshot() : null,
    occurredAt: change.now,
  };
}

function columns(party: Party): Data {
  return {
    ...party.details,
    isActive: party.isActive,
    updatedAt: party.updatedAt,
    updatedBy: party.updatedBy,
    deletedAt: party.deletedAt,
    deletedBy: party.deletedBy,
  };
}

async function insertLinks(
  tx: Tx,
  party: Party,
  links: { projects: boolean; departments: boolean },
): Promise<void> {
  if (party.kind === "contractor") {
    if (links.projects && party.projectIds.length > 0)
      await tx.constructionMastersContractorProject.createMany({
        data: party.projectIds.map((projectId) => ({
          contractorId: party.id,
          projectId,
        })),
      });
    if (links.departments && party.departmentIds.length > 0)
      await tx.constructionMastersContractorDepartment.createMany({
        data: party.departmentIds.map((departmentId) => ({
          contractorId: party.id,
          departmentId,
        })),
      });
  } else if (links.projects && party.projectIds.length > 0)
    await tx.constructionMastersSupplierProject.createMany({
      data: party.projectIds.map((projectId) => ({
        supplierId: party.id,
        projectId,
      })),
    });
}

async function replaceLinks(tx: Tx, party: Party): Promise<void> {
  if (party.kind === "contractor") {
    await tx.constructionMastersContractorProject.deleteMany({
      where: { contractorId: party.id },
    });
    await tx.constructionMastersContractorDepartment.deleteMany({
      where: { contractorId: party.id },
    });
  } else
    await tx.constructionMastersSupplierProject.deleteMany({
      where: { supplierId: party.id },
    });
  await insertLinks(tx, party, { projects: true, departments: true });
}

async function linkProject(
  tx: Tx,
  party: Party,
  projectId: string,
  joined: boolean,
): Promise<void> {
  if (party.kind === "contractor") {
    if (joined)
      await tx.constructionMastersContractorProject.createMany({
        data: [{ contractorId: party.id, projectId }],
        skipDuplicates: true,
      });
    else
      await tx.constructionMastersContractorProject.deleteMany({
        where: { contractorId: party.id, projectId },
      });
  } else if (joined)
    await tx.constructionMastersSupplierProject.createMany({
      data: [{ supplierId: party.id, projectId }],
      skipDuplicates: true,
    });
  else
    await tx.constructionMastersSupplierProject.deleteMany({
      where: { supplierId: party.id, projectId },
    });
}

/** Contractors and Suppliers in `construction_masters` (CM-406). */
export class PrismaPartyStore implements PartyStore {
  constructor(private readonly db: PrismaClient) {}

  async find(
    kind: PartyKind,
    workspaceId: string,
    id: string,
  ): Promise<Party | null> {
    const row = await table(this.db, kind).findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toParty(kind, row);
  }

  async findMany(
    kind: PartyKind,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Party[]> {
    if (ids.length === 0) return [];
    const rows = await table(this.db, kind).findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
    });
    return rows.map((row) => toParty(kind, row));
  }

  async list(kind: PartyKind, params: PartyListParams): Promise<PartyListPage> {
    const search = params.search?.trim() ?? "";
    const filters: Where[] = [
      { workspaceId: params.workspaceId, deletedAt: null },
    ];
    if (params.isActive != null) filters.push({ isActive: params.isActive });
    if (params.projectId != null)
      filters.push({ projects: { some: { projectId: params.projectId } } });
    if (search.length > 0) {
      const digits = search.replace(/[^\d]/g, "");
      filters.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { contactPerson: { contains: search, mode: "insensitive" } },
          { gstin: { contains: search.toUpperCase() } },
          ...(digits.length >= 3 ? [{ mobile: { contains: digits } }] : []),
        ],
      });
    }
    // Newest first; `after` pages forward (older), `before` pages back.
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const rows = table(this.db, kind);
    const page = await rows.findMany({
      where: {
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
      },
      orderBy: backwards
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
    });
    const hasMore = page.length > params.limit;
    const items = page.slice(0, params.limit);
    if (backwards) items.reverse();
    const total = await rows.count({ where: { AND: filters } });
    return { items: items.map((row) => toParty(kind, row)), total, hasMore };
  }

  async listOnProject(
    kind: PartyKind,
    workspaceId: string,
    projectId: string,
  ): Promise<Party[]> {
    const rows = await table(this.db, kind).findMany({
      where: {
        workspaceId,
        deletedAt: null,
        projects: { some: { projectId } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toParty(kind, row));
  }

  async listActive(kind: PartyKind, workspaceId: string): Promise<Party[]> {
    const rows = await table(this.db, kind).findMany({
      where: { workspaceId, deletedAt: null, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => toParty(kind, row));
  }

  async insert(party: Party, change: MasterChange): Promise<void> {
    const data = {
      id: party.id,
      workspaceId: party.workspaceId,
      ...party.details,
      isActive: party.isActive,
      createdAt: party.createdAt,
      updatedAt: party.updatedAt,
      createdBy: party.createdBy,
      updatedBy: party.updatedBy,
    };
    try {
      await this.db.$transaction(async (tx) => {
        if (party.kind === "contractor")
          await tx.constructionMastersContractor.create({ data });
        else await tx.constructionMastersSupplier.create({ data });
        await insertLinks(tx, party, { projects: true, departments: true });
        await recordAudit(tx, audit(party, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw partyNameInUse(party.kind);
      throw error;
    }
  }

  async update(
    party: Party,
    expectedUpdatedAt: Date,
    change: MasterChange,
  ): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        // Compare-and-set on updatedAt: a stale write changes no row.
        const updated = await table(tx, party.kind).updateMany({
          where: {
            id: party.id,
            workspaceId: party.workspaceId,
            deletedAt: null,
            updatedAt: expectedUpdatedAt,
          },
          data: columns(party),
        });
        if (updated.count === 0) throw partyChanged(party.kind);
        if (party.deletedAt == null) await replaceLinks(tx, party);
        await recordAudit(tx, audit(party, change));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw partyNameInUse(party.kind);
      throw error;
    }
  }

  async updateProjects(changes: readonly PartyProjectChange[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      for (const { party, loadedAt, projectId, joined, change } of changes) {
        const updated = await table(tx, party.kind).updateMany({
          where: {
            id: party.id,
            workspaceId: party.workspaceId,
            deletedAt: null,
            updatedAt: loadedAt,
          },
          data: { updatedAt: party.updatedAt, updatedBy: party.updatedBy },
        });
        if (updated.count === 0) throw partyChanged(party.kind);
        await linkProject(tx, party, projectId, joined);
        await recordAudit(tx, audit(party, change));
      }
    });
  }
}

/**
 * Projects and Departments by id: the projects context's table is read
 * directly (no import of its code); Departments are this context's own.
 */
export class PrismaPartyDirectory implements PartyDirectory {
  constructor(private readonly db: PrismaClient) {}

  async projects(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionProjectsProject.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async departments(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { id: string; name: string; disabled: boolean }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionMastersDepartment.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] }, deletedAt: null },
      select: { id: true, name: true, disabledAt: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, name: row.name, disabled: row.disabledAt != null },
      ]),
    );
  }
}
