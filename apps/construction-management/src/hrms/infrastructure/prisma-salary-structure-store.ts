import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  salaryStructureNotFound,
  type SalaryStructureStore,
  type StoredSalaryStructure,
} from "../application/salary-structure-handlers";
import {
  formatPercent,
  percentHundredths,
  type SalaryStructure,
} from "../domain/salary-structure";

type Tx = Prisma.TransactionClient;

const STRUCTURE_INCLUDE = {
  components: { orderBy: { sortOrder: "asc" } },
  deductions: { orderBy: { sortOrder: "asc" } },
} as const;

type StructureRow = Prisma.ConstructionHrmsSalaryStructureGetPayload<{
  include: typeof STRUCTURE_INCLUDE;
}>;

/** A stored percentage ("12.50") as the domain writes it ("12.5"). */
export function percentFromDb(value: Prisma.Decimal | null): string | null {
  if (value == null) return null;
  return formatPercent(percentHundredths(value.toFixed(2)) ?? 0);
}

/** A stored structure as the domain's. The CHECK constraints hold the rules. */
export function salaryStructureFromRow(row: StructureRow): SalaryStructure {
  return Object.freeze({
    name: row.name,
    description: row.description,
    components: Object.freeze(
      row.components.map((component) =>
        Object.freeze({
          id: component.id,
          name: component.name,
          basis: component.basis,
          amount: component.amount,
          percent: percentFromDb(component.percent),
          isBalancing: component.isBalancing,
          countsForPfWage: component.countsForPfWage,
        }),
      ),
    ),
    pf: Object.freeze({
      applicable: row.pfApplicable,
      employeePercent: percentFromDb(row.pfEmployeePercent),
      capAtCeiling: row.pfCapAtCeiling,
      wageCeiling: row.pfWageCeiling,
    }),
    esi: Object.freeze({
      applicable: row.esiApplicable,
      employeePercent: percentFromDb(row.esiEmployeePercent),
    }),
    pt: Object.freeze({
      applicable: row.ptApplicable,
      monthlyAmount: row.ptMonthlyAmount,
    }),
    deductAbsentDays: row.deductAbsentDays,
    deductUnpaidLeave: row.deductUnpaidLeave,
    otherDeductions: Object.freeze(
      row.deductions.map((deduction) =>
        Object.freeze({ name: deduction.name, amount: deduction.amount }),
      ),
    ),
    isActive: row.isActive,
  });
}

function columns(structure: SalaryStructure) {
  return {
    name: structure.name,
    description: structure.description,
    pfApplicable: structure.pf.applicable,
    pfEmployeePercent: structure.pf.employeePercent,
    pfCapAtCeiling: structure.pf.capAtCeiling,
    pfWageCeiling: structure.pf.wageCeiling,
    esiApplicable: structure.esi.applicable,
    esiEmployeePercent: structure.esi.employeePercent,
    ptApplicable: structure.pt.applicable,
    ptMonthlyAmount: structure.pt.monthlyAmount,
    deductAbsentDays: structure.deductAbsentDays,
    deductUnpaidLeave: structure.deductUnpaidLeave,
    isActive: structure.isActive,
  };
}

function nameTaken(name: string) {
  return conflict(
    "SALARY_STRUCTURE_NAME_TAKEN",
    `There is already a salary structure called ${name}.`,
    { field: "name" },
  );
}

