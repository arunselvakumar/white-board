import { Prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  employeeSalaryChanged,
  type EmployeeSalaryStore,
  type EmployeeSalaryWrite,
  type SalaryConfigSource,
  type StoredEmployeeSalaryConfig,
} from "../application/employee-salary-handlers";
import type { EmployeeSalaryConfig } from "../domain/employee-salary";
import type { ComponentOverrides } from "../domain/salary-structure";
import { salaryStructureFromRow } from "./prisma-salary-structure-store";

type ConfigRow = Prisma.ConstructionHrmsEmployeeSalaryConfigGetPayload<object>;

/** A stored row as the domain's. The CHECK constraints hold the rules. */
function configFromRow(row: ConfigRow): StoredEmployeeSalaryConfig {
  return {
    id: row.id,
    memberId: row.memberId,
    config: Object.freeze({
      structureId: row.structureId,
      baseMonthly: row.baseMonthly,
      componentOverrides: Object.freeze(
        (row.componentOverrides ?? {}) as ComponentOverrides,
      ),
      gender: row.gender,
      uan: row.uan,
      esiIpNumber: row.esiIpNumber,
      effectiveFrom: calendarDateFromDb(row.effectiveFrom),
    }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function columns(config: EmployeeSalaryConfig) {
  return {
    structureId: config.structureId,
    baseMonthly: config.baseMonthly,
    componentOverrides: config.componentOverrides as Prisma.InputJsonObject,
    gender: config.gender,
    uan: config.uan,
    esiIpNumber: config.esiIpNumber,
    effectiveFrom: calendarDateToDb(config.effectiveFrom),
  };
}

/** The latest row per member among `rows` (sorted newest start first). */
function latestByMember(
  rows: readonly ConfigRow[],
): Map<string, StoredEmployeeSalaryConfig> {
  const latest = new Map<string, StoredEmployeeSalaryConfig>();
  for (const row of rows)
    if (!latest.has(row.memberId)) latest.set(row.memberId, configFromRow(row));
  return latest;
}

/**
 * `construction_hrms.employee_salary_configs` (CM-315): effective-dated
 * rows per member, one live row per member per start date. Save All
 * serialises per member with a transaction advisory lock, so two saves of
 * the same member cannot both pass the `updatedAt` check, and holds the
 * structures it uses FOR SHARE so a structure cannot be deleted under it.
 * Also the run's `SalaryConfigSource` (CM-316).
 */
export class PrismaEmployeeSalaryStore
  implements EmployeeSalaryStore, SalaryConfigSource
{
  constructor(private readonly db: PrismaClient) {}

  async latest(
    workspaceId: string,
    memberIds?: readonly string[],
  ): Promise<Map<string, StoredEmployeeSalaryConfig>> {
    if (memberIds?.length === 0) return new Map();
    const rows = await this.db.constructionHrmsEmployeeSalaryConfig.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(memberIds == null ? {} : { memberId: { in: [...memberIds] } }),
      },
      orderBy: [{ memberId: "asc" }, { effectiveFrom: "desc" }],
    });
    return latestByMember(rows);
  }

  async inForce(
    workspaceId: string,
    memberIds: readonly string[],
    on: CalendarDate,
  ) {
    const result = new Map<
      string,
      StoredEmployeeSalaryConfig & {
        structure: ReturnType<typeof salaryStructureFromRow>;
        structureName: string;
      }
    >();
    if (memberIds.length === 0) return result;
    const rows = await this.db.constructionHrmsEmployeeSalaryConfig.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        memberId: { in: [...memberIds] },
        effectiveFrom: { lte: calendarDateToDb(on) },
      },
      orderBy: [{ memberId: "asc" }, { effectiveFrom: "desc" }],
    });
    const latest = latestByMember(rows);
    const structureIds = [
      ...new Set([...latest.values()].map((row) => row.config.structureId)),
    ];
    const structures = await this.db.constructionHrmsSalaryStructure.findMany({
      where: { workspaceId, id: { in: structureIds } },
      include: {
        components: { orderBy: { sortOrder: "asc" } },
        deductions: { orderBy: { sortOrder: "asc" } },
      },
    });
    const byId = new Map(structures.map((row) => [row.id, row]));
    for (const [memberId, stored] of latest) {
      const row = byId.get(stored.config.structureId);
      if (row == null) continue;
      result.set(memberId, {
        ...stored,
        structure: salaryStructureFromRow(row),
        structureName: row.name,
      });
    }
    return result;
  }

  async saveMany(input: {
    workspaceId: string;
    writes: readonly EmployeeSalaryWrite[];
    by: string;
    now: Date;
  }): Promise<void> {
    const { workspaceId, writes } = input;
    const memberIds = [
      ...new Set(writes.map((write) => write.memberId)),
    ].sort();
    const structureIds = [
      ...new Set(writes.map((write) => write.config.structureId)),
    ].sort();
    try {
      await this.db.$transaction(async (tx) => {
        // One member at a time, in id order so two saves never deadlock.
        for (const memberId of memberIds)
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtextextended(${`hrms_salary:${workspaceId}:${memberId}`}, 0))
          `;
        const live = await tx.$queryRaw<{ id: string }[]>`
          SELECT id::text AS id FROM construction_hrms.salary_structures
          WHERE workspace_id = ${workspaceId}
            AND id = ANY(${structureIds}::uuid[])
            AND deleted_at IS NULL
          ORDER BY id
          FOR SHARE
        `;
        const liveIds = new Set(live.map((row) => row.id));
        const missing = writes.find(
          (write) => !liveIds.has(write.config.structureId),
        );
        if (missing != null)
          throw new DomainError(
            "SALARY_STRUCTURE_NOT_FOUND",
            "This salary structure was not found. It may have been deleted.",
            { details: { memberId: missing.memberId, field: "structureId" } },
          );

        const rows = await tx.constructionHrmsEmployeeSalaryConfig.findMany({
          where: { workspaceId, deletedAt: null, memberId: { in: memberIds } },
          orderBy: [{ memberId: "asc" }, { effectiveFrom: "desc" }],
        });
        const latest = latestByMember(rows);
        const stale = writes
          .filter(
            (write) =>
              (latest.get(write.memberId)?.updatedAt.getTime() ?? null) !==
              (write.expectedUpdatedAt?.getTime() ?? null),
          )
          .map((write) => write.memberId);
        if (stale.length > 0) throw employeeSalaryChanged(stale);

        for (const write of writes) {
          if (write.insert)
            await tx.constructionHrmsEmployeeSalaryConfig.create({
              data: {
                id: write.rowId,
                workspaceId,
                memberId: write.memberId,
                ...columns(write.config),
                createdAt: input.now,
                updatedAt: input.now,
                createdBy: input.by,
                updatedBy: input.by,
              },
            });
          else
            await tx.constructionHrmsEmployeeSalaryConfig.update({
              where: { id: write.rowId },
              data: {
                ...columns(write.config),
                updatedAt: input.now,
                updatedBy: input.by,
              },
            });
          await recordAudit(tx, {
            workspaceId,
            actorUserId: input.by,
            action: write.insert
              ? "employee_salary.configured"
              : "employee_salary.updated",
            entityType: "employee_salary_config",
            entityId: write.rowId,
            before:
              write.before == null
                ? null
                : { memberId: write.memberId, ...write.before },
            after: { memberId: write.memberId, ...write.config },
            occurredAt: input.now,
          });
        }
      });
    } catch (error) {
      // A row at the same start date written meanwhile.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw employeeSalaryChanged(memberIds);
      throw error;
    }
  }
}
