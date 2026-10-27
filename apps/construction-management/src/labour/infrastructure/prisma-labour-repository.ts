import type { Prisma, PrismaClient } from "@repo/construction-db";

import { recordAudit, type AuditEvent } from "@/src/shared-kernel/audit";
import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { conflict } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import {
  isPrismaError,
  isUniqueViolation,
} from "@/src/shared-kernel/prisma-errors";
import type { PrivateDataCipher } from "@/src/shared-kernel/private-data";

import {
  labourCodeTaken,
  labourNotFound,
} from "../application/labour-handlers";
import type {
  LabourMove,
  LabourRepository,
  LabourTransferRecord,
  NewLabour,
} from "../application/labour-ports";
import { Labour, type ProjectChanges } from "../domain/labour";
import { workingHours, type Weekday } from "../domain/wages";
import { lockLiveParties } from "./party-locks";
import { companyToday } from "./prisma-labour-queries";
import { prismaLedger } from "./prisma-ledger";

type Tx = Prisma.TransactionClient;

/** The labourer's Projects, oldest first (ADR CM-0033). */
const WITH_PROJECTS = {
  projects: {
    select: { projectId: true },
    orderBy: [{ since: "asc" }, { projectId: "asc" }],
  },
} as const satisfies Prisma.ConstructionLabourLabourInclude;

export type LabourRow = Prisma.ConstructionLabourLabourGetPayload<{
  include: typeof WITH_PROJECTS;
}>;

/** A labourer row as the aggregate; Aadhaar decrypted. */
export function labourFromRow(
  row: LabourRow,
  cipher: () => PrivateDataCipher,
): Labour {
  return Labour.reconstitute({
    id: row.id,
    workspaceId: row.workspaceId,
    details: {
      name: row.name,
      labourCode: row.labourCode,
      fatherName: row.fatherName,
      joiningDate: calendarDateFromDb(row.joiningDate),
      wageType: row.wageType,
      wagePerDay: row.wagePerDay,
      wagePerMonth: row.wagePerMonth,
      overtimeWagePerHour: row.overtimeWagePerHour,
      workingHoursPerDay: workingHours(row.workingHoursPerDay.toString()),
      weeklyHolidays: row.weeklyHolidays as Weekday[],
      uanNumber: row.uanNumber,
      esicNumber: row.esicNumber,
      aadhaar:
        row.aadhaarEncrypted == null
          ? null
          : cipher().decrypt(row.aadhaarEncrypted),
      labourCategoryId: row.labourCategoryId,
      supervisorId: row.supervisorId,
      contactNumber: row.contactNumber,
      gender: row.gender,
    },
    projectIds: row.projects.map((project) => project.projectId),
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt,
  });
}

function isCodeClash(error: unknown): boolean {
  return (
    isUniqueViolation(error) ||
    // A partial unique index surfaces as a raw unique violation.
    (isPrismaError(error, "P2010") && error.message.includes("23505"))
  );
}

function openingEntry(labour: Labour, amount: number) {
  return {
    partyType: "labour" as const,
    partyId: labour.id,
    projectId: null,
    entryDate: labour.details.joiningDate,
    kind: "opening" as const,
    amount,
    sourceType: "labour" as const,
    sourceId: labour.id,
    reversesEntryId: null,
  };
}

/** The labour register's writes, each in one transaction (ADR CM-0004). */
/** Whether any live attendance or wage payment exists for the labourer. */
async function hasRecords(
  tx: Tx,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const [attendance, payments] = await Promise.all([
    tx.constructionLabourAttendance.count({
      where: { workspaceId, labourId: id, deletedAt: null },
    }),
    tx.constructionLabourWagePayment.count({
      where: { workspaceId, partyType: "labour", partyId: id, deletedAt: null },
    }),
  ]);
  return attendance + payments > 0;
}