function structureChanged() {
  return conflict(
    "SALARY_STRUCTURE_CHANGED",
    "Someone else changed this salary structure after you opened it. Reload to see their changes.",
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function writeLines(
  tx: Tx,
  structureId: string,
  structure: SalaryStructure,
  now: Date,
): Promise<void> {
  await tx.constructionHrmsSalaryComponent.createMany({
    data: structure.components.map((component, index) => ({
      id: component.id,
      structureId,
      name: component.name,
      basis: component.basis,
      amount: component.amount,
      percent: component.percent,
      isBalancing: component.isBalancing,
      countsForPfWage: component.countsForPfWage,
      sortOrder: index,
    })),
  });
  if (structure.otherDeductions.length > 0)
    await tx.constructionHrmsSalaryDeduction.createMany({
      data: structure.otherDeductions.map((deduction, index) => ({
        id: newId(now.getTime() + index),
        structureId,
        name: deduction.name,
        amount: deduction.amount,
        sortOrder: index,
      })),
    });
}

/**
 * `construction_hrms.salary_structures` with their components and other
 * deductions (CM-314). An edit replaces the lines in one transaction,
 * keeping each component's id; a delete is a tombstone, refused while a
 * live member configuration uses the structure.
 */
export class PrismaSalaryStructureStore implements SalaryStructureStore {
  constructor(private readonly db: PrismaClient) {}

  private async usage(
    db: Pick<PrismaClient, "constructionHrmsEmployeeSalaryConfig"> | Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionHrmsEmployeeSalaryConfig.findMany({
      where: { workspaceId, structureId: { in: [...ids] }, deletedAt: null },
      select: { structureId: true, memberId: true },
      distinct: ["structureId", "memberId"],
    });
    const counts = new Map<string, number>();
    for (const row of rows)
      counts.set(row.structureId, (counts.get(row.structureId) ?? 0) + 1);
    return counts;
  }

  private stored(
    row: StructureRow,
    usage: Map<string, number>,
  ): StoredSalaryStructure {
    return {
      id: row.id,
      structure: salaryStructureFromRow(row),
      membersUsing: usage.get(row.id) ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(workspaceId: string): Promise<StoredSalaryStructure[]> {
    const rows = await this.db.constructionHrmsSalaryStructure.findMany({
      where: { workspaceId, deletedAt: null },
      include: STRUCTURE_INCLUDE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const usage = await this.usage(
      this.db,
      workspaceId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => this.stored(row, usage));
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<StoredSalaryStructure | null> {
    const row = await this.db.constructionHrmsSalaryStructure.findFirst({
      where: { workspaceId, id, deletedAt: null },
      include: STRUCTURE_INCLUDE,
    });
    if (row == null) return null;
    return this.stored(row, await this.usage(this.db, workspaceId, [id]));
  }

  async create(input: {
    workspaceId: string;
    id: string;
    structure: SalaryStructure;
    by: string;
    now: Date;
  }): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.constructionHrmsSalaryStructure.create({
          data: {
            id: input.id,
            workspaceId: input.workspaceId,
            ...columns(input.structure),
            createdAt: input.now,
            updatedAt: input.now,
            createdBy: input.by,
            updatedBy: input.by,
          },
        });
        await writeLines(tx, input.id, input.structure, input.now);
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "salary_structure.created",
          entityType: "salary_structure",
          entityId: input.id,
          after: input.structure,
          occurredAt: input.now,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken(input.structure.name);
      throw error;
    }
  }

  /** Locks the live row and checks it is the one the caller loaded. */
  private async lockLive(
    tx: Tx,
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<StructureRow> {
    await tx.$queryRaw`
      SELECT id FROM construction_hrms.salary_structures
      WHERE workspace_id = ${workspaceId} AND id = ${id}::uuid
      FOR UPDATE
    `;
    const row = await tx.constructionHrmsSalaryStructure.findFirst({
      where: { workspaceId, id, deletedAt: null },
      include: STRUCTURE_INCLUDE,
    });
    if (row == null) throw salaryStructureNotFound();
    if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime())
      throw structureChanged();
    return row;
  }

  async update(input: {
    workspaceId: string;
    id: string;
    structure: SalaryStructure;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        const row = await this.lockLive(
          tx,
          input.workspaceId,
          input.id,
          input.expectedUpdatedAt,
        );
        await tx.constructionHrmsSalaryComponent.deleteMany({
          where: { structureId: input.id },
        });
        await tx.constructionHrmsSalaryDeduction.deleteMany({
          where: { structureId: input.id },
        });
        await tx.constructionHrmsSalaryStructure.update({
          where: { id: input.id },
          data: {
            ...columns(input.structure),
            updatedAt: input.now,
            updatedBy: input.by,
          },
        });
        await writeLines(tx, input.id, input.structure, input.now);
        await recordAudit(tx, {
          workspaceId: input.workspaceId,
          actorUserId: input.by,
          action: "salary_structure.updated",
          entityType: "salary_structure",
          entityId: input.id,
          before: salaryStructureFromRow(row),
          after: input.structure,
          occurredAt: input.now,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw nameTaken(input.structure.name);
      throw error;
    }
  }

  async delete(input: {
    workspaceId: string;
    id: string;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const row = await this.lockLive(
        tx,
        input.workspaceId,
        input.id,
        input.expectedUpdatedAt,
      );
      // Configuration writers hold the structure FOR SHARE, so none can be
      // saved against it between this count and the tombstone.
      const members =
        (await this.usage(tx, input.workspaceId, [input.id])).get(input.id) ??
        0;
      if (members > 0)
        throw conflict(
          "SALARY_STRUCTURE_IN_USE",
          `${row.name} is the salary structure of ${String(members)} ${members === 1 ? "member" : "members"}. Move them to another structure first.`,
          { members },
        );
      await tx.constructionHrmsSalaryStructure.update({
        where: { id: input.id },
        data: {
          deletedAt: input.now,
          deletedBy: input.by,
          updatedAt: input.now,
          updatedBy: input.by,
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actorUserId: input.by,
        action: "salary_structure.deleted",
        entityType: "salary_structure",
        entityId: input.id,
        before: salaryStructureFromRow(row),
        occurredAt: input.now,
      });
    });
  }
}
