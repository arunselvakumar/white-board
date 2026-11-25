import { randomUUID } from "node:crypto";

import { prisma, type Prisma, type PrismaClient } from "@repo/whiteboard-db";

import type {
  NewStockMovement,
  StockLedgerQuery,
  StockStore,
} from "../application/stock-ports";
import type {
  ChildStockIssuedView,
  StockLedgerView,
  StockOnHandRowView,
} from "../application/stock-views";
import { fromIsoDate, toIsoDate } from "../domain/dates";
import { runningBalances } from "../domain/stock-movement";

function fullName(person: { firstName: string; lastName: string | null }) {
  return person.lastName == null || person.lastName === ""
    ? person.firstName
    : `${person.firstName} ${person.lastName}`;
}

function key(centreId: string, itemId: string): string {
  return `${centreId}:${itemId}`;
}

export class PrismaStockStore implements StockStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async onHand(
    workspaceId: string,
    centreId: string,
  ): Promise<Omit<StockOnHandRowView, "low">[]> {
    const [items, sums] = await Promise.all([
      this.db.preschoolStockItem.findMany({
        where: { workspaceId, archivedAt: null },
        orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          kind: true,
          unit: true,
          reorderLevel: true,
        },
      }),
      this.db.preschoolStockMovement.groupBy({
        by: ["itemId"],
        where: { workspaceId, centreId },
        _sum: { quantityDelta: true },
        _max: { movedOn: true },
      }),
    ]);
    const byItem = new Map(sums.map((row) => [row.itemId, row]));
    return items.map((item) => {
      const sum = byItem.get(item.id);
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        kind: item.kind,
        unit: item.unit,
        reorderLevel: item.reorderLevel,
        onHand: sum?._sum.quantityDelta ?? 0,
        lastMovedOn:
          sum?._max.movedOn == null ? null : toIsoDate(sum._max.movedOn),
      };
    });
  }

  async items(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<
    { id: string; name: string; unit: string; isArchived: boolean }[]
  > {
    if (ids.length === 0) return [];
    const rows = await this.db.preschoolStockItem.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, unit: true, archivedAt: true },
    });
    return rows.map(({ archivedAt, ...rest }) => ({
      ...rest,
      isArchived: archivedAt != null,
    }));
  }

  async centre(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.db.preschoolCentre.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  async child(
    workspaceId: string,
    id: string,
  ): Promise<{
    id: string;
    centreId: string;
    name: string;
    classroomId: string | null;
  } | null> {
    const row = await this.db.preschoolChild.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: {
        id: true,
        centreId: true,
        firstName: true,
        lastName: true,
        admissions: {
          where: { status: "active" },
          orderBy: { admittedOn: "desc" },
          take: 1,
          select: { classroomId: true },
        },
      },
    });
    if (row == null) return null;
    return {
      id: row.id,
      centreId: row.centreId,
      name: fullName(row),
      classroomId: row.admissions[0]?.classroomId ?? null,
    };
  }

  async classroom(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string; name: string } | null> {
    return this.db.preschoolClassroom.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, centreId: true, name: true },
    });
  }

  async staff(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string; name: string } | null> {
    return this.db.preschoolStaff.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { id: true, centreId: true, name: true },
    });
  }

  async record(
    workspaceId: string,
    movements: readonly NewStockMovement[],
    check: (movement: NewStockMovement, onHand: number) => void,
  ): Promise<{
    movementIds: string[];
    balances: { centreId: string; itemId: string; onHand: number }[];
  }> {
    return this.db.$transaction(async (tx) => {
      const pairs = [
        ...new Map(
          movements.map((movement) => [
            key(movement.centreId, movement.itemId),
            { centreId: movement.centreId, itemId: movement.itemId },
          ]),
        ).entries(),
      ].sort(([a], [b]) => a.localeCompare(b));
      // One lock per Centre and item, taken in a fixed order so two movements
      // never wait on each other; the second reads what the first wrote.
      for (const [lockKey] of pairs)
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`preschool-stock:${workspaceId}:${lockKey}`}, 0))`;
      const sums = await tx.preschoolStockMovement.groupBy({
        by: ["centreId", "itemId"],
        where: {
          workspaceId,
          OR: pairs.map(([, pair]) => pair),
        },
        _sum: { quantityDelta: true },
      });
      const onHand = new Map(
        pairs.map(([lockKey]) => [lockKey, 0] as [string, number]),
      );
      for (const row of sums)
        onHand.set(key(row.centreId, row.itemId), row._sum.quantityDelta ?? 0);

      const rows: Prisma.PreschoolStockMovementCreateManyInput[] = [];
      for (const movement of movements) {
        const movementKey = key(movement.centreId, movement.itemId);
        const current = onHand.get(movementKey) ?? 0;
        check(movement, current);
        onHand.set(movementKey, current + movement.quantityDelta);
        rows.push({
          id: randomUUID(),
          workspaceId,
          centreId: movement.centreId,
          itemId: movement.itemId,
          kind: movement.kind,
          quantityDelta: movement.quantityDelta,
          movedOn: fromIsoDate(movement.movedOn),
          supplierName: movement.supplierName ?? null,
          billNumber: movement.billNumber ?? null,
          unitCostPaise: movement.unitCostPaise ?? null,
          childId: movement.childId ?? null,
          classroomId: movement.classroomId ?? null,
          staffId: movement.staffId ?? null,
          transferId: movement.transferId ?? null,
          otherCentreId: movement.otherCentreId ?? null,
          note: movement.note ?? null,
          recordedByUserId: movement.recordedByUserId,
          recordedByName: movement.recordedByName,
        });
      }
      await tx.preschoolStockMovement.createMany({ data: rows });
      return {
        movementIds: rows.map((row) => row.id),
        balances: pairs.map(([lockKey, pair]) => ({
          ...pair,
          onHand: onHand.get(lockKey) ?? 0,
        })),
      };
    });
  }

  async ledger(
    workspaceId: string,
    query: StockLedgerQuery,
  ): Promise<StockLedgerView> {
    const where: Prisma.PreschoolStockMovementWhereInput = {
      workspaceId,
      centreId: query.centreId,
      ...(query.itemId == null ? {} : { itemId: query.itemId }),
      ...(query.childId == null ? {} : { childId: query.childId }),
      ...(query.kind == null ? {} : { kind: query.kind }),
      ...(query.from == null && query.to == null
        ? {}
        : {
            movedOn: {
              ...(query.from == null ? {} : { gte: fromIsoDate(query.from) }),
              ...(query.to == null ? {} : { lte: fromIsoDate(query.to) }),
            },
          }),
    };
    const [rows, total, history] = await Promise.all([
      this.db.preschoolStockMovement.findMany({
        where,
        orderBy: [{ movedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor == null
          ? {}
          : { cursor: { id: query.cursor }, skip: 1 }),
        include: {
          item: { select: { name: true, unit: true } },
          child: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.db.preschoolStockMovement.count({ where }),
      query.itemId == null
        ? Promise.resolve(null)
        : this.db.preschoolStockMovement.findMany({
            where: {
              workspaceId,
              centreId: query.centreId,
              itemId: query.itemId,
            },
            orderBy: [{ movedOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            select: { id: true, quantityDelta: true },
          }),
    ]);
    const page = rows.slice(0, query.limit);
    const balances = history == null ? null : runningBalances(history);
    const ids = (pick: (row: (typeof page)[number]) => string | null) => [
      ...new Set(page.map(pick).filter((id): id is string => id != null)),
    ];
    const [classrooms, staff, centres] = await Promise.all([
      this.db.preschoolClassroom.findMany({
        where: { workspaceId, id: { in: ids((row) => row.classroomId) } },
        select: { id: true, name: true },
      }),
      this.db.preschoolStaff.findMany({
        where: { workspaceId, id: { in: ids((row) => row.staffId) } },
        select: { id: true, name: true },
      }),
      this.db.preschoolCentre.findMany({
        where: { workspaceId, id: { in: ids((row) => row.otherCentreId) } },
        select: { id: true, name: true },
      }),
    ]);
    const find = (
      list: readonly { id: string; name: string }[],
      id: string | null,
    ) => (id == null ? null : (list.find((row) => row.id === id) ?? null));
    return {
      items: page.map((row) => ({
        id: row.id,
        centreId: row.centreId,
        movedOn: toIsoDate(row.movedOn),
        kind: row.kind,
        itemId: row.itemId,
        itemName: row.item.name,
        unit: row.item.unit,
        quantityDelta: row.quantityDelta,
        child:
          row.child == null
            ? null
            : { id: row.child.id, name: fullName(row.child) },
        classroom: find(classrooms, row.classroomId),
        staff: find(staff, row.staffId),
        otherCentre: find(centres, row.otherCentreId),
        supplierName: row.supplierName,
        billNumber: row.billNumber,
        unitCostPaise: row.unitCostPaise,
        transferId: row.transferId,
        note: row.note,
        recordedByName: row.recordedByName,
        balanceAfter: balances?.get(row.id) ?? null,
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      total,
    };
  }

  async childIssued(
    workspaceId: string,
    childId: string,
  ): Promise<ChildStockIssuedView> {
    const rows = await this.db.preschoolStockMovement.findMany({
      where: { workspaceId, childId, kind: "issued_to_child" },
      orderBy: [{ movedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      include: { item: { select: { name: true, unit: true } } },
    });
    return {
      items: rows.map((row) => ({
        movementId: row.id,
        itemId: row.itemId,
        itemName: row.item.name,
        unit: row.item.unit,
        quantity: -row.quantityDelta,
        movedOn: toIsoDate(row.movedOn),
        note: row.note,
      })),
    };
  }
}