export class PrismaLabourRepository implements LabourRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly cipher: () => PrivateDataCipher,
  ) {}

  /** The columns the aggregate owns, Aadhaar sealed. */
  private columns(labour: Labour) {
    const details = labour.details;
    return {
      name: details.name,
      labourCode: details.labourCode,
      fatherName: details.fatherName,
      joiningDate: calendarDateToDb(details.joiningDate),
      wageType: details.wageType,
      wagePerDay: details.wagePerDay,
      wagePerMonth: details.wagePerMonth,
      overtimeWagePerHour: details.overtimeWagePerHour,
      workingHoursPerDay: details.workingHoursPerDay,
      weeklyHolidays: details.weeklyHolidays,
      uanNumber: details.uanNumber,
      esicNumber: details.esicNumber,
      aadhaarEncrypted:
        details.aadhaar == null ? null : this.cipher().encrypt(details.aadhaar),
      aadhaarLast4: details.aadhaar?.slice(-4) ?? null,
      labourCategoryId: details.labourCategoryId,
      supervisorId: details.supervisorId,
      contactNumber: details.contactNumber,
      gender: details.gender,
      isActive: labour.isActive,
      updatedAt: labour.updatedAt,
      updatedBy: labour.updatedBy,
    };
  }

  async findById(workspaceId: string, id: string): Promise<Labour | null> {
    const row = await this.db.constructionLabourLabour.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: WITH_PROJECTS,
    });
    return row == null ? null : labourFromRow(row, this.cipher);
  }

  async findMany(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Labour[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.constructionLabourLabour.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      include: WITH_PROJECTS,
    });
    return rows.map((row) => labourFromRow(row, this.cipher));
  }

  async codesTaken(
    workspaceId: string,
    codes: readonly string[],
    exceptId?: string,
  ): Promise<Set<string>> {
    const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];
    if (lowered.length === 0) return new Set();
    const rows = await this.db.$queryRaw<{ code: string }[]>`
      SELECT lower(labour_code) AS code
      FROM construction_labour.labours
      WHERE workspace_id = ${workspaceId}
        AND deleted_at IS NULL
        AND lower(labour_code) = ANY(${lowered})
        AND id::text <> ${exceptId ?? ""}
    `;
    return new Set(rows.map((row) => row.code));
  }

  async openingBalance(workspaceId: string, id: string): Promise<number> {
    const sums = await prismaLedger.openingBalances(
      this.db,
      workspaceId,
      "labour",
      [id],
    );
    return sums.get(id) ?? 0;
  }

  async insert(
    items: readonly NewLabour[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.constructionLabourLabour.createMany({
            data: items.map(({ labour }) => ({
              id: labour.id,
              workspaceId: labour.workspaceId,
              createdAt: labour.createdAt,
              createdBy: labour.createdBy,
              ...this.columns(labour),
            })),
          });
          // On each Project from the joining date, with its first history row.
          const joined = items.flatMap(({ labour }) =>
            labour.projectIds.map((projectId) => ({ labour, projectId })),
          );
          await tx.constructionLabourLabourProject.createMany({
            data: joined.map(({ labour, projectId }) => ({
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              projectId,
              since: calendarDateToDb(labour.details.joiningDate),
            })),
          });
          await tx.constructionLabourTransfer.createMany({
            data: joined.map(({ labour, projectId }) => ({
              id: newId(),
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              fromProjectId: null,
              toProjectId: projectId,
              transferDate: calendarDateToDb(labour.details.joiningDate),
              createdAt: labour.createdAt,
              createdBy: labour.createdBy,
            })),
          });
          const [first] = items;
          if (first != null)
            await prismaLedger.post(
              tx,
              first.labour.workspaceId,
              first.labour.createdBy,
              items.map(({ labour, openingBalance }) =>
                openingEntry(labour, openingBalance),
              ),
            );
          for (const audit of audits) await recordAudit(tx, audit);
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      if (isCodeClash(error)) throw labourCodeTaken();
      throw error;
    }
  }

  async update(input: {
    labour: Labour;
    expectedUpdatedAt: Date | null;
    opening: number | null;
    joiningDateChanged: boolean;
    projects?: (ProjectChanges & { date: CalendarDate }) | null;
    audit: AuditEvent;
  }): Promise<void> {
    const { labour, projects } = input;
    try {
      await this.db.$transaction(async (tx) => {
        const joinedOn = input.joiningDateChanged
          ? ((
              await tx.constructionLabourLabour.findUnique({
                where: { id: labour.id },
                select: { joiningDate: true },
              })
            )?.joiningDate ?? null)
          : null;
        const written = await tx.constructionLabourLabour.updateMany({
          where: {
            id: labour.id,
            workspaceId: labour.workspaceId,
            deletedAt: null,
            ...(input.expectedUpdatedAt == null
              ? {}
              : { updatedAt: input.expectedUpdatedAt }),
          },
          data: this.columns(labour),
        });
        if (written.count === 0) {
          if (input.expectedUpdatedAt == null) throw labourNotFound();
          throw labourChanged();
        }
        if (joinedOn != null) {
          // The rows written with the labourer, onto a Project on the old
          // joining date, move to the new one, and so do those Projects.
          const initial = await tx.constructionLabourTransfer.findMany({
            where: {
              labourId: labour.id,
              fromProjectId: null,
              transferDate: joinedOn,
            },
            select: { id: true, toProjectId: true },
          });
          const joiningDate = calendarDateToDb(labour.details.joiningDate);
          await tx.constructionLabourTransfer.updateMany({
            where: { id: { in: initial.map((row) => row.id) } },
            data: { transferDate: joiningDate },
          });
          await tx.constructionLabourLabourProject.updateMany({
            where: {
              labourId: labour.id,
              since: joinedOn,
              projectId: {
                in: initial.flatMap((row) =>
                  row.toProjectId == null ? [] : [row.toProjectId],
                ),
              },
            },
            data: { since: joiningDate },
          });
        }
        if (projects != null) {
          const date = calendarDateToDb(projects.date);
          await tx.constructionLabourLabourProject.deleteMany({
            where: { labourId: labour.id, projectId: { in: projects.removed } },
          });
          await tx.constructionLabourLabourProject.createMany({
            data: projects.added.map((projectId) => ({
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              projectId,
              since: date,
            })),
          });
          await tx.constructionLabourTransfer.createMany({
            data: [
              ...projects.removed.map((projectId) => ({
                fromProjectId: projectId,
                toProjectId: null,
              })),
              ...projects.added.map((projectId) => ({
                fromProjectId: null,
                toProjectId: projectId,
              })),
            ].map((move, index) => ({
              // Removals list before additions in the history.
              id: newId(labour.updatedAt.getTime() + index),
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              ...move,
              transferDate: date,
              createdAt: labour.updatedAt,
              createdBy: labour.updatedBy,
            })),
          });
        }
        if (input.opening != null) {
          await prismaLedger.reverseSource(
            tx,
            labour.workspaceId,
            labour.updatedBy,
            "labour",
            labour.id,
          );
          await prismaLedger.post(tx, labour.workspaceId, labour.updatedBy, [
            openingEntry(labour, input.opening),
          ]);
        }
        await recordAudit(tx, input.audit);
      });
    } catch (error) {
      if (isCodeClash(error)) throw labourCodeTaken();
      throw error;
    }
  }

  async delete(
    labour: Labour,
    audit: AuditEvent,
  ): Promise<"deleted" | "has_records"> {
    return this.db.$transaction(async (tx) => {
      // FOR UPDATE waits for any attendance or payment being written for
      // this labourer (they hold FOR SHARE), so the check below sees it.
      await lockLiveParties(
        tx,
        labour.workspaceId,
        "labour",
        [labour.id],
        "update",
      );
      if (await hasRecords(tx, labour.workspaceId, labour.id))
        return "has_records";
      await tx.constructionLabourLabour.update({
        where: { id: labour.id },
        data: {
          deletedAt: labour.deletedAt,
          deletedBy: labour.updatedBy,
          updatedAt: labour.updatedAt,
          updatedBy: labour.updatedBy,
        },
      });
      await prismaLedger.reverseSource(
        tx,
        labour.workspaceId,
        labour.updatedBy,
        "labour",
        labour.id,
      );
      await recordAudit(tx, audit);
      return "deleted";
    });
  }

  async transfer(
    moves: readonly LabourMove[],
    audits: readonly AuditEvent[],
  ): Promise<void> {
    await this.db.$transaction(
      async (tx: Tx) => {
        for (const move of moves) {
          const { labour } = move;
          // Compare-and-set: a labourer moved or edited meanwhile is refused.
          const written = await tx.constructionLabourLabour.updateMany({
            where: {
              id: labour.id,
              workspaceId: labour.workspaceId,
              deletedAt: null,
              updatedAt: move.loadedUpdatedAt,
            },
            data: {
              updatedAt: labour.updatedAt,
              updatedBy: labour.updatedBy,
            },
          });
          if (written.count === 0) throw labourChanged();
          const left = await tx.constructionLabourLabourProject.deleteMany({
            where: { labourId: labour.id, projectId: move.fromProjectId },
          });
          if (left.count === 0) throw labourChanged();
          await tx.constructionLabourLabourProject.create({
            data: {
              workspaceId: labour.workspaceId,
              labourId: labour.id,
              projectId: move.toProjectId,
              since: calendarDateToDb(move.transferDate),
            },
          });
        }
        await tx.constructionLabourTransfer.createMany({
          data: moves.map((move) => ({
            id: newId(),
            workspaceId: move.labour.workspaceId,
            labourId: move.labour.id,
            fromProjectId: move.fromProjectId,
            toProjectId: move.toProjectId,
            transferDate: calendarDateToDb(move.transferDate),
            remark: move.remark,
            createdAt: move.labour.updatedAt,
            createdBy: move.labour.updatedBy,
          })),
        });
        for (const audit of audits) await recordAudit(tx, audit);
      },
      { timeout: 60_000 },
    );
  }

  today(workspaceId: string): Promise<CalendarDate> {
    return companyToday(this.db, workspaceId);
  }

  async latestAttendance(
    workspaceId: string,
    ids: readonly string[],
    projectId: string,
  ): Promise<Map<string, CalendarDate>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.constructionLabourAttendance.groupBy({
      by: ["labourId"],
      where: {
        workspaceId,
        projectId,
        labourId: { in: [...ids] },
        deletedAt: null,
      },
      _max: { attendanceDate: true },
    });
    const latest = new Map<string, CalendarDate>();
    for (const row of rows)
      if (row._max.attendanceDate != null)
        latest.set(row.labourId, calendarDateFromDb(row._max.attendanceDate));
    return latest;
  }

  async earliestAttendance(
    workspaceId: string,
    id: string,
  ): Promise<CalendarDate | null> {
    const row = await this.db.constructionLabourAttendance.findFirst({
      where: { workspaceId, labourId: id, deletedAt: null },
      orderBy: { attendanceDate: "asc" },
      select: { attendanceDate: true },
    });
    return row == null ? null : calendarDateFromDb(row.attendanceDate);
  }

  async transfers(
    workspaceId: string,
    id: string,
  ): Promise<LabourTransferRecord[]> {
    const rows = await this.db.constructionLabourTransfer.findMany({
      where: { workspaceId, labourId: id },
      orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      fromProjectId: row.fromProjectId,
      toProjectId: row.toProjectId,
      transferDate: calendarDateFromDb(row.transferDate),
      remark: row.remark,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }
}

export function labourChanged() {
  return conflict(
    "LABOUR_CHANGED",
    "Someone else changed this Labour after you opened it. Reload to see their changes.",
  );
}
